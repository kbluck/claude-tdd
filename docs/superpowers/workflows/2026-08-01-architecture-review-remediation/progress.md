# SDD ledger — plan: docs/superpowers/plans/2026-08-01-architecture-review-remediation.md

Iteration 2: Node port + architecture review remediation.
Predecessor ledger: ../2026-07-30-tdd-subagent-workflow/progress.md

## Task 1b: ledger block-diff — COMPLETE

Compared every code block the iteration-1 plan embeds against its shipped
counterpart. Run before Task 3 deletes the bash sources, which is the point:
after that the comparison target is gone.

**19 blocks compared, 10 identical, 8 differ, 1 not shipped (`spec.md`, an
example in the e2e task).**

Both embedding conventions were covered. A first pass matched only
``` `path`: ``` markers and silently missed `agents/tdd-mutate.md`, which the
plan embeds under `Step 3b` — a `Step [0-9]+:` regex does not match `3b`. That
is the empty-glob/zero-iteration failure again: the file simply did not appear
in the output and nothing said so. Caught by comparing the marker count against
the shipped file list.

### Real drift: one defect, two halves — both S2a

| File | Plan-only substantive lines |
|---|---|
| `hooks/lib/rules.sh` | 1 — `*/.)   p="${p%/.}" ;;` |
| `tests/rules.test.sh` | 6 — the three `tdd_normalize_path` trailing-`/.` assertions |
| `tests/guard.test.sh` | 0 |

So the trailing-`/.` fix never landed in either the code or its regression
tests. Not two defects: one fix, both halves missing, exactly as `b97c69f`'s
stat implied. **This is the only plan-to-code drift in the entire iteration-1
build.**

### Differences that are NOT drift

- `agents/tdd-red.md`, `tdd-green.md`, `tdd-refactor.md`, `tdd-mutate.md` —
  identical, all four.
- `hooks/guard.sh`, `hooks/hooks.json`, `tests/fixtures/config.json`,
  `tests/smoke.test.sh`, `.claude-plugin/plugin.json`, `marketplace.json` —
  identical.
- `hooks/lib/rules.sh`, `tests/rules.test.sh`, `tests/guard.test.sh` — the rest
  of the delta is later-task growth. Task 3 embeds the first half of `rules.sh`
  and Task 4 appends `tdd_bash_verdict`.
- `tests/run.sh` — cosmetic only: `FILES`/`FOUND`, `_before`/`BEFORE`, and a
  different failure string. Both guards (zero-assertion, empty-glob) are
  present and functional in the shipped file.
- `commands/tdd.md` — line-wrapping only.
- `.tdd/config.json` — the plan block is the schema template; the shipped file
  is the e2e fixture's config. Different by design.

### Drift in the SAFE direction — worth noting, not fixing

`commands/tdd-init.md` differs by exactly one substantive line, with identical
totals:

```
plan:     go test -run {testId} ./...
shipped:  go test ./... -run {testId}
```

The shipped file is **correct**. This is ledger entry F4 (Go template ordering):
the static prefix is everything before the first `{`, so content after the
placeholder is unenforced, and moving `./...` ahead of `-run {testId}` puts the
placeholder last. The fix reached the artifact and the plan stayed stale — the
reverse of S2a, and harmless. Recorded so nobody "restores" the plan's version.

### Not compared

`skills/run-tdd-cycle/SKILL.md` differs substantially (321 plan vs 338 shipped)
after many fix rounds. It is deliberately out of scope for this audit: SKILL.md
is not a bash source, Task 3 does not delete it, and Tasks 5–9 rewrite it. The
audit exists to beat an expiry that does not apply to it.

**Conclusion.** The iteration-1 "FIXED" record is trustworthy apart from S2a.
Nineteen of twenty defects reached the artifact.

## Task 1: exec-form hook spike — COMPLETE, gate PASSED

All five unknowns answered by observing a real dispatch, not by inference.
Probe registered alongside `guard.sh` (never replacing it) in exec form; 10
records captured, 6 main-thread, 1 subagent, plus sentinel runs.

### 1. `${CLAUDE_PLUGIN_ROOT}` expands inside exec-form `args` — YES

`argv[1]` arrived as `/Users/kbluck/Claude/code/claude-tdd/hooks/spike-probe.mjs`.
Exec form is viable and is the registration the port will use.

**Do not be fooled by the error display.** A blocked call renders the command as
`[node ${CLAUDE_PLUGIN_ROOT}/hooks/spike-probe.mjs]` — the unexpanded
registration string. That is a label, not evidence; `argv` proves expansion
happened.

**`CLAUDE_PLUGIN_ROOT` carries a TRAILING SLASH** (`.../claude-tdd/`) while
`CLAUDE_PROJECT_DIR` does not (`.../claude-tdd`). A trailing separator on the
root is precisely what defeated the prefix strip in iteration 1. The guard reads
`CLAUDE_PROJECT_DIR`, so this is not live today — but anything deriving a root
from `CLAUDE_PLUGIN_ROOT` inherits the bug, and the port must normalise both.

### 2. `agent_type` is still namespaced — YES

`"claude-tdd:tdd-red"`, confirmed under exec form. The namespace strip stays
load-bearing.

Payload key sets differ by caller, and the difference is the guard's whole
dispatch:

- subagent: `session_id, transcript_path, cwd, prompt_id, permission_mode,
  agent_id, agent_type, effort, hook_event_name, tool_name, tool_input,
  tool_use_id`
- main thread: the same **minus `agent_id` and `agent_type`**

The key is **absent**, not null — verified with `hasOwnProperty`, because
"absent" and "present but null" are different facts and conflating them is how a
fail-open hides.

**`tool_input.file_path` arrives ABSOLUTE** even when the agent was given a
relative path: the dispatch asked for `e2e/spec.md` and the payload carried
`/Users/kbluck/Claude/code/claude-tdd/e2e/spec.md`. The path layer should not
assume repo-relative input.

### 3. stdin is readable synchronously — YES

`fs.readFileSync(0, "utf8")` returned 1798 bytes, no `EAGAIN`, parsed clean. No
async accumulation needed.

### 4. exit 2 blocks — YES, but the message channel is STDERR

The first probe wrote its JSON to **stdout** and exited 2. The call was blocked
and the transcript reported **"No stderr output"** — the verdict was dropped.
Rewritten to stderr, the body arrived verbatim, marker `ZQ7-VERBATIM-CHECK`
intact.

So on exit 2 stdout is ignored entirely. The shipped bash guard already does
this correctly (`guard.sh:14`, `>&2`); the spike found it because the probe did
it wrong first. **The spec said "emit the verdict... to stdout" and was wrong.**
Corrected.

### 5. Which interpreter the hook receives — Node 22.23.2

`execPath =
/Users/kbluck/.local/share/fnm/node-versions/v22.23.2/installation/bin/node`,
resolved through the `fnm` multishell entry at the head of the host's `PATH`.
So `.node-version` did reach the hook this session — and the earlier
measurement, where it was an IDE-bundled 24.13.0, showed it need not. Both
observations stand; the guard's own floor check is what makes either safe.

### Gate

