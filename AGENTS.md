# AGENTS.md

Everything about *what this plugin is and how it is meant to work* lives in the spec and the plan. This file holds only what those
documents cannot tell you: how to work in this repository, and the traps this project has already fallen into.

Read before changing anything substantial:

- `docs/**/specs/*.md` — the design contract.
- `docs/**/plans/*.md` — task-by-task detail. The current iteration is `2026-08-01-architecture-review-remediation.md`.
- `docs/**/reviews/*.md` — independent review findings.
- `docs/**/workflows/*/progress.md` — the ledger: every defect found, how, and what it cost.
- `.claude/.remember/*.md` — memories from prior sessions.

## Repository state you will trip over

`.tdd/config.json` **exists on disk and is gitignored** (`.gitignore:173`). It describes the `e2e/` fixture, not the plugin. So a
`tdd-*` dispatch here is guarded normally against the fixture's globs — `tdd-red` writing `e2e/tests/test_new.py` is **permitted**;
reading `e2e/src/**` is denied. It does **not** deny everything with "run /tdd-init"; that only happens if the file is absent.

The suite does not depend on any of this: it copies `tests/fixtures/config.json` into a sandbox and points the guard there with
`TDD_PROJECT_DIR`.

**The ledger exists twice, and only one copy is in git.** `docs/superpowers/workflows/<iteration>/` is the committed archive —
what a fresh clone gets, and what to cite. `.superpowers/sdd/<iteration>/` is the live scratch directory the SDD skill writes to
during a run, and it is gitignored (`.gitignore:22`). The two were identical the moment the archive landed and nothing keeps them
in sync afterwards, so an iteration in progress diverges from its archive until it is committed again. Cite the committed path;
read the scratch copy only when you are the one mid-run.

## Commits

Conventional Commits — use the `conventional-commits` skill.

**Stage explicit paths. Never `git add -A`** — a subagent may be mid-edit. This clobbered implementer attribution once (`212fa6b`),
and a broad `git add e2e` committed pytest bytecode another time.

**Do not edit `.gitignore` mid-cycle.** The commit audit assumes a clean tree; an unrelated edit pollutes it.

One type and scope per commit; split when a change spans two. Every type except `chore` takes a scope:

| Scope | Covers |
|---|---|
| `plugin` | the whole project, or the plugin config |
| `spec` | the specification |
| `plan` | the task plan |
| `agent` | subagent definitions |
| `command` | slash commands |
| `hook` | hook scripts |
| `skill` | skill definitions |

## Tests

```bash
node --test                # whole suite, run from the repo root, exits non-zero on any failure
```

`node --test` (no args) discovers every `tests/**/*.test.mjs` file. Point it at one file (`node --test tests/rules.test.mjs`) or
add `--test-name-pattern <regex>` to narrow further; the suite is fast enough that neither is usually necessary.

The bash harness (`tests/run.sh` sourcing `tests/*.test.sh`) is retired — Task 3 deleted it along with `hooks/guard.sh` and
`hooks/lib/rules.sh`, the files it existed to test. Four of its five test files (`agents`, `config-contract`, `guard`, `rules`)
have a `.test.mjs` equivalent under `node:test`. The fifth, `tests/smoke.test.sh`, needed no successor: it tested only the bash
harness's own `assert_eq`/`assert_contains` functions, not anything about this plugin — `node:test`'s assertions are Node's own
and need no such self-test.

## Running the plugin against itself

`e2e/` is a pytest fixture for exercising the workflow end to end. Run `/tdd-init` (it detects the fixture), then `/tdd e2e/spec.md`.
The venv at `e2e/.venv` needs `pytest`, `pytest-cov`, `radon` and `mutmut`.

**`e2e/` is also wired into a headless smoke check — `npm run smoke` (`node e2e/smoke.mjs`).** It is a separate entry point,
deliberately not part of `node --test`: it needs the pytest venv and spawns real `git` subprocesses, and the unit suite's job is
to stay under a second, not to shell out. It diffs the fixture's recorded outcome (`e2e/expected-outcome.json`) against a fresh
run, seeds a real regression and confirms the configured test command catches it, and exercises the Task 6 (resume) and Task 7
(out-of-glob revert) fixes this review added — see the header comment in `e2e/smoke.mjs` for exactly which cases are automated
versus scaffolded for a live session, and `docs/superpowers/workflows/2026-08-01-architecture-review-remediation/task-12-report.md`
for the full breakdown.

**A subagent cannot dispatch `tdd-*` subagents, so the resume case needs a human (or a main-thread session) to actually run it.**