PASSED. Exec form works, the payload contract holds, the deny channel is known.
Nothing blocks Task 2.

## Task 2: port the suite to node:test — COMPLETE

`node --test tests/*.test.mjs` → **293 tests, 149 pass, 123 fail, 21 todo**.
Red is the expected state. `bash tests/run.sh` still 181/0 — the bash suite is
untouched and stays the regression net until Task 3 lands.

**API pinned first, by the controller, not the implementer.** `hooks/lib/rules.mjs`
was written as a denying stub before the tests, because the test author and the
implementer agreeing on a module shape is a seam, and seams are where every
fail-open in this project has clustered. Two contracts deliberately differ from
bash: glob lists are arrays (no word splitting, no pathname expansion), and
`toRepoRelative` returns `null` for unplaceable paths with `null` explicitly not
meaning permit.

### Verification — the count was a false signal

Independent bite-check: made `globMatch` unconditionally permissive.

- failure count **before: 29, after: 29** — no movement.
- failing **identities**: 5 negatives newly failed, 5 positives newly passed,
  including both zero-depth `**/` cases.

Counts identical, tests entirely different. Had this been checked by count —
the way the `jq` typo incident was — the conclusion would have been "the
mutation had no effect", i.e. "the tests are vacuous", and that is the opposite
of the truth. **Compare identities, not totals.** The instrument was verified
live (`globMatch now: true`) before trusting the null result, which is what
separated "instrument broken" from "tests inert".

Other checks: all 123 failures are `ERR_ASSERTION`/`ERR_TEST_FAILURE` — zero
import errors, TypeErrors or syntax errors, so every failure is a property not
holding rather than a broken test. The matrix enumerates **exactly 80**
subtests (8 combos × 10 spellings), and asserts both dimensions itself.

### Carried forward

- 3 failures are NOT the stub: `commands.singleTerse` drift between spec,
  fixture and the `/tdd-init` template (×2) belongs to Task 8; `hooks.json`
  still being shell-form belongs to Task 3.
- 20 `test.todo()` entries name guard-level behaviour deferred to Task 3
  (namespace strip, NotebookEdit path key, per-role command selection,
  missing-config, the non-null `commands.mutation` branch). Task 3 must promote
  them; a tripwire test fails once `guard.mjs` exists to force that.
- Drive-letter case is `test.todo()` — genuinely unexercisable on POSIX, and
  recorded rather than fabricated.
- `node --test tests/` (bare directory) fails on Node 22.23.2 with
  `Cannot find module`. Use `node --test` from the repo root, or an explicit
  glob. My brief specified the broken form.

## SDD control block

Normalised completion lines, so a post-compaction controller can parse them:

Task 1: complete (spike, gate PASSED — scaffolding reverted, no source commits)
Task 1b: complete (audit only, result recorded above — no source commits)
Task 2: complete (commits 7ae1b40..fd5689e, verified by mutation not by count)

### KNOWN-RED BASELINE — ruling, pre-flight

3 node:test failures are deliberate and belong to Task 8, not to whatever task
is under review:

1. `commands.singleTerse` declared in the spec's schema block but absent from
   `tests/fixtures/config.json`  (config-contract)
2. the same key absent from the `commands/tdd-init.md` template  (config-contract)
3. `hooks/hooks.json` still shell-form  — closes in Task 3

**Every task review from Task 3 on compares against this baseline, not against
zero.** Compare failing test IDENTITIES, not totals — Task 2 established that a
count can hold steady while every failing test changes.

### Pre-flight scan — second finding, ruled by the controller

`AGENTS.md` documents `bash tests/run.sh` as the way to run the suite, and
Task 3 deletes it. Task 13 owns the AGENTS.md *traps* rewrite, which is a
different edit. Ruling: **Task 3 updates the test-command line only**; the
traps section stays with Task 13. Leaving agents a command that no longer
exists for ten tasks is not an acceptable gap.

## Task 3: port the guard and rules to Node — IN PROGRESS

BASE fd5689e. Implementer `aed6d17d40d81d2d1` (opus).

Commits so far: `932e07a` feat(hook): port the guard and decision rules to node;
`ed67878` test(hook): cover NotebookRead's own path key, not just NotebookEdit's.

Reported DONE_WITH_CONCERNS. `node --test` → 293 tests, 289 pass, 3 fail, 1 todo.
Verified independently, and the failing identities are the two Task-8
`singleTerse` items plus one new. The `hooks.json` shell-form baseline item is
closed.

### Controller adjudication — pre-review, concern 1

`rules.test.mjs:376` "a wrong-case WRITE of a test file is DENIED for red too"
fails. **Ruling: the test is wrong, the implementation is correct.**

`TEST_GLOBS` carries `**/test_*.py`, which is directory-agnostic by
construction — `**` matches `TESTS` literally, whatever its case. No folding is
involved anywhere in the path, so the assertion cannot demonstrate the property
it names. The glob genuinely authorises that write.

Its sibling at :371 (`GREEN write SRC/a.py` → DENY) is correct and does show the
asymmetry, because `src/**` is directory-anchored.

This is AGENTS.md's permissive-catch-all trap **inverted**: a fixture so
permissive that the negative assertion can never hold. Worth adding to the traps
list — the recorded warning is about assertions satisfied coincidentally, and
this is the mirror image, an assertion that cannot be satisfied at all. Both
have the same root cause and the same tell: a `**/`-prefixed glob used where a
directory-anchored one was meant.

Defect originated in Task 2; fixed here because it blocks a clean review.
Implementer resumed with the ruling and instructed that the fix must
**strengthen** the test — still assert DENY, use a directory-anchored glob, and
bite-check by making `pathVerdict` fold on writes and confirming this exact
test fails.

The implementer was right not to edit the test on its own initiative, and right
that the retired bash matcher behaved identically — so this is not a port
regression.

### Task 3 review (opus) — Needs fixes: spec ❌, 1 Important, 3 Minor

Reviewer verified the security-critical claims by execution rather than by
reading the diff: zero-depth `**/`, the case-fold asymmetry, the floor-not-pin
property, and that the rewritten case-fold WRITE test genuinely pins what it
claims. It also ran the named cross-cutting check — nothing operative still
references the deleted bash entry points.

**Important:** out-of-root reads now deny where bash allowed. `toRepoRelative`
returns `null` outside the root and the `relPath` guard fires for both modes,
so a constrained agent reading anything outside `TDD_PROJECT_DIR` is denied.
Undisclosed and untested.

**Controller ruling: deny is CORRECT; the defect is that it is silent and
untested.** A path that cannot be placed inside the root cannot be classified
against the test/source/ignore partition, and the whole read-isolation argument
rests on that partition being exhaustive. An unclassifiable path is the
"check cannot be evaluated" case, and the governing rule is that it must not
reach `allow`. It also closes the class the `/private` symlink residual
belonged to. The ambiguity was mine: the stub doc said "`null` is NOT permit —
the caller decides, and for a write it must deny", which left the read side
unstated.

Note the direction. Every prior finding in this project was a silent *widening*;
this is a silent *narrowing*. It fails safe, which is why it survived — and it
still needed catching, because an undocumented narrowing is how a later
maintainer "restores parity" and reopens the hole.