**Run once, 2026-08-03, and it paid for itself on the first try.** Preflight classified the interrupted state's *own* red test
into bucket 3 and offered to baseline it — because a pytest collection error names a bare file (`ERROR e2e/tests/test_subtract.py`,
no `::`), and bucket 2 was an exact `path::name` comparison that could never match one. That is the ordinary mid-cycle shape, not
an edge case: Red writes a test importing a symbol Green has not created yet. Fixed. Two instruments had passed over it —
`checklist-invariants.mjs` and four smoke checks — because none of them could fail on it. **The run was stopped at preflight item
3 by the operator, so nothing past preflight has ever been exercised: no Red, Green, Refactor or Mutate dispatch on a resume.**
Steps 3 onward below remain unproven.

1. `node e2e/fixtures/prepare-resume-scratch.mjs` — builds a detached scratch git worktree whose `e2e/` matches the interrupted
   state `e2e/fixtures/checklist-resume-seed.json` describes (add() done, subtract()'s test written but unimplemented, divide()
   untouched) and seeds `.tdd/checklist.json` there. Prints the worktree path and the remaining steps.
2. `cd` into the printed path. `.tdd/config.json` is gitignored, so the worktree starts without one — run `/tdd-init` if it is
   missing (or copy one from a project whose globs already cover `e2e/`).
3. In a live Claude Code session with that worktree as the project, run `/tdd e2e/spec.md`. Confirm it resumes — no fresh
   decomposition, no re-approval prompt for the two items that already have state — rather than overwriting the checklist.
4. After it advances at least one item, run
   `node e2e/lib/checklist-invariants.mjs e2e/fixtures/checklist-resume-seed.json <worktree>/.tdd/checklist.json`. It confirms
   terminal items and their `testId`s are unchanged, that `knownRed` and `mutationRoundsRun` never regress, and that a
   non-terminal item's `testId` is never cleared. **It does not validate the *format* of anything** — for a non-terminal item it
   requires only that a `testId` be truthy, which is exactly why it passed over the seed's own invalid, `e2e`-relative IDs for
   the whole of iteration 2. A green run here is not evidence the checklist is well-formed.
5. `git worktree remove --force <worktree>` to clean up.

---

# Traps

Every item below was paid for. Iteration 1 recorded twenty defects across its own build — twelve found by review, eight only by
running — plus six more from an independent architecture review that document review had passed over roughly forty times.
Iteration 2 (the Node port and the remediation it carried) did not close the book: Task 7 alone took six review rounds and
surfaced four distinct defects from a change that was one paragraph on paper. The instruments changed — bash gave way to
`node:test`, `jq` is gone, the guard is a module instead of a sourced script — but the shape of what gets missed did not: found
late, found by running or by an independent reviewer, rarely by a first read.

## A green suite is not evidence

**The principle underlying this section (M2), stated once so it does not have to be rediscovered:** "green" from a harness that
cannot distinguish "no assertion failed" from "no assertion ran" is not evidence. History, from the retired bash harness: a
one-character `jq` filter typo once deleted 46 assertions from a run, and the suite reported "122 passed, 0 failed" —
healthy-looking. The root cause — a harness with no notion of what the count *should* be — was identified early in iteration 1's
build and then carried as a deferred minor for five tasks while that class of defect recurred six more times before a structural
fix landed. `node --test` is a different harness with its own version of the same trap; see the empty-match paragraph below.
*Compare failing identities, not failing counts*, further down this section, is the same family one layer removed: a count that
cannot move even though the tests behind it changed completely.

`node --test` is more robust than the retired bash harness in one respect worth naming: a file that throws before registering any
tests does **not** take the rest of the suite down with it. Verified — a three-file run where the middle file threw at collection
time still ran the other two and reported `pass 2 / fail 1`, exit 1. The old harness's `set -uo pipefail` failure mode, where one
unbound reference silently killed every file after it, does not have a `node:test` equivalent as far as this project has measured.
Do not assume further than that; nobody has fuzzed the runner's other edges.

What `node --test` does **not** guard against: an empty match. `node --test` given a glob or path that resolves to zero files
prints `tests 0 / pass 0 / fail 0` and **exits 0** — verified directly. That is the exact "empty glob reports success" failure the
retired harness used to catch on purpose; `node:test` itself does not, so a typo'd `--test-name-pattern` or a moved file that
silently drops out of the discovered set reads as a clean run. Always run the whole suite (`node --test`, no args, from the repo
root) as the check that actually matters, and treat a filtered run as a convenience, never as the verification.