**Minor 1 upgraded to Important and sent with the fix:** `AGENTS.md:53-54`
claims every retired test file has a `.test.mjs` equivalent; `smoke.test.sh`
does not. A document that misstates the artifact is this repository's signature
defect — three occurrences, one on a security boundary — so it does not get to
be Minor here.

**Deferred minors** (final review should triage):
- Task 3: minor (deferred): `runGuard()` discards stdout, so nothing pins that a
  deny writes nothing there — the exact bug the Tier 0 spike found by accident.
- Task 3: minor (deferred): the version floor is checked first only relative to
  `runGuardBody()`; ESM top-level imports evaluate before it. Safe today; wants
  a comment on `main()` so a future import cannot silently reintroduce
  crash-before-floor-check.

**Controller to verify:** reviewer could not run `npx tsc --noEmit` without
mutating the tree (`node_modules` absent). I re-run it once after the fix round.

Task 3: fix round 1/5 dispatched (2 findings — out-of-root read ruling + test +
spec note; AGENTS.md false claim). FIX_BASE ee58baa.

Task 3: fix round 1/5 (2 addressed, 0 open; commit 9aa322f)
Task 3: complete (commits fd5689e..9aa322f, review clean)

Re-review note worth keeping: the code was already uniform across modes — the
`relPath` guard fired before the write branch all along. The finding was never
about behaviour, only about an undisclosed, untested branch. That is the correct
severity call: an unstated invariant on a security boundary is a defect even
when the code is right, because the next maintainer has nothing to stop them
"fixing" it.

Controller verification for Task 3 (owed to the review's ⚠️): `npm install` then
`npx tsc --noEmit` → exit 0, clean. `node_modules` removed, tree clean.
`package.json` is devDependencies-only with `noEmit`, so the no-build-step
constraint holds.

## Task 4: preflight and /tdd-init learn the interpreter — IN PROGRESS

BASE 9aa322f. Implementer `a51511760d94615e6` (sonnet).
Commits: `590ff6f` fix(skill), `d57c791` fix(command). Suite unchanged at
292 pass / 2 fail (the Task-8 baseline) / 1 todo.

Implementer self-caught a first-draft inversion — it had written that a missing
Node "fails closed", patterned on the retired `jq` wording — and corrected it
against `hooks/guard.mjs` before committing. The shipped text now draws a
sharper distinction than my brief did: too-old-but-present launches the guard,
which denies with exit 2 (fail closed); missing never launches, so PreToolUse
sees a non-2 exit and permits (fail open).

### Task 4 review (sonnet) — Needs fixes: 1 Important, 3 Minor, 1 unowned ⚠️

**Important:** both new bullets tell the orchestrator to read the floor from a
bare relative `hooks/lib/rules.mjs`. `/tdd-init` and `/tdd` run with cwd set to
the *user's target project*, so that path does not resolve. The convention is
`${CLAUDE_PLUGIN_ROOT}` (`hooks/hooks.json:11` already uses it), and the repo
has no precedent for a bare `hooks/` path in orchestrator-facing prose.

Worse than the path: no fallback is stated, so an orchestrator that cannot read
it may skip the comparison, guess a number, or treat the miss as a pass — all
three wrong, and all three the "check cannot be evaluated" trap. Ruled: stop.

**⚠️ unowned, routed by the controller into this fix round.**
`docs/superpowers/specs/...-design.md:195` claims "an interpreter too old to run
the guard fails exactly like a missing one, and both fail open." False, and
**my error** — the shipped prompt text is right and the spec is wrong. Too-old
launches and denies with exit 2; only missing permits.

The reviewer flagged it as belonging to no listed task and declined to assume
Task 5 covered it, which was the right call. I have overridden my own "do not
edit the spec" instruction for this one line rather than deferring it: a false
statement about which direction a security check fails is the defect class this
repo has recorded three times, and leaving it would invite someone to align the
code to the document.

**Deferred minors** (final review should triage):
- Task 4: minor (deferred): item 6 sits behind the full-suite run (item 3), so a
  user with no Node waits through a test run to be told to install it. Spec
  mandates that ordering — compliance, not a defect introduced here.
- Task 4: minor (deferred): "necessary and never sufficient" reads as
  "necessary and never"; meaning is unambiguous, wording is clunky.

Task 4: fix round 1/5 dispatched (1 Important + 1 folded Minor + 1 spec
correction). FIX_BASE d57c791.

Task 4: fix round 1/5 (3 addressed, 0 open; commits bd5561a..0d33cad)

### Task 4: controller error — round-1 ruling reversed in round 2

The round-1 re-review verdicted all three findings addressed, then added an
out-of-scope observation: it had **not** verified that the orchestrator can
resolve `${CLAUDE_PLUGIN_ROOT}`, and declined to assume. I checked from the
orchestrator's own `Bash` tool:

```
CLAUDE_PLUGIN_ROOT: <UNSET>
CLAUDE_PROJECT_DIR: <UNSET>
```

Neither is exported to the orchestrator's shell. `CLAUDE_PLUGIN_ROOT` is set for
the **hook process**, which Claude Code spawns with plugin context — that is
what the Tier 0 spike measured, and **I over-generalised it into a ruling.** The
fix I ordered therefore failed exactly the way the bare relative path failed:
the orchestrator cannot read the file, hits the "unreadable floor → stop" rule,
and preflight dies at a trivial check.

The implementer did what I asked, correctly. The defect is mine.

**Round 2 removes the dependency rather than resolving it.** State the floor as
a literal in both prompts, and add a test importing `NODE_FLOOR` that asserts
the prompts' stated number matches — the same pattern
`tests/config-contract.test.mjs` already uses to pin the schema across three
copies. No runtime path resolution, no environment assumption, and drift fails
at test time instead of mid-preflight in a user's project.

**Lesson, and it is a new shape for this ledger.** Every prior instrument error
here was a *measurement* taken wrongly. This one was a measurement taken
correctly and then generalised beyond what it covered: the spike proved
`CLAUDE_PLUGIN_ROOT` is set **for the hook**, and I read that as "set for the
plugin's code". Scope of a measured fact is part of the fact. The reviewer's
refusal to assume is what surfaced it — an out-of-scope observation, explicitly
non-blocking, which turned out to be the most valuable line in the report.

Task 4: fix round 2/5 dispatched (1 finding — replace the file read with a
stated floor plus a drift test). FIX_BASE 0d33cad.

Task 4: fix round 2/5 (1 addressed, 0 open; commits 2a7fd79..aa261e7)
Task 4: complete (commits 9aa322f..aa261e7, review clean)

Controller bite-check of the new anti-drift mechanism, run independently rather
than trusted: setting `NODE_FLOOR` to 23 failed exactly the two new drift tests,
naming both by identity; restored with zero residual diff. The mechanism has
teeth.

**Deferred minors** (final review should triage):
- Task 4: minor (deferred): the drift test's inline comment cites `22.23.2` as
  the whole-file-grep risk, but the extraction regex requires an `is at least v`
  prefix that `22.23.2` would never match. Line-scoping is correct; the stated
  motivation overstates that specific risk.
- Task 4: minor (deferred): commit `aa261e7` uses scope `hook` for a change
  entirely under `tests/`. AGENTS.md's scope table has no `test` scope, so this
  is defensible but a borderline fit — worth deciding whether the table needs
  one.
- Task 4: minor (deferred): `commands/tdd-init.md:187` still references `jq` as
  a generic JSON-semantics illustration. Harmless, but `jq` is no longer a
  dependency of this plugin and a reader could infer otherwise.

## Task 5: correct the enforcement claim in the prompts — IN PROGRESS

BASE aa261e7. Implementer `a1f421d9116c3767a` (sonnet). Commit `9c2172b`,
all four agent files. Suite unchanged at 294 pass / 2 fail (Task-8 baseline).

### Second controller brief error, caught by the implementer

My brief asserted "Red already receives `publicApi` in its input." False —
`publicApi` is a field Red *emits* in its handover report (`agents/tdd-red.md:64`,
inside the output JSON block), not something it is given. The implementer
checked the file rather than transcribing my claim, and pointed Red at the
channel its own procedure documents instead.

That is two briefs in a row containing a factual error an implementer caught
(Task 4: the fail-open inversion, self-caught; Task 5: this). The pattern is
worth naming: **I am writing briefs from the spec's model of the system rather
than from the files**, and the spec is one abstraction layer up. Verify
role-level claims against `agents/*.md` before asserting them in a brief.

### Adjudication: the "sole enforcement" criterion

My brief said no file in the repository may contain that string. Too literal.
Four instances survive and all are correct:
- the plan's own "Done when" line, stating the criterion
- the spec's historical annotation ("this previously read ... which is false")
- two in the architecture review, which is a historical record

None is a live claim. The intent was that nothing may *assert* sole
enforcement, and that holds. No fix needed.

### Task 5 review (sonnet) — Approved, spec ✅, 0 Critical/Important

Reviewer verified each role's prohibition against `pathVerdict` rather than
accepting the prose, and confirmed `bashVerdict` never inspects command output —
which is why the same zero-denial channel is structurally open to all four
roles, making the extension to Refactor and Mutate correct rather than scope
creep. It also independently confirmed the implementer's divergence from my
brief and that the substitute channel it chose for Red is actually
guard-permitted.

Frontmatter confirmed byte-identical across all four files, so the
`tests/agents.test.mjs` pin against the guard's dispatch table is unaffected.

**Deferred minors** (final review should triage):
- Task 5: minor (deferred): `agents/tdd-green.md:19-21` could read as license to
  report `stuck` immediately on insufficient information, where the designed path
  is only after exhausting `limits.greenAttempts`. Naturally converges anyway,
  but a skimming agent could shortcut the attempt loop.
- Task 5: minor (deferred): `agents/tdd-refactor.md:15-20` names no explicit
  report-schema escape valve, unlike the other three roles. Defensible given
  Refactor's try-then-revert design; a pointer to `blocked`/`reverted` would make
  the four parallel.

Task 5: complete (commits aa261e7..9c2172b, review clean)

## Task 6: resume branch and mutation counter — IN PROGRESS

BASE 9c2172b. Implementer `af22375c2abb30a38` (sonnet). Commit `2dae17f`.
Suite unchanged at 294 pass / 2 fail (Task-8 baseline).

Both fixes verified by the controller before review: `## Decompose` now branches
on checklist existence and explicitly preserves fields it does not itself
populate (`baselines` named), re-surfaces `blocked` items, resumes from the
first non-terminal item, and skips the approval step. The mutation counter
increments at step 7 **before** the branch at step 8, with the reason stated
inline rather than as prose defending an order that invited misreading.

### Concern routed into scope pre-review: knownRed poisoning on resume

The implementer flagged it as pre-existing and outside I1/I2. Fair reading of
the text, but wrong on reachability, and reachability decides ownership:
before this change `## Decompose` was unconditional, so a re-invocation
clobbered the checklist and there was no resume path for preflight step 3 to
interact with. **The resume branch is what makes the interaction live. A latent
defect a change turns reachable belongs to that change.**

The failure: on a resume mid-item, step 3 runs the suite, finds the in-progress
test legitimately red (Red wrote it, Green has not run), asks the user, and
records it as `knownRed` — subtracting it from every later comparison for the
rest of the session. The item can then complete with nothing ever verifying it
went green. A permanent, silent exemption.

Also unspecified: whether step 3 on a resume appends to the loaded `knownRed` or
overwrites it. Both readings live, and they differ.

Ruled: `knownRed` is captured at first-run preflight only — it means "failing
before this run began", a property of the starting tree. A resume loads the
recorded list and does not re-derive it; failures attributable to a non-terminal
item are the expected mid-cycle state; and unattributable failures are a
genuinely different case that must be stated rather than inferred.

**Deferred minors** (final review should triage):
- Task 6: minor (deferred): what a "continue anyway" answer does to a
  re-surfaced `blocked` item is unspecified in both the spec and SKILL.md.
  Genuinely pre-existing, not made reachable by this change.
- Task 6: minor (deferred): the now-unconditional increment means a
  `mutantsAttempted: 0` pass still consumes a mutation round. Self-terminating.

### Task 6 review (sonnet) — Needs fixes: I1/I2 ✅, 2 Important on the carve-out

I1 (resume) and I2 (counter) both verified correct against the spec, with no
scope creep. The reviewer also credited a genuine improvement: the counter's new
three-way branch closes the "survivors found but budget exhausted" combination
the old two-bullet text left to inference.

**Both Important findings are against the carve-out I directed in round 1, and
they share one root cause I missed.**

The checklist item schema is `{id, behavior, status}` — **no `testId`**. Red
reports it, the per-item step uses it (SKILL.md:230), and it is never written
down, so it does not survive the dispatch that produced it. With only `behavior`
available on resume, the implementer necessarily reached for `git log --grep` on
the behavior text and for file-granularity attribution. Both findings fall out
of that:

1. The attribution branch re-asks the user about failures already in the
   recorded `knownRed`, contradicting the sentence directly above it. It fires
   on the *ordinary* resume shape — when no item is `red`, every failure lands
   there — not an edge case.
2. Attribution at file granularity excludes every failure in a touched test
   file, so a co-located test that genuinely regressed is skipped at preflight,
   then surfaces at Green's suite check misattributed to Green's current
   dispatch — reverting correct work, and never telling the user at the point
   the design intends.

Round 2: persist `testId` on the item, order the checks (recorded `knownRed`
first, then the in-progress item's own `testId`, then genuinely new), and drop
`git log --grep` — which also closes the reviewer's Minor that `--grep` is
unanchored BRE.

**The trace lesson, which is the transferable part.** The implementer's Trace C
concluded a test "is already accounted for and not re-flagged" — but no sentence
in the text performed that check. A trace that reaches the right conclusion from
text that does not support it is the exact failure traces exist to catch. I have
asked for re-traces that quote the sentence making each step happen; a step with
no quotable sentence is inference, and the text needs it.

**Deferred minor** (final review should triage):
- Task 6: minor (deferred): "Skip the approval step" is unconditional on any
  checklist with items, and nothing records whether the user ever approved it,
  so an interruption between the write and the approval prompt silently skips
  approval. Asked for a one-line carve-out or an explicit acceptance, not an
  approval-tracking field.

Task 6: fix round 2/5 dispatched (2 Important + 1 Minor). FIX_BASE a7de8c5.

Task 6: fix round 2/5 (2 addressed + 1 minor, 0 open; commit 0a7edd6)
Task 6: complete (commits 9c2172b..0a7edd6, review clean)

Re-review verified the three traces by finding the sentence that *causes* each
step rather than accepting one adjacent to it, and confirmed the buckets are
mutually exclusive by definition — bucket 3 is "neither of the above", the
logical complement, so a failure eligible for bucket 1 cannot fall through.
That is the standard the earlier trace failed, and it held this time.

**Deferred minor** (final review should triage):
- Task 6: minor (deferred): the mutation-pass item-append literal
  (SKILL.md:354-357) omits `"testId": null`, though the schema paragraph now
  says every loop-read field is declared. Functionally inert — Red's outcome
  branch sets it once the item goes `red` regardless of origin — but it reads
  as schema drift. Natural fit for Task 13.

## Task 7: scope the revert to the offending paths — IN PROGRESS

BASE 0a7edd6. Implementer `a9d0476252aebb2d1` (sonnet).
Commits `5e23898`, `9722bae`. Suite unchanged at 294 pass / 2 fail.

### Third controller brief error — and this one is in the spec

The implementer's own advisor pass caught that scoping `clean` to only the
**glob-breaking subset** leaves the same dispatch's legitimate in-glob files in
the tree — reproducing the exact bug the section opens with, a rejected file
surviving into a later commit, just for the half of the dispatch that passed the
glob check. It also moved Refactor's incomplete-restore check and the mutation
pass's tree-clean recovery onto the found-paths branch, since both detect
concrete dirty paths via `git status --porcelain` and the guard keeping them
inside `globs.source` is the same fallible mechanism Preflight item 7 probes.

Both corrections are right, and the error originates with me:
`spec:306` reads "The pathspec is the offending paths the audit reported", and
my brief repeated it. The correct rule is **every path the triggering check
found**. Authorised a scoped spec edit, same reasoning as Task 4 — a design
document contradicting a correct implementation is how someone later aligns the
implementation back to the document, and this boundary has already failed twice.

That is three briefs with a factual error caught by an implementer (Task 4
fail-open inversion, Task 5 `publicApi`, Task 7 this). All three were me writing
from the spec's model rather than from the artifact — and this time the spec
itself was the source, which is the more useful finding: **the spec is not a
safe substitute for the files, including when I wrote the spec.**

**Deferred minors** (final review should triage):
- Task 7: minor (deferred): Refactor's own audit step has no explicit violation
  branch at all. Pre-existing, not introduced here. Natural fit for Task 13.
- Task 7: minor (deferred): `git clean -fd -- <files>` leaves an empty parent
  directory on disk. No branch in the file depends on it being gone.

### Task 7 review (sonnet) — Needs fixes: 1 Important, 2 Minor

Reviewer independently re-enumerated the discard sites and found the same nine —
no site missed, no phantom. Credited the round-2 self-correction, the
re-dispatch-message vs revert-pathspec distinction (different audiences;
conflating them would be wrong in the other direction), and the
`fatal: pathspec did not match` note as a real consequence of moving from glob
pathspecs to single-file ones.

**Important — site 7 (Refactor's hard coverage gate) classified "ordinary" on a
premise that does not hold for Refactor.** The ordinary bucket is justified by
"the dispatch's own audit already passed with nothing flagged", which is true for
Red and Green because both have an explicit `Violation → revert` branch. Refactor
does not: its audit is one clause with no violation branch (SKILL.md:311) — a gap
the implementer's own report names and defers to Task 13.

So the backstop scenario survives at exactly one site: guard fails to launch,
Refactor writes outside `globs.source`, nothing acts on it, the coverage gate
fires, and revert falls back to `globs.source` — which cannot reach the rogue
path. Verbatim the failure this task exists to close.

**The tell was an internal inconsistency in the fix's own reasoning**: the
fallible-guard argument was applied to site 8 (Refactor's incomplete-restore
check) and not to site 7 — same role, same guard. When a fix justifies moving
one site with an argument that also covers a second site it leaves behind, the
gap is in the classification, not the argument.

Fix: use the same `git diff --name-only` / `git status --porcelain` mechanism
already applied at sites 8 and 9. Explicitly **not** adding Refactor's missing
audit-violation branch — that is Task 13's, and widening into it here is scope
creep.

**Deferred minor** (final review should triage):
- Task 7: minor (deferred): `git checkout -- <pathspec>` sits under "Only the
  `clean` half takes a pathspec", resolved a few lines below. Reading-order nit.

Task 7: fix round 1/5 dispatched (1 Important + 1 folded Minor). FIX_BASE c3e0b60.

Task 7: fix round 1/5 (2 addressed, 0 open; commit c9638cf)

### FOURTH instance of "revert does not revert" — EXPOSED by the fix for the third

The implementer surfaced it while building its site-7 trace and correctly
flagged rather than fixed, since it fell outside the round's findings. I
reproduced it before routing:

```
$ git checkout -- tracked.py untracked.py
error: pathspec 'untracked.py' did not match any file(s) known to git
exit=1
$ cat tracked.py
MODIFIED by agent          # <- restored NOTHING
```

Control with the tracked path alone: exit 0, restored.

**Rounds 1-2 exposed it; they did not create it.** Replacing glob pathspecs with literal per-file lists
is what made it reachable: under `tests/**` the pathspec matched tracked files
and `checkout` worked. Under a literal list mixing a tracked-modified path with
an untracked-new one — the ordinary shape of a violating dispatch, since Red's
tests are almost always new files — `checkout` aborts and restores nothing.

Failure shape is the worst available: `checkout` silently restores nothing,
`clean` removes the untracked half, the tree looks partially reverted, and the
tracked modification survives into the next commit. Exactly the section's
founding bug.

It also turns an existing sentence actively misleading: `fatal: pathspec ... did
not match` was documented as "expected", and on a mixed list it now means the
restore did not happen.

**The pattern worth keeping.** Three rounds of careful review scoped this
command pair, and the fix for instance three manufactured instance four inside
the very section documenting the class. A fix that changes the *shape* of an
argument to a command — glob to literal list — changes that command's failure
modes, and reviewing the fix against the old failure mode passes it. None of the
three reviews caught this; the implementer found it only by building an
empirical trace in a throwaway repo, which is the same "found only by running"
route the ledger records for 8 of the first iteration's 20 defects.

Task 7: fix round 2/5 dispatched (1 Critical-shaped regression). FIX_BASE c9638cf.

Task 7: fix round 2/5 (1 addressed, 0 open; commit d038786)

Remedy chosen: retire `checkout` from the mechanism entirely; every one of the
nine sites is now `git reset --hard HEAD` (no pathspec, nothing to abort on)
plus scoped `git clean -fd`. Re-review verified all three checks empirically in
a throwaway repo — including the load-bearing claim that `clean` evaluates each
pathspec entry independently where `checkout` aborts on the whole list — and
confirmed `reset --hard` resetting the index is a safe generalisation here,
since nothing in the file ever stages before a revert fires.

**Implementer self-caught two errors before committing**, and the second is the
more valuable: it had written that git's exit code "varies between runs", then
traced that reading to a `|| true` in its own probe script swallowing the real
status. Sixth instrument error on this project, first one caught by the agent
that made it, and reported as the true behaviour rather than compounded.

It also corrected my causation: I wrote that rounds 1-2 *created* the fourth
instance; they *exposed* it. The abort was always latent in `checkout`'s
literal-pathspec handling and the pre-Task-7 glob masked it. Ledger corrected
above.

Task 7: fix round 3/5 dispatched — retiring `checkout` made the spec false.
`spec:300` still shows `git checkout -- <pathspec>` as the current mechanism and
`:304` still frames the rule as "Only `clean` takes a pathspec".

In scope by the same reachability rule applied to Task 6's concern 1: **a change
that makes a document false owns that falseness.** Worse than ordinary drift
here, because the spec now documents a mechanism just proven to silently restore
nothing on a mixed pathspec — the likely outcome of leaving it is someone
restoring `checkout` from the spec, which is this repository's signature defect
running in reverse.

FIX_BASE d038786.

Task 7: fix round 3/5 (1 addressed, 0 open; commit 1701615)
Task 7: complete (commits 0a7edd6..1701615, review clean)

Six rounds, the most expensive task in the plan. Four distinct defects came out
of a change that was one paragraph on paper, each found by a different
mechanism: my own verification (brief error inherited from the spec), an
independent reviewer (site 7 misclassified), an empirical trace in a throwaway
repo (the `checkout` atomicity abort), and a re-reviewer's out-of-scope note
(the spec left false).

**Deferred minor** (final review should triage):
- Task 7: minor (deferred): the spec's *Reverting a dispatch* now describes four
  distinct failures but gives the `checkout`-atomicity one no ordinal, while the
  next paragraph calls the scoping defect "the third instance". Self-consistent
  on a careful read — the paragraph names its own "first two" — and `SKILL.md`
  separately calls atomicity "a fourth instance", so the two documents do not
  disagree; the spec just never numbers it. Mildly confusing on first pass.

## Task 8: truncate observedFailure — IN PROGRESS

BASE 1701615. Implementer `ae474e464662c0537` (sonnet).
Commits `6fafe0a`, `a4ef236`, `2cfb799`.

**The known-red baseline is closed.** Suite went 294 pass / 2 fail →
**300 tests, 299 pass, 0 fail, 1 todo**. Verified independently. Every failure
carried since Task 2 was this task's, and all are gone; the remaining `todo` is
the POSIX-unreachable drive-letter row from Task 2.

### Task 8 review (sonnet) — "Approved" with 2 Important; treated by severity

Reviewer verified the guard claim against `bashVerdict` rather than the report
(`single`'s prefix `pytest -q` admits `pytest -q --tb=line ...`; delta has no
banned metacharacter), and confirmed the new test spawns a real
`node hooks/guard.mjs` subprocess against the actual fixture rather than
restating the claim. It credited a loophole the implementer closed unasked:
Red is now forbidden from re-running with a verbose flag "for your own
reference", which would have satisfied the letter of the terse rule while still
privately reading the full output.

The verdict line said Approved while the findings were Important. **I ruled by
severity, not by the label** — the skill's rubric makes Important mean "cannot
be trusted until fixed", and both findings land on this repository's signature
defect: a document asserting more confidence than its evidence.

1. `commands/tdd-init.md:45-50` states as flat fact that cargo's and go's
   default output never reproduces test source — same register as the
   doc-cited pytest row — while the implementer's own report concedes it could
   not point at a doc page. The premise is probably right (cargo reports a panic
   message and location; go reports `t.Errorf` with file:line), but a user sees
   identical confidence for a verified row and an inferred one, and if the
   inference is wrong the degradation never fires and Green silently gets more.
   Fix is to make the basis visible, not to go verify three toolchains.
2. `singleTerse === single` is sound behaviour but an unmotivated artifact: the
   committed config shows two identical strings with the rationale living only
   in init-command prose. The implementer named this risk itself — "invites a
   'just null it out' cleanup" — and the mitigation chosen does not travel with
   the artifact. JSON cannot carry a comment, so `/tdd-init` states it where the
   user is already reading.

Folded in one Minor: `singleTerse` was missing from the config-contract test's
present-even-if-null list, though it now carries identical null semantics to
`coverage`/`complexity`/`mutation`. Absent-versus-null is the distinction that
list exists to enforce.

Explicitly out of scope: verifying jest/vitest/dotnet flags. Leaving them null
with the degradation reported was correct, and a rushed citation is worth less
than an honest hedge.

Task 8: fix round 1/5 dispatched. FIX_BASE 2cfb799.

Task 8: fix round 1/5 (3 addressed, 0 open; commits d8b7123..552bf9d)
Task 8: complete (commits 1701615..552bf9d, review clean)

Final: **301 tests, 300 pass, 0 fail, 1 todo.** Suite fully green.

The re-review's third check is worth keeping as a method. Asked whether the new
presence assertion was a duplicate of the drift check, it built the
counterfactual rather than reasoning from the names: if the spec's schema block
ever loses `commands.singleTerse` while the fixture also lacks it, the drift
check passes *trivially* — the key is not in `specKeyCounts` to be checked —
while the presence loop still fails independently. Two invariants, not one, even
though deleting the fixture key trips both at once. "Do these fail together
today?" is the wrong question; "can either pass while the other fails?" is the
right one.

Resolution of both Important findings landed better than asked: the cargo/go
hedge and the `singleTerse === single` rationale are now spoken to the user at
Step 5 — *before* they approve the config, rather than after it is written.

### Task 9 review (sonnet) — Approved, spec ✅, 0 Critical/Important

Reviewer traced both paths against the *causing* sentences rather than the
report's paraphrase, and confirmed the carve-out is drawn at the right
discriminator: **read-vs-execute, not token identity.** A test that `require`s
its subject and calls it never surfaces the loaded value as text; a test that
`open(`s a source path and prints, returns or asserts on the raw text has read
source. That distinction is what keeps the detector from firing on every
ordinary Red test.

It also verified the two edits to *Reverting a dispatch* — the section that cost
six rounds in Task 7 — are minimal and leave it coherent: "is by definition"
softened to "for most of the checks below", one parenthetical naming the
exception, and the "five sites" count and "two cases, not one" framing preserved.
The implementer spotted that a content-scan hit lands *inside* `globs.test`,
which breaks the assumption that every violation sits outside the role's glob.
That assumption was load-bearing for Task 7's scoping and nobody had noticed a
new violation type would invalidate it.

**Deferred minors** (final review should triage; first one routed to Task 13):
- Task 9: minor (deferred) → **Task 13**: the spec names four tokens uniformly as
  hit-triggers (`open(`, `require(`, `include`, `File.read`); the skill demotes
  `require(`/`include` to "not, on its own, a hit". The carve-out is correct and
  necessary, so the spec is the side that is now too absolute.
- Task 9: minor (deferred): SKILL.md calls it "the one channel the guard cannot
  see" where the spec's threat model names three. Reads as "the channel this scan
  targets" in context, but loose for a document being scrubbed for precision.
- Task 9: minor (deferred): the carve-out's "combined with the pattern above" is
  under-specified at the boundary. Failure mode is a false *negative* on a
  heuristic already disclosed as incomplete, not a false positive.

Task 9: complete (commits 552bf9d..5753fcb, review clean)

## Task 10 — complete (commits 5753fcb..0e352b9, review clean)

Suite: **304 tests, 303 pass, 0 fail, 1 todo.**

### Plan-ledger drift, found by the implementer

Part 2 of this task — the missing-config test — had **already been delivered by
Task 3**, because my Task 3 brief said to promote all 20 `test.todo()`
placeholders in `tests/guard.test.mjs` and one of them was explicitly titled for
Task 10. The implementer bite-checked the existing test rather than duplicating
it, then implemented only part 1.

The reviewer independently re-verified that judgment rather than accepting it,
and confirmed `tests/guard.test.mjs:349-359` genuinely satisfies the
requirement: a truly empty sandbox built with raw `mkdtempSync` (not the
fixture-seeded helper), exit 2 asserted, and `stderr` matched against
`/\/tdd-init/` — the message, not just the boolean. `hooks/guard.mjs:140-144` is
the only site emitting that string, checked directly.

**Controller error worth naming:** "promote all the todos" was a convenient
instruction that quietly reassigned scope across task boundaries. It caused no
harm here — the work was done correctly and the ledger now records where — but
a task that silently absorbs a later task's deliverable is how a plan stops
describing the build. I checked the remaining tasks for the same overlap:
README (Task 11), e2e automation (Task 12), `.tdd/phase` removal and the
`baselines` schema field (Task 13) are all genuinely undone.

**Deferred minor** (final review should triage):
- Task 10: minor (deferred): `tests/config-contract.test.mjs:190` calls
  `.includes()` on a possibly-null block without the `?? ''` guard used at :195.
  Cannot occur today; if the start anchor were renamed it would surface as a
  TypeError stack trace instead of the authored "end anchor no longer matching"
  message. No false pass either way.

## Task 11 — complete (commits 0e352b9..50a6f72, review clean)

Suite: **307 tests, 306 pass, 0 fail, 1 todo.**

README written; `marketplace.json`'s duplicate `version` dropped so `plugin.json`
is the single source, pinned by `tests/version-contract.test.mjs`.

Reviewer re-fetched both official plugin-doc URLs itself rather than accepting
the implementer's investigation, and confirmed two things independently: a
relative-path `source` has **no exclusion fields at all**, so "ship the whole
repo" is a platform limitation and not a project oversight; and the documented
version precedence (`plugin.json` → marketplace entry → git SHA) makes dropping
the marketplace copy safe rather than merely tidy. It also verified the README's
enforcement claims line-by-line against the spec's threat model and found no
overclaim — the one risk this task actually carried.

**Deferred minors** (final review should triage):
- Task 11: minor (deferred): the degradation table now exists in three prose
  copies (spec, `tdd-init.md`, README) with nothing binding them, unlike the
  schema block which `config-contract.test.mjs` pins. The three already differ in
  wording — "CRAP trigger gone" vs "unavailable", `singleTerse` phrased three
  ways — with no factual contradiction yet. Same drift class the schema had.
- Task 11: minor (deferred): README's "Known limitations" reproduces 4 of the
  spec's 6 bullets; a selective restatement presented as a short list.
- Task 11: minor (deferred): `config.version` is still written by `/tdd-init` and
  read by nothing. Left deliberately — inert, not a fail-open, and wiring it up
  is hook logic outside this task.

## Task 12: promote e2e to an automated smoke test — IN PROGRESS

BASE 50a6f72. Implementer `af9d285bf487f9366` (sonnet).
Commits `4246ee5`, `5b71676`, `2a3a566`.

`npm run smoke` — 11 checks, 11 pass, exit 0, tree clean afterwards. Verified
independently. `node --test` unchanged at 307/306/0/1, ~1.5s.

The out-of-glob case asserts **both directions**: the pre-Task-7 regression
(glob-scoped `clean` cannot reach the rogue file) and the post-fix behaviour.
A check that passes before and after a fix detects nothing; this one does not.
It also pins the `git clean -fd` mixed-pathspec semantics Task 7's whole remedy
rests on.

Honest split declared: the live `/tdd` resume is **scaffolded, not automated** —
a subagent cannot dispatch `tdd-*` subagents. That row is genuinely unexercised
and is documented as such rather than blurred.

### Task 12 review (sonnet) — Needs fixes: 3 Important, 4 Minor

1. **The report's comparator bite-check does not reproduce.** Claimed
   "8 pass / 2 fail" on neutering `checkResumePreserved`; the reviewer
   reproduced it and got **3** checks failing. The mechanism is *more* robust
   than claimed — but a verification number that does not reproduce is exactly
   the "read the exit status, not the pass count" failure this ledger records.
   Worth noting the shape: the error was in the direction of *understating*
   robustness, which is why nobody would have questioned it.
2. **`prepareResumeScratch()` leaks real repo state on any setup failure.**
   `git worktree add` registers an entry in the **real** repo's
   `.git/worktrees/`; anything throwing between that and the `return` happens
   before `cleanup` is constructed, and the caller destructures `cleanup`
   before its `try`. Orphaned worktree registrations do not appear in
   `git status --short`, only in `git worktree list` — silent accumulation.
   This is precisely the "all paths including error paths" case I asked the
   review to confirm, and the implementer's own earlier safety fix had covered
   only teardown.
3. **Two checks pass vacuously when the process never ran.**
   `assert.notEqual(result.status, 0)` is true when `spawnSync` returns
   `status: null` because it could not spawn at all. Masked today by the venv
   check failing first — luck, not design.

Folded in one Minor: `git add -A` inside the scratch worktree. Rationale does
not bite there, but the file set is deterministic and this repo has a recorded
incident of a broad `git add` committing pytest bytecode.

Deferred: unasserted `EXPECTED.testCommand`, unvalidated `targetDir` override,
SIGKILL untrappable (acknowledged, not actionable).

Task 12: fix round 1/5 dispatched. FIX_BASE 2a3a566.

Task 12: fix round 1/5 (4 addressed, 0 open; commit 527b3b8)
Task 12: complete (commits 50a6f72..527b3b8, review clean)

Re-review confirmed the bite-check correction arithmetically (11 total − 3
`verdict.ok === false` assertions = 8 pass) and cross-checked the "stale
evidence" explanation against git history rather than accepting it — the third
bite-check was present from the first commit, so the shipped code was always
correct and only the report's prose was wrong.

It also went past the demonstrated case on the setup-leak fix: rather than
confirm the injected-throw demo, it asked whether a *sibling* branch stayed
open, found that `cleanup()` is called from `catch` without its own guard, and
then **empirically tested reachability** — created a worktree with staged,
deleted-tracked and untracked state and ran `git worktree remove --force`
against each, all exit 0. So the swallow needs an infrastructure fault, not any
state this script can produce. That is the right way to size a residual: not
"could this throw in principle" but "can anything here make it throw".

**Deferred minors** (final review should triage):
- Task 12: minor (deferred): `cleanup()` invoked from `catch` without its own
  try/catch — a double fault would swallow the original error and could leak the
  worktree. Empirically unreachable from this script's own operations.
- Task 12: minor (deferred): `EXPECTED.testCommand` recorded but never asserted.
- Task 12: minor (deferred): `prepareResumeScratch(targetDir)` accepts an
  unvalidated override with no guard against `REPO_ROOT`; no call site passes one.

**STILL UNEXERCISED, and only a human can close it:** the live `/tdd e2e/spec.md`
resume. `AGENTS.md` documents the 5-step procedure against a prepared scratch
worktree. Nobody has run it.

## Task 13 — complete (commits 527b3b8..be4df01, review clean)

Six scoped commits; suite 307 → **326 tests, 325 pass, 0 fail, 1 todo**; smoke
11/11. All eight brief items plus the three reviewer-routed items either fixed
or correctly identified as already-done with evidence that held up.

Two "already done" claims verified by the reviewer against the live repo rather
than the diff: the `..`-in-Bash-delta rejection landed in Task 3 (`git log -S`
confirms), and `globs.ignore` was already in both fixtures with a contract
assertion. Neither was re-implemented — the right outcome for a cleanup task
whose main hazard is redoing work.

**Deferred minors** (final review should triage):
- Task 13: minor (deferred): `tests/rules.test.mjs:474-479` carries a stale
  comment saying the `..`-traversal test "is expected to stay red past Task 3
  until Task 13 closes it". Timestamps show the fix landed 50 minutes after the
  comment, in Task 3. It now misattributes a fix to Task 13 — the exact
  document-does-not-match-artifact pattern the Traps section it sits beside
  warns about, one file from where the implementer was working.
- Task 13: minor (deferred): a report line miscounts a `.gitignore` duplicate's
  position (169 vs 172). A claim about a file deliberately not touched.

## Task 14: record the decisions — IN PROGRESS

BASE be4df01. Implementer `aa1a2a7e18b39765b` (sonnet). Commit `79b7f7a`.
Suites: `node --test` 326/325/0/1; `npm run smoke` 11/11.

Three decisions confirmed already recorded and correctly **not** restated (plan
preamble; spec "Decided, not open"; spec *Why the guard is written in Node*).
Four lessons added to `AGENTS.md`. M2 was folded into the existing *A green
suite is not evidence* section as the principle behind the instances already
there, rather than given a competing heading — the right call.

### Task 14 review (sonnet) — Needs fixes: 1 Important

The added *scope of a measured fact* entry misattributes the over-generalisation
to **Task 4's brief**. It was my **round-1 fix ruling**. The original brief used
a bare relative path; the `${CLAUDE_PLUGIN_ROOT}` generalisation was the remedy I
ordered in response to the reviewer's finding — `progress.md:387-406`, "I
over-generalised it into a ruling... The defect is mine." The sentence was also
internally inconsistent, closing with "the same one a bare relative path had
already been rejected for", which only parses if the subject did not already
contain `${CLAUDE_PLUGIN_ROOT}`.

This ledger separates "controller brief error" from "controller ruling
reversed" on purpose. Collapsing them in the one document whose job is precise
fault-localisation undercuts the lesson.

**The entry committed the error it describes, inside the description.** Not an
argument for softening the correction — the argument for making it exact.

Everything else verified: every ledger quote verbatim or faithfully
paraphrased, "six more times" checked against both readings and not inflated,
no duplication, plan and spec untouched.

Task 14: fix round 1/5 dispatched. FIX_BASE 79b7f7a.

Task 14: fix round 1/5 (2 addressed, 0 open; commit 6cce7b9)
Task 14: complete (commits be4df01..6cce7b9, review clean)

Re-review cross-checked the corrected attribution against `progress.md:337-406`
line by line and confirmed it now matches the ledger's own fault-localisation:
brief used a bare relative path → reviewer flagged it → **controller's round-1
ruling** substituted `${CLAUDE_PLUGIN_ROOT}` → also unreadable, different
reason. The internal inconsistency is gone and the sequence is stated in order.

## ALL 14 TASKS COMPLETE

Branch `feat/03-rewrite-hooks-node`, 49 commits from merge-base `aacc69d`.
`node --test` → 326 tests, 325 pass, 0 fail, 1 todo.
`npm run smoke` → 11 checks, 11 pass, 0 fail.
Tree clean.

29 deferred minors recorded above for final-review triage.

**Not closed, and only a human can close it:** the live `/tdd e2e/spec.md`
resume. `AGENTS.md` documents the procedure against a prepared scratch worktree.
It has never been run by anyone.

## FINAL WHOLE-BRANCH REVIEW (opus) — 0 Critical, 1 Important, 2 Minor

**Important:** two security-load-bearing config strings pinned by nothing — the
agents' `tools:` frontmatter and `hooks.json`'s `matcher`. The spec makes the
*absence* of `Grep`/`Glob` load-bearing (they sit outside the matcher, so such a
call never reaches the guard, and `Grep` returns file content), and
`tests/agents.test.mjs` pinned `name:` but never `tools:`. This is the original
review's T6, which the plan accepted — the final reviewer was right that it is
the highest-value remaining gap and ~15 lines to close.

Minors: `.mcp.json` (a developer-machine MCP pointer) tracked and shipping via
`source: "./"`; two stale present-tense "expected to be RED" comments.

**Deferred-minor triage: 0 must-fix, 5 already resolved, 24 carry.** Five ledger
`(deferred)` tags above are stale — the items were fixed by later tasks.

## FINAL FIX WAVE — complete (commits 6cce7b9..43f038d)

Six commits. `node --test` → **332 tests, 331 pass, 0 fail, 1 todo**.
`npm run smoke` → 11/11. `.mcp.json` untracked via `git rm --cached`, still on
disk, gitignored.

**The compositional gap is the finding worth keeping.** The implementer's own
advisor pass caught that its two new tests were each self-consistent but never
cross-checked: narrowing `hooks.json`'s matcher *and* `guard.mjs`'s
`TOOL_DISPATCH` together in one edit would slip past both. It added a third,
independent subset test. The re-reviewer **reproduced the counterfactual** in an
isolated copy — dropped `Bash` from both, and only the third test fired.

Two tests that each pass, protecting a relationship neither one covers, is a new
shape for this ledger: not a fail-open in a branch, but a fail-open *between*
assertions. It is the test-suite form of "defects cluster at the seams between
components".

## ITERATION COMPLETE

Branch `feat/03-rewrite-hooks-node`, 55 commits from merge-base `aacc69d`.
Started: 181 bash assertions, no automated e2e, guard failing open on Windows.
Ends: 332 node:test assertions + 11 smoke checks, 0 failures, guard on Node 22.