**`node --test tests/` (a bare directory) is not the same as `node --test`.** It does not discover the suite — it throws
`Cannot find module` and exits 1. Loud, not silent, but still a wrong command that looks plausible; use no args from the repo
root, or an explicit glob.

**Compare failing identities, not failing counts.** Verified on this project: making `globMatch` unconditionally permissive left
the failure count unchanged at 29 before and after — but every failing test was a *different* test, five negatives newly failing
and five positives newly passing. A count-only check would have read that as "no effect" and missed the mutation entirely, in
either direction it could have been wrong. The same shape recurred at the report level, not just the test level: a fix-round
report claimed a bite-check produced "8 pass / 2 fail"; reproducing it independently got 3 failures, not 2 — the mechanism was
*more* robust than claimed, caught only because the number was checked rather than trusted.

- After editing a test file, **confirm the passed-count actually moved**, then confirm the *identities* that moved are the ones
  you expected.
- **Bite-check**: break the thing on purpose and confirm the exact assertions you expect fail — by name, not by count.
- Beware the **vacuous pass**: an assertion satisfiable by a permissive catch-all (`**/test_*.py` matches almost any test name)
  proves nothing. Name fixtures so they cannot be satisfied coincidentally — `helpers.py`, not `test_helpers.py`.
- Its mirror image bit this project too: an assertion built on a glob so permissive it **cannot fail either**. A directory-agnostic
  `**/test_*.py` cannot demonstrate a case-folding asymmetry no matter how the code behaves, because it matches the wrong-case path
  regardless. Same root cause as the catch-all above — a `**/`-prefixed glob used where a directory-anchored one was needed — same
  tell: check what a negative assertion would need to be true to fail, not just whether it currently passes.
- A derived loop that enumerates nothing contributes zero assertions and looks identical to one that passes — still true under
  Node. `SKILL.md`'s mutation pass names this directly: "Do not dispatch with an empty target list; that guarantees
  `mutantsAttempted: 0`," and "`mutantsAttempted: 0` is a failed pass, not a clean one."

## Reads fail open; writes fail closed

This is the single most productive question to ask of any branch in this codebase:

> **What reaches `allow` when the check cannot be evaluated?**

Writes are an allowlist: a failure to match denies, loudly. Reads are a denylist: a failure to match **permits, silently, and
leaves no trace in any diff**. So every defect on the read path is invisible, and every one of them has been found late.

Seven fail-opens were found in the first iteration. They cluster **at the seams between components** — where one function's output
becomes another's input and neither owns the empty case. Generic review prompts approved every one of those diffs; reviewers only
found them when told which direction the asymmetry ran. The Node port kept the discipline live rather than retiring it: an
out-of-root path now denies on *read* as well as write (`toRepoRelative` returning `null`), a deliberate narrowing from the retired
bash guard's behaviour — the governing rule applied in the direction it had never been tested before.

## Fixing the document about the artifact is not fixing the artifact

Three occurrences in iteration 1. The third landed on a security boundary: commit `b97c69f`, labelled `fix(plan): normalise a
trailing /.`, touched the plan and the spec and never `hooks/lib/rules.sh`. The ledger recorded it FIXED; the bypass stayed live.

**A fix is not done until `git show --stat` names a file outside `docs/`.**

## A change that makes a document false, or a latent defect reachable, owns it

A scope-boundary ruling, used twice in iteration 2, both times to pull a fix *into* the task under review rather than deferring
it as pre-existing:

- **Task 6 (resume branch).** Before this task, `## Decompose` was unconditional, so a re-invocation clobbered the checklist and
  there was no resume path for preflight's `knownRed` capture to interact with. The implementer flagged a `knownRed`-poisoning
  failure on resume as pre-existing and out of scope — a fair reading of the text, but wrong on reachability. **The resume branch
  is what makes the interaction live. A latent defect a change turns reachable belongs to that change.**
- **Task 7 (retiring `git checkout`).** The fix that closed the fourth "revert does not revert" instance (below) made the spec
  false: it still described `git checkout -- <pathspec>` as the current mechanism. **A change that makes a document false owns
  that falseness** — the same reachability rule, applied to prose instead of code. The risk of leaving it was concrete, not
  cosmetic: the spec would have kept documenting a mechanism just proven to silently restore nothing on a mixed pathspec,
  inviting someone to restore it from the document later — this repository's signature defect, running in reverse.

Both times "not what this task's brief asked for, defer it" was defensible on a narrow reading and wrong in practice. Ask
reachability, not authorship: does *this* change make a defect exploitable, or a document false, that was not before? If yes, it
owns the fix regardless of which task's brief mentioned it first.

## The spec is not a safe substitute for the files

A different failure mode from *Fixing the document about the artifact is not fixing the artifact* above, on the other side of the
same boundary: not a fix that stopped at the document, but a **brief** — written to guide an implementer — asserting something
false about the system because it was written from the spec's account of the code rather than from the code. Three separate
instances landed in iteration 2's task briefs, each caught before it did damage, none by the person who wrote it first:

- A brief asserted a missing interpreter "fails closed" — the implementer checked `hooks/guard.mjs` before committing and found
  the opposite, self-corrected.
- A brief asserted Red "already receives `publicApi` in its input" — false; `publicApi` is a field Red *emits*, not one it is
  given. The implementer checked `agents/tdd-red.md` rather than transcribing the claim.
- The spec itself stated the revert pathspec is "the offending paths the audit reported" — narrower than the actual rule, every
  path the triggering check found. This one was authored by the same person who then repeated it in a brief.

The common cause: writing a claim about what an agent receives, does, or enforces from memory of the design rather than from
`agents/*.md`, `hooks/lib/rules.mjs`, or `SKILL.md` directly — **including when you are the one who wrote the spec.** The spec is
one abstraction layer up from the artifact, and layers drift. Verify role-level and mechanism-level claims against the file that
actually governs them before writing them down anywhere, brief or otherwise.

## A trace must quote the sentence that causes it

An implementer's Task 6 trace concluded a test "is already accounted for and not re-flagged" — a correct-sounding conclusion, but
no sentence in the text it was tracing performed that check; the trace inferred a rule the source never stated. A trace that
reaches the right conclusion from text that does not support it is exactly the failure traces exist to catch, and it is not
visible from the conclusion alone — only from checking each step against its source.

**Standard applied since:** every step of a trace must name the sentence that *causes* it, not one merely adjacent to it. The
re-trace that followed was checked against this standard directly — including confirming a three-way bucketing was mutually
exclusive by definition (the third bucket was defined as "neither of the above," so nothing could satisfy the first two and still
fall through it) rather than by inspection — and it held. When reviewing a trace, do not accept a step you cannot point to a
specific quoted sentence for.

## Verification instruments lie

Every one of these produced a confident wrong answer:

- **A whole-file `grep` passes when the key is missing from the specific block a model copies from.** Scope the haystack, and check
  both anchors — a broken end anchor lets a range match run to EOF and silently re-widens it. `tests/config-contract.test.mjs`
  exists in its current, heavily-scoped form because of this; read its header comments before assuming a simpler check suffices.
- **The interpreter the hook runs under is not the one your shell gives you, and it can change with no project file changing and
  no restart.** Nothing in this project selects `node` for the spawned hook — Claude Code does, in exec form, with no shell —
  while `.node-version` and `fnm` only govern the orchestrator's own `Bash` tool. Measured disagreement on the development
  machine: the `Bash` tool resolved `fnm`'s 22.23.2 while the spawned hook resolved an IDE-bundled 24.13.0, at the same moment.
  Measured drift on the same machine without any restart: `fnm`'s per-session directory is keyed to a shell PID and is
  garbage-collectable once that shell exits — reaping it would move the hook from 22 to a stable-alias 26 with nothing in the
  repository changing. **The guard's version check is a floor, not a pin** — 26 passing is correct, not a bug — and it is the
  *only* thing that actually enforces the floor; `.node-version` only makes the *test suite* run on it. A green preflight version
  check (Preflight item 6) proves node is on the **`Bash` tool's** `PATH` only — it says nothing about the interpreter the hook
  itself gets. Preflight item 7 (dispatch a probe, confirm an observed denial) is the only check that exercises the real spawn
  path; do not let a green item 6 read as proof the guard can start.

## The scope of a measured fact is part of the fact

A different failure from the ones above: not a wrong measurement, but a correct one generalised past what it covered — and,
unlike the brief errors elsewhere in this file, generalised in a **fix ruling**, not in the original brief. The Tier 0 spike
proved `CLAUDE_PLUGIN_ROOT` is set **for the hook process** Claude Code spawns — that is what was actually measured. Task 4's
original brief and shipped text had preflight read the Node-version floor from a bare relative `hooks/lib/rules.mjs`; a reviewer
correctly flagged that as unresolvable, since `/tdd-init` and `/tdd` run with cwd set to the *user's* project, not the plugin's.
**The round-1 fix ruling — ordered by the controller in response to that finding, not written by the implementer** — routed the
read through `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs` instead, reading the spike's finding as "set for the plugin's code."
`CLAUDE_PLUGIN_ROOT` turned out to be unset in the orchestrator's own shell too — verified directly — so the round-1 fix
reproduced the exact same "orchestrator cannot read the file" failure the reviewer had just flagged, only behind a different
broken path.

Caught by a reviewer's refusal to assume the resolution worked, not by a fresh measurement: the round-1 re-review flagged, as an
explicitly non-blocking, out-of-scope observation, that it had not verified orchestrator-side `${CLAUDE_PLUGIN_ROOT}` resolution —
which turned out to be the most valuable line in that report. The fix that followed removed the dependency rather than trying to
resolve it: state the floor as a literal in both prompts, with a test asserting the literal matches `NODE_FLOOR` so drift fails at
test time instead of mid-preflight in a user's project.

When a measurement licenses a rule, restate exactly what was measured — which process, which environment, one file, one run —
before writing the rule down. "It's set" is not a fact; "it's set for the hook process, unconfirmed anywhere else" is.

## Revert does not revert

- `git checkout -- .` restores **tracked** files only. Red's tests are almost always new files, so a rejected test stays in the
  tree where the next commit sweeps it up. Found on the first live run.
- `git reset --hard` has the same blind spot when used bare, at three more sites.
- `git reset --hard -- <path>` is **fatal**: *Cannot do hard reset with paths*. Prose describing an impossible command is how the
  first two of these arose.
- **Scoping `checkout` to a pathspec does not fix the class — it adds a fourth instance, sharper than the first three.**
  `git checkout -- <path1> <path2>` validates every pathspec entry before touching anything: if even one does not match a
  tracked file, the whole command aborts and restores **nothing**, not even the entries that would have matched. Verified:
  `git checkout -- tracked.py untracked.py` (a legitimately modified tracked file plus a new untracked one) exited 1 and left
  `tracked.py` unrestored; `tracked.py` alone exited 0 and succeeded. This is the *ordinary* shape of a violating dispatch, not an
  edge case — a pathspec built from what a check found routinely mixes a modified tracked file with a new untracked one, because
  Red's tests are almost always new files. The failure shape is the worst available: `checkout` silently restores nothing, `clean`
  (see below) still removes the untracked half, and the tree looks reverted while the tracked modification survives into the next
  commit — exactly the bug this section opens with, reintroduced by the fix for the third instance.
- **The resolution: `checkout` is retired from this mechanism entirely.** Every revert site now pairs `git reset --hard HEAD` (no
  pathspec, tree-wide, so there is nothing for it to abort on) with a scoped `git clean -fd -- <pathspec>`. `clean` does not share
  `checkout`'s atomicity failure — it evaluates each pathspec entry independently, so a non-matching entry is skipped, not treated
  as an error that aborts the rest. Verified: `git clean -fd -- tracked.py untracked.py` removed only `untracked.py` and exited 0.
  If you ever find yourself about to write `git checkout -- <anything>` into a revert path in this project, that is this trap
  restarting — use `reset --hard` plus scoped `clean` instead, see `skills/run-tdd-cycle/SKILL.md`'s *Reverting a dispatch*.
- `git clean` **without `-x`** spares gitignored paths, so the venv, the checklist and the coverage report survive. Do not add
  `-x`.

## The environment lies too

- **Restoring source does not invalidate bytecode.** A suite once reported a failure with a traceback the source could not produce,
  and git called the tree clean because `.pyc` is gitignored. The same mechanism serves a false **green**, which is where it would
  be believed. `PYTHONDONTWRITEBYTECODE=1` is in the configured commands for this reason — still relevant, since `e2e/` is still a
  Python/pytest fixture.
- **The mutation run leaves `e2e/mutants/` behind**, which permanently breaks the configured test command until removed. The
  wrapper (`e2e/mutmut.sh`) traps it and the commands pass `--ignore=e2e/mutants`.

## Where the defects come from

Iteration 1's twenty defects all originated **in the plan**, none from an implementer — because that plan embedded the
implementation and left the implementer nothing to decide. Implementers caught five by flagging rather than transcribing.

Iteration 2's plan carried design intent and no code, for exactly that reason, and the failure mode it was built to prevent did
not recur — but a related one did, one layer up: see *The spec is not a safe substitute for the files* above. Writing an
implementation into a plan document is the original failure mode restarting; writing an unverified claim about the system into a
brief or a spec is its sibling. Both are caught the same way — check the file the claim is about before it goes in writing.
