# claude-tdd — Architecture Review

**Date:** 2026-08-01
**Reviewer:** senior architect (independent)
**Branch reviewed:** `feat/tdd-subagent-workflow` @ `8e58832`
**Audience:** project lead and implementer, to fold into spec, design, and plan

---

## 1. Verdict

The project delivers a working, genuinely novel thing: a role-constrained TDD loop where separate
LLM contexts author the test and the code, with a `PreToolUse` hook enforcing the boundary. It runs
end to end, the mutation pass found a real spec violation, and 181 unit tests pass in ~1.3s. The
engineering discipline on display — a ledger recording every defect, bite-checks proving tests have
teeth, fail-closed reasoning at every branch — is well above average.

It is not ready to be relied upon as an *enforcement* mechanism, and the spec currently claims that
it is. Five findings drive that judgment:

1. **A security fix the ledger records as complete was applied to the plan and the spec but never to
   the code** (S2a). The bypass is live and reproduced; the commit is labelled `fix(...)` and the
   ledger line reads FIXED. The plan even contains the regression tests that would have caught it.
   This is the most urgent item in the report — one line to fix, and it implies re-auditing every
   other "FIXED" line in the ledger.
2. **Read isolation — the guarantee the whole design exists to provide — is defeatable in two
   permitted tool calls, in both directions, with zero guard denials** (S1). It is also leaked on
   the *normal* path: `observedFailure` hands Green the full body of the test it may not read (S5a).
3. **Path matching is lexical, and lexical normalisation cannot establish path identity** (S2). Four
   bypass spellings remain live after three separate one-spelling fixes.
4. **Two orchestrator defects break the features they belong to** (I1, I2): resume is advertised but
   unconditionally destroys the state it resumes from, and the mutation round cap is inert on the
   only path that needs bounding.
5. **The spec contradicts itself on load-bearing details** (S4), still misdescribes the shipped
   enforcement mechanism after a reconciliation pass (S5c), and `AGENTS.md` documents a safety
   property that no longer holds (S5).

None of this is a reason to abandon the design. It is a reason to fix the path layer properly rather
than one spelling at a time, correct what the spec *claims*, and be explicit about the threat model.
The five Tier-1 recommendations in §7 change what ships; the rest can follow.

**A note on how these were found.** Every finding marked "reproduced" was executed against the
shipped files, not inferred from reading them. Four of them — the case bypass, the trailing-`/.`
bypass, the resume branch, and the mutation counter — are invisible to document review and were
passed over by roughly forty prior review rounds. That is not a criticism of the reviewers; it is
the point of §6.

### Findings index

| ID | Sev | Finding |
|---|---|---|
| S1 | Critical | Read isolation defeatable via the permitted test runner, both directions |
| S2 | Critical | Lexical normalisation cannot establish path identity — 4 live spellings |
| S2a | Critical | Trailing-`/.` fix landed in the plan and spec, never in the code |
| S5a | Critical | `observedFailure` hands Green the whole test body on the normal path |
| I1 | Critical | Resume is claimed but has no branch; a second `/tdd` destroys the run |
| I2 | Critical | Mutation round cap never increments on the survivor path |
| S3 | Important | Leading `**` misses zero depth; `/tdd-init` proposes such globs |
| S4 | Important | Spec contradicts itself on whether the config is committed |
| S5 | Important | `AGENTS.md` documents a property that does not hold |
| S5b | Important | Coverage baselines live only in context; compaction breaks the gates |
| S5c | Important | Residual spec/plan drift after the reconciliation pass |
| S5d | Important | Unstated scope limits: concurrency, monorepos, "one test" |
| I3 | Important | Revert is scoped so it cannot reach the file it must clean up |
| I4 | Important | `testId` reaches a shell command with no traversal guard |
| I5 | Important | Green's dispatch instruction contradicts its agent definition |
| I6 | Important | The spec file is an unsanitised trust boundary, never stated |
| T1 | Important | Four surviving mutants in the guard's decision surface |
| T2 | Important | Tests one path spelling per property and treats passing as proof |
| T7 | Important | `e2e/` is a recorded artifact, not a regression test |
| S6, S7, I7–I11, T3–T6 | Minor | See sections |

---

## 2. What the project gets right

Worth stating plainly, because the rest of this document is adversarial.

- **The core insight is sound.** "No single agent writes both a test and the code satisfying it" is
  a real property, it is cheaply achievable with separate contexts, and it targets a real failure
  mode (a model writing a test shaped around the implementation it already intends to write).
- **`agent_type` over a phase-marker file** is the correct call, and the spike that found it
  (`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`) also found the bug the marker design
  would have caused — the guard denying the orchestrator's own `git diff` audit. That is what a
  spike is for.
- **Fail-closed discipline is consistently applied and consistently *explained*.** Nearly every
  branch in `hooks/lib/rules.sh` carries a comment naming what would happen if it failed open.
  `tdd_matches_any`'s `set -f` guard is a genuinely subtle bug caught and documented well.
- **Prevent-and-verify layering** (hook at call time, diff audit at commit time) is the right
  shape, and the spec correctly identifies that they are not redundant because reads leave no
  post-hoc signature.
- **Mutation testing as a self-extending feedback loop** — survivors becoming Red items — is
  elegant, and it demonstrably worked: round 2 surfaced a real `if b == 0` vs `if b <= 0` spec
  violation that no human had noticed.
- **The ledger** (`.superpowers/sdd/.../progress.md`) is exemplary. Recording that all 20 defects
  originated in the plan rather than in implementer deviation is the kind of honesty most projects
  never write down. §6 takes that observation seriously rather than treating it as trivia.

---

## 3. Findings — Specification and Design

### S1 · Critical · The spec claims an enforcement guarantee the mechanism cannot provide

The spec states at line 210:

> The diff audit can only observe writes. Read isolation — the property that actually makes Green's
> implementation independent of the test's internals — leaves no post-hoc signature. The hook is the
> only mechanism that can enforce it.

and at line 212 calls the hook the "Sole enforcement of read isolation."

**This is false as written.** Both constrained roles can obtain the content they are forbidden to
read using only calls the guard permits. Reproduced against the shipped `hooks/guard.sh` and the
live `.tdd/config.json`:

**Red reading source** — two permitted calls, zero denials:

| Step | Call | Guard verdict |
|---|---|---|
| 1 | `Write e2e/tests/test_leak.py` (its own write glob) | PERMITTED |
| 2 | `Bash PYTHONDONTWRITEBYTECODE=1 e2e/.venv/bin/pytest -q --ignore=e2e/mutants e2e/tests/test_leak.py` (its own `single` command) | PERMITTED |

The test file contains `print(open("e2e/src/calc/__init__.py").read())`. The permitted command
prints the source file back to Red under `Captured stdout call`.

**Green reading tests** — the symmetric case, also reproduced:

| Step | Call | Guard verdict |
|---|---|---|
| 0 | `Read e2e/tests/test_secret.py` | **DENIED** |
| 1 | `Write e2e/src/calc/__init__.py` (its own write glob) | PERMITTED |
| 2 | `Bash …pytest… e2e/tests/test_secret.py` (its own `single` command) | PERMITTED |

Source containing `print(open("e2e/tests/test_secret.py").read())` is imported by the test run, and
the test body comes back to Green.

**Why this is structural, not a patchable bug.** The configured test command is a general-purpose
code execution engine, and each role is permitted to author the file that engine executes. Any
design in which a constrained role writes the test *and* runs the runner has this property. It
cannot be fixed in `rules.sh`, and widening the metacharacter ban does not touch it — no
metacharacters are involved. It *can* be partially mitigated at audit time and on the handover
channel — see R6 and R7 — so this is not an accepted-risk item to file away.

**What is actually delivered.** Read isolation is enforced against *incidental* violation: an agent
reaching for `Read` on the wrong file, which is the common case and which the guard catches
reliably. It is not enforced against *motivated* violation: an agent that wants the information and
uses its own permitted toolchain to get it.

That distinction matters more than "an LLM wouldn't do that deliberately" suggests, because the
realistic failure mode is not malice but **rationalisation**. Red genuinely needs the public API
signature to write a compiling test. When `Read` is denied, "let me print it from a scratch test" is
exactly the shape of reasoning a capable model produces when blocked — helpful, goal-directed, and
fatal to the guarantee. Nothing in the agent prompts anticipates it.

**Recommendation.** This is a spec change, not a code change.

1. Add a **Threat model** section. Name the adversary: a capable, goal-directed model that is not
   trying to subvert the workflow but will route around an obstacle to complete its task. State
   explicitly that a model actively seeking to defeat the boundary can, and that this is accepted.
2. Downgrade the wording at lines 210–212 from "sole enforcement" to something defensible: the hook
   makes the boundary *observable and costly to cross accidentally*; it does not make crossing
   impossible.
3. Add the counter-measure that is cheap and does work: **the orchestrator already reads everything
   and audits every commit.** Have it also scan Red's committed test files for source-file reads
   (`open(`, `require(`, `include`, `File.read`) targeting a `globs.source` path, and treat a hit as
   a guardrail violation under the existing revert-and-re-dispatch rule. That converts the strongest
   route from undetectable to detected-at-commit, which is the same prevent-and-verify split the
   design already uses everywhere else.
4. If a hard guarantee is genuinely wanted, it needs process-level isolation (run the agent's test
   command in a sandbox that cannot see `globs.source`), which is a much larger change and probably
   not worth it. Say so in the spec and close the question rather than leaving it implied.

---

### S2 · Critical · Lexical normalisation cannot establish path identity — four live bypasses remain

The guard strips the project root by literal prefix and then glob-matches the remainder. Because
**reads are a denylist, any path that matches no glob is permitted**. So every path spelling that
defeats the lexical match is a read-isolation bypass.

The project has fixed this class three times, one spelling per fix — `./x`, `x//y`, a root ending
`/.`. Three spellings still bypass, reproduced against the shipped guard and live config:

| Role | Path | Verdict | Note |
|---|---|---|---|
| `tdd-red` | `e2e/src/calc/__init__.py` | DENIED | baseline, correct |
| `tdd-red` | `E2E/src/calc/__init__.py` | **PERMITTED** | resolves to the same file — macOS filesystem is case-insensitive, the matcher is not |
| `tdd-red` | `e2e/SRC/calc/__init__.py` | **PERMITTED** | same |
| `tdd-green` | `E2E/tests/test_divide.py` | **PERMITTED** | same, opposite direction |
| `tdd-red` | `/private/Users/…/e2e/src/calc/__init__.py` | **PERMITTED** | already in the ledger as an unfixed residual |
| `tdd-red` | absolute path, with root spelled `$ROOT/.` | **PERMITTED** | **the ledger records this one as FIXED — see below** |

Confirmed the uppercase spellings resolve to the real files (`head E2E/src/calc/__init__.py` returns
the source). Note the asymmetry that makes this dangerous rather than merely wrong: `Write
E2E/src/...` is correctly **denied**, because writes are an allowlist and fail closed. Only reads
leak — silently, and with no trace in any diff. This is precisely the failure mode the design exists
to prevent, and precisely why it survived 40 rounds of review.

### S2a · Critical · The trailing-`/.` fix was applied to the plan and the spec, never to the code

This deserves separate treatment because it is not merely an unfixed bug — it is a bug the project
**believes it fixed**.

The ledger closes with: *"Residual from the re-review, also FIXED: a root spelled `$ROOT/.` bypassed
— normalise handled leading `./` and middle `/./` but not trailing `/.`"* (`progress.md:416-417`).

Commit `b97c69f` ("fix(plan): normalise a trailing /. and correct the spec's tool list") touched
exactly two files:

```
docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md   | 7 +++++++
docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md | 2 +-
```

`hooks/lib/rules.sh` and `tests/rules.test.sh` were never touched. The plan now contains both the
fix and the three regression assertions that would have caught it:

```bash
      */.)   p="${p%/.}" ;;
assert_eq "/a/b" "$(tdd_normalize_path "/a/b/.")" ...
```

The shipped code does not:

```bash
$ . hooks/lib/rules.sh; tdd_normalize_path "/a/b/."
/a/b/.                                    # unchanged
```

Reproduced live against the shipped guard:

| Root | Path | Verdict |
|---|---|---|
| `$PWD` | `$PWD/e2e/src/calc/__init__.py` | DENIED (correct) |
| `$PWD/.` | `$PWD/e2e/src/calc/__init__.py` | **PERMITTED** |
| `$PWD/.` | `$PWD/./e2e/src/calc/__init__.py` | **PERMITTED** |

(An absolute path is required to trigger it: with a relative path the root strip is skipped anyway.)

This is the exact error the ledger twice names as a controller mistake — *"Fixing the document about
the artifact is not fixing the artifact"* (`progress.md:265`) — recurring a third time, in the final
review, on a security boundary, and going undetected because the plan and the code are two sources
of truth kept in sync by hand. It is the strongest concrete evidence for the methodology finding in
§6.

**Recommendation.** Apply the fix to `hooks/lib/rules.sh` and the assertions to
`tests/rules.test.sh` — then re-audit every other "FIXED" line in the ledger by checking that a
non-documentation file appears in the referenced commit's stat. Fold it into the canonicalisation
work below rather than shipping one more spelling patch.

**Root cause of the class.** `tdd_normalize_path` (`hooks/lib/rules.sh:55`) is a *lexical* normaliser. Path
identity on a real filesystem is not a lexical property: it involves case-folding rules, symlinks,
hardlinks, and mount aliases. Each new spelling will keep being discovered one at a time. The
ledger's own note — "Lexical normalisation cannot address this; it needs realpath" — is correct and
should be acted on rather than recorded.

**Recommendation — canonicalise, don't normalise.** Replace the prefix-strip with a canonical-path
comparison. Portability constraints verified on this machine:

- BSD `realpath` (macOS `/bin/realpath`) **has no `-m`**, so it fails on a path that does not exist
  yet — which is every `Write` of a new test file. Canonicalise the **directory** portion (which
  does exist) with `cd "$dir" && pwd -P`, then re-append the basename. `pwd -P` is POSIX and
  resolves symlinks, closing the `/private` residual.
- `${v,,}` is **bash 4+ and unavailable** — this project targets bash 3.2.57. Case-fold with
  `tr '[:upper:]' '[:lower:]'`.
- **Detect** case-insensitivity rather than assuming it: create a temp file `aA`, test for `Aa`,
  cache the answer. Case-folding unconditionally would wrongly conflate `Src/` and `src/` on Linux.

One change closes all three open spellings, retires the residual, and ends the class. Add a test
matrix over path *spellings* (§5) so the next spelling is caught by the suite rather than by review.

---

### S3 · Important · `**` does not mean what the config author expects, and `/tdd-init` proposes globs that rely on it

`tdd_glob_match` (`hooks/lib/rules.sh:9`) rewrites `**` to `*`, relying on bash's `*` crossing `/`
inside `[[ ]]`. That is correct for `src/**`. It is wrong at the **start** of a pattern:

```
**/test_*.py   →   */test_*.py   →   requires at least one directory component
```

So a root-level `test_foo.py` matches **no** test glob. Verified: `tdd_glob_match "**/test_*.py"
"test_foo.py"` returns no-match, and `tdd_path_verdict green read "test_foo.py" …` returns `allow` —
Green may read a root-level test file.

In every glob dialect the config author knows (git pathspec, `.gitignore`, minimatch, Python
`pathlib`), `**/x` matches `x` at zero depth. This implementation diverges silently.

It matters because **`/tdd-init` proposes exactly these globs** (`commands/tdd-init.md:79`):

> `test`: `tests/**`, `**/test_*.py`, `**/*_test.go`, `**/*.test.ts`, `spec/**`

`**/*_test.go` is the worst case — root-level `main_test.go` is idiomatic Go, and Go projects
routinely put tests beside sources at the module root.

**Partial mitigation exists**, which is why this is Important rather than Critical: the partition
check would flag a root-level test as unclassified and stop. But the natural resolution — dropping
one stray file into `globs.ignore` to get past the check — silently removes read isolation for it,
and nothing warns.

**Recommendation.**
1. Expand a leading `**/` to match both depths (test the pattern with and without the `*/` prefix).
2. Add zero-depth assertions to `tests/rules.test.sh` for each glob shape `/tdd-init` proposes.
3. Have the partition check **refuse** to classify a file into `ignore` when its name matches a
   recognised test-file pattern, and say why.

---

### S4 · Important · The spec contradicts itself on whether `.tdd/config.json` is committed

Three statements, three answers:

| Location | Claim |
|---|---|
| spec:78 (State table) | `.tdd/config.json` — Committed: **`no — gitignored`** |
| spec:340 | "`.tdd/config.json` **is committed** and is the single source of truth" |
| spec:381 | "**`/tdd-init` commits its own output.** It writes `.tdd/config.json` and edits `.gitignore`" |

This is not cosmetic. If an implementer follows the State table and has `/tdd-init` add
`.tdd/config.json` to `.gitignore`, then the step at spec:381 becomes a silent no-op — `git add` on
an ignored path does nothing without `-f` — leaving the first-run path (`/tdd-init` then `/tdd`)
broken in exactly the way spec:381 exists to prevent.

**Recommendation.** Committed is the right answer: the config is the single source of truth for a
security boundary, and the partition guarantee is only as good as the review the config receives.
Correct the State table, and have `/tdd-init` verify after committing that `git ls-files
.tdd/config.json` is non-empty — the same "prove the step actually happened" discipline the project
applies elsewhere.

---

### S5 · Important · `AGENTS.md` documents a safety property that does not hold in the working copy

`AGENTS.md:16` states:

> there is deliberately no `.tdd/config.json` at the root — it is gitignored. Dispatching a `tdd-*`
> subagent therefore denies every guarded tool call with "run /tdd-init", and that is the guard
> working. Do not commit one; its absence is what keeps that behaviour observable.

`.tdd/config.json` **exists on disk** (1295 bytes, written 15:03); it is merely untracked. A live
probe of a `tdd-*` dispatch against the repo root returns **`rc=0`, permitted** — not the documented
denial. The ledger's F3 fix untracked the file but left it in place, so the observable the paragraph
depends on is gone.

The deeper problem is the pattern: a safety property was being verified by *the repository's own
incidental state* rather than by a test. That is unobservable drift by construction.

**Recommendation.** Correct `AGENTS.md`, and add a real assertion to `tests/guard.test.sh` covering
the missing-config path — point `TDD_PROJECT_DIR` at an empty sandbox and assert exit 2 with the
`run /tdd-init` message. Then the property is checked every run rather than by a paragraph.

---

### S5a · Critical · `observedFailure` routinely hands Green the entire test body

This is the sharper half of S1, and it needs no adversarial agent at all — it happens on the
**normal path, by design**.

The handover artifact's `observedFailure` field is specified as `<verbatim runner output>`
(spec:257) and is mandatory. spec:206 characterises the leakage as incidental:

> a failing run prints test file paths, test names, assertion diffs, and often source excerpts…
> unavoidable and is not a violation.

"Excerpt" undersells it. pytest's default traceback reproduces the **full source of the failing test
function** — every line up to and including the failing assertion — and that output is pasted
verbatim into Green's dispatch. For most tests, `observedFailure` *is* the test.

So the design's central guarantee is undercut on the happy path: Green is denied `Read` on the test
file, then handed its contents as required input. The hook blocks a channel carrying less
information than the one the workflow mandates.

There is a second unguarded channel of the same kind: **the orchestrator is exempt from the guard by
construction** (`agent_type` absent → permit) and hand-authors Green's prompt. `SKILL.md:184` ("Do
not paste test source — that is the whole point of the separation") is the *entire* control, and it
is not a tool call, so nothing can observe a violation.

**Recommendation.** Both channels need to be named in the spec rather than assumed benign, and one
of them is cheaply fixable:

1. Configure the runner to suppress source in tracebacks where the toolchain allows it — for pytest,
   `--tb=line` or `--tb=no -q` yields the assertion and location without the function body. Add a
   `commands.singleTerse` (or a documented `--tb` requirement on `commands.single`) and have Red use
   it when producing `observedFailure`.
2. Have Red populate `expected` and `intent` as the primary contract — they already exist and are
   the *designed* channel — and truncate `observedFailure` to the failure line plus location.
3. State in the spec that the orchestrator is a trusted, unenforceable channel. It is the one
   participant with full visibility, and the guarantee is scoped to agents, not to the workflow.

### S5b · Important · Coverage baselines live only in context, so compaction breaks the gates

The resumability argument is that "the completion signal survives context compaction" (spec:81) via
`checklist.json`. But the coverage baselines the gates compare against are captured at preflight and
immediately before each Green and Refactor dispatch (`SKILL.md:126-130`) and are held **only in the
orchestrator's conversation**. `checklist.json`'s schema has no baseline field, and the live
`.tdd/checklist.json` contains zero occurrences of the word.

If the orchestrator compacts between capturing a baseline and comparing against it, the number is
gone with nothing on disk to recover it from — and the gate either silently skips or compares
against a wrong figure. The design's own claim to survive compaction covers checklist *status* only,
not in-flight gate arithmetic.

**Recommendation.** Persist per-dispatch baselines into `checklist.json`, or narrow the compaction
claim in spec:81 to say exactly what it covers.

### S5c · Important · Residual spec-vs-shipped drift after the reconciliation pass

The spec claims to have been "updated after the build to match the shipped system" (spec:4). Three
load-bearing claims are still wrong:

| Spec | Claim | Shipped |
|---|---|---|
| :212 | matcher is `` `Read\|Write\|Edit\|Bash` `` | `Read\|Write\|Edit\|MultiEdit\|NotebookEdit\|NotebookRead\|Bash` |
| :214-219 | dispatch table matches `tdd-red` etc. directly | `guard.sh:50` matches `${agent##*:}` to strip the `claude-tdd:` namespace |
| :239 | ban list is `` `;` `\|` `&&` `>` `` backtick `$(` | code also bans a single `&`, `<`, and a literal newline |

The second is the most striking: the namespace strip is the fix for **the single most consequential
defect in the project** — without it the guard was inert for every real dispatch — and the spec's
canonical enforcement pseudocode still does not show it. spec:404 additionally still lists that
question as an *open* risk, though the ledger records it resolved.

The same staleness is in the plan: its File Structure table (plan:36) still describes the four-tool
matcher while the embedded `hooks.json` two hundred lines later has all seven.

**Recommendation.** These are the surviving instances of the pattern in S2a — a fix applied in one
place and not the others. Grep both documents for the literal four-tool matcher string and for bare
`tdd-red` in enforcement contexts, and fix every occurrence.

### S5d · Important · Scope limits that are real but unstated

Three constraints the design has but never declares:

- **No concurrency story.** There is no lock file, PID guard, or staleness check on
  `checklist.json`. Preflight's clean-tree check only guards the *start* of a run. A second session
  running `/tdd` against the same repo would corrupt the first's `git diff HEAD~1` audit attribution
  with no detection. The plan defers *in-orchestrator* parallelism honestly (plan:2937) but never
  addresses two sessions.
- **Monorepos are architecturally excluded, not merely under-detected.** The schema has one
  `commands` object and one `globs` partition. A repo with a Python backend and a TypeScript
  frontend has no path forward. The claim that adding a toolchain is "a table row rather than new
  code" (spec:377) holds only for single-toolchain repos.
- **"One test" is undefined for parametrized and table-driven tests.** `@pytest.mark.parametrize`,
  Go table tests, and a function with several unrelated assertions are all "exactly one test" by the
  letter of `tdd-red.md:27`, while violating its intent — and neither the coverage nor the CRAP
  machinery can tell them apart from an atomic test.

**Recommendation.** Add a Scope/Limitations section stating all three. Each is defensible as a v1
boundary; none is defensible as a surprise.

### S6 · Minor · Vestigial state from the abandoned phase-marker design

`.gitignore:22` still ignores `.tdd/phase`. The phase marker was eliminated in favour of
`agent_type` (spec:83, spec:221) and nothing writes it. Remove the line; a stale ignore entry is a
small invitation to resurrect a design the spike proved broken.

---

### S7 · Minor · Agents are pinned to `sonnet`; the spec does not mention model selection

All four agent definitions carry `model: sonnet` in frontmatter. This is a reasonable cost decision,
but the spec's architecture section and config schema are silent on it, so it is undocumented
policy. It also interacts with S1: the weaker the agent model, the less likely the rationalisation
route, and the *stronger* the model, the more likely it is to find it. Record the choice and its
rationale in the spec, and make it configurable if the workflow is meant to be reusable.

---

## 4. Findings — Implementation

The guard's **config-parsing surface is genuinely solid** and deserves credit before the criticism.
Nine degenerate `.tdd/config.json` shapes — `globs.source` missing, `[]`, `null`, a string instead of
an array, `globs` absent, `{}`, non-JSON, and an empty file — **all correctly denied** a `tdd-red`
source read. Unknown tools deny (`guard.sh:94`), unmapped roles deny (`guard.sh:108`), a missing
`file_path` denies (`guard.sh:127`), an empty static command prefix denies (`rules.sh:151`), and
unset positionals default to values that deny rather than crash-permit (`rules.sh:76`, `rules.sh:125`).
That is an unusually disciplined application of "ambiguous input fails toward least privilege," and
it is why the path-layer findings in S2 stand out — they are the exception, not the pattern.

Agent boundaries also check out. Every command each agent prompt instructs is within that role's
Bash allowlist; the `tools:` frontmatter (`Read, Write, Edit, Bash`) is a strict subset of the
`PreToolUse` matcher; no prompt instructs `git`, `rm`, `mv`, `sed`, or `mkdir`. The ledger's claim
that this class was fixed holds against the current tree.

### I1 · Critical · Resume is claimed but has no branch — a second `/tdd` destroys an in-progress run

`skills/run-tdd-cycle/SKILL.md:76` asserts "An interrupted run resumes from this file, not from your
context," and both the mutation pass (`:308`) and Completion (`:324`) reason about "a resumed run."

But `## Decompose` (`:46`) is **unconditional**: "Read the spec once. Write `.tdd/checklist.json`."
There is no branch anywhere that says *if the checklist already exists, load it instead of writing
it*. A model re-invoking `/tdd <spec>` to resume — the exact scenario the design advertises — has no
textual signal to skip decomposition, and would overwrite the checklist, discarding every item's
`status`, the recorded `knownRed` baseline, and `mutationRoundsRun`.

The section that claims resume works is the same section that unconditionally destroys the state
resume depends on. Nothing in the suite or the e2e run exercises resume, so this survived every
review round.

**Recommendation.** Add an explicit branch before `## Decompose`: if `.tdd/checklist.json` exists and
has items, this is a resume — load it, re-surface `blocked` items, and jump to the first non-terminal
item. Run Decompose only when the file is absent. Then add an e2e case that interrupts and resumes.

### I2 · Critical · The mutation round cap does not bind in the only case it exists for

`skills/run-tdd-cycle/SKILL.md:302-306`:

```
7. Survivors found → report the count and **resume the per-item loop**.
8. No survivors, or mutationRoundsRun has reached limits.mutationRounds → done.
9. Increment mutationRoundsRun in checklist.json and write the file.
```

Steps 7 and 8 are mutually exclusive branches, but step 9 is written after both as though it always
runs. Step 7's instruction — "resume the per-item loop" — sends control to a different section
before step 9 is ever reached. So the counter reliably increments only on the terminal no-survivor
path, which ends the run anyway.

`limits.mutationRounds` (default 2) exists to bound *repeated survivor-producing passes*. That is
precisely the path on which the increment gets skipped. The cap is inert exactly where it is needed.

The file anticipates the misreading ("That increment is a numbered step rather than trailing
advice", `:308`) but argues against it instead of removing the ordering that invites it.

**Recommendation.** Make the increment unconditional and put it first: "7. Increment
`mutationRoundsRun` and write the file. 8. Survivors found and budget remains → resume the per-item
loop. 9. No survivors, or budget exhausted → done."

### I3 · Important · The revert procedure is scoped so it cannot reach the file it exists to clean up

`SKILL.md:101` scopes the revert to "the globs that role may write — `globs.test` for Red,
`globs.source` for Green, Refactor and Mutate."

But a violation is *by definition* a write to a path that does **not** match the role's glob — that
is what makes it a violation rather than ordinary work. In the backstop scenario the audit exists
for (the hook missed a write), the rogue file sits outside the glob by construction, and
`git checkout -- <glob>` / `git clean -fd -- <glob>` cannot touch it.

This is the third appearance of the revert-does-not-revert class the ledger already fixed twice
(`git checkout -- .` leaving untracked files; `git reset --hard` having the same blind spot). This
instance is in the *scoping*, not the command choice, and nothing exercises a real out-of-glob
violation.

**Recommendation.** Scope the revert to the **offending paths the audit reported**, falling back to
the role's glob only when the audit named none.

### I4 · Important · `testId` reaches a shell command with no traversal guard

`guard.sh:129-135` explicitly rejects `..` before path matching. `tdd_bash_verdict`
(`rules.sh:126-171`) checks the delta only for shell metacharacters — nothing rejects `..` or an
absolute path. Where `{testId}` is a filesystem path (pytest node IDs), a fabricated `testId` in
Red's handover report — which `SKILL.md:187` has the orchestrator execute without validating it
against `globs.test` — invokes the configured runner against a path outside the test tree.

The two halves of the guard disagree about whether traversal matters.

**Recommendation.** Validate `testId` against `globs.test` orchestrator-side before dispatch (cheap
and precise), and extend the delta check to reject `..` for defence in depth.

### I5 · Important · Green's dispatch instruction contradicts its own agent definition

`SKILL.md:184` says "Dispatch `tdd-green` with **only** Red's handover report."
`agents/tdd-green.md:61` says "The orchestrator passes you the attempt limit from
`limits.greenAttempts`."

Read literally, "only" excludes the attempt limit, so Green never learns its cap — undermining both
its own stop condition (`tdd-green.md:63`) and the orchestrator's escalation trigger (`SKILL.md:336`).
The intent is clearly "the report, not raw test source," but two artifacts state incompatible things
and a fresh orchestrator must reconcile them unaided.

**Recommendation.** "Dispatch `tdd-green` with Red's handover report and `limits.greenAttempts`. Do
not paste test source."

### I6 · Important · The spec file is an unsanitised trust boundary, and this is never stated

Red reads an arbitrary user-supplied spec. The guard bounds *where* an agent may act, never *what*
it does within that boundary. A spec instructing behaviour that the implementation should exfiltrate
data produces a compliant Green writing exactly that — entirely within `globs.source`, using only
configured commands, with zero denials. The design's Scope excludes "reviewing the resulting code
for quality" (spec:16), but this is a distinct gap and is nowhere named.

**Recommendation.** One paragraph in the Risks section: running `/tdd` against an untrusted spec
carries the same risk as executing code from that spec's author. This pairs naturally with the
threat-model section recommended in S1.

### I7 · Minor · Agent input lists omit inputs their own procedures require

- `agents/tdd-red.md:19-24` lists three inputs but not the coverage baseline, while step 4 (`:38`)
  says "Compare against the baseline **you were given**."
- `agents/tdd-refactor.md:19-23` omits `knownRed`, used from `:62`.

`SKILL.md` does pass both, so these are consistency gaps rather than functional bugs — but they are
the same "named in prose, absent from the declared structure" shape the ledger already fixed twice.

### I8 · Minor · `tdd-mutate`'s `blocked` outcome is not tied to the escalation rule

Refactor's `blocked` branch (`SKILL.md:244`) explicitly states "there is no Refactor exemption."
The mutation pass has no equivalent for `tdd-mutate`. The nearest text (`:313`) reads as
record-and-continue, while the general rule (`:336`) demands stop-and-escalate. Given how carefully
every other role's `blocked` path is cross-referenced, the omission reads as a gap.

### I9 · Minor · Packaging is incomplete for a distributable plugin

- **No `README.md`.** The repo has `plugin.json`, `marketplace.json`, MIT licence and keywords —
  every signal of intended distribution — and no entry documentation for an installing user.
- **`source: "./"` ships the whole repository**: `docs/` (3.4k lines of internal SDD material),
  `.superpowers/`, `tests/`, `e2e/`, `.idea/`. The ledger records this as fixed; it was fixed by
  *documenting* it in `AGENTS.md`, not by excluding anything.
- **`version` is duplicated** across `plugin.json` and `marketplace.json` with nothing keeping them
  in sync, and `config.version` is written by `/tdd-init` but read by nothing.

### I10 · Minor · Secondary refactor triggers have no mechanical detection

`SKILL.md:210-211` lists duplication ("the same shape appears N times") and naming drift as
triggers. There is no `commands.duplication` in the schema and no definition of "shape." These are
the only triggers left as pure prompt discipline in a design that otherwise converts judgment into
measurement. If deliberate, say so; otherwise a maintainer will read it as an oversight.

### I11 · Minor · The test fixture does not model the documented schema

`tests/fixtures/config.json` omits `globs.ignore`, which `/tdd-init` writes and the live config
carries. `guard.sh` never reads it, so nothing breaks today — but the fixture is the schema's only
executable specimen, and it is not faithful.

## 5. Findings — Test coverage

`bash tests/run.sh` → **181 passed, 0 failed**, exit 0, ~1.3s. The suite is fast, readable, and its
assertions are mostly well-targeted. It is also the reason four of the findings in this report
survived forty review rounds.

### T1 · Important · Surviving mutants in the guard's decision surface

Mutations applied to a full copy in a scratchpad (repo untouched, verified clean afterwards).
Control mutations confirm the suite does bite where it is aimed:

| Mutation | Location | Result |
|---|---|---|
| swap `source_globs`→`test_globs` in `red:read`'s empty check | `rules.sh:89` | caught (180/1) |
| unknown-tool deny → `exit 0` | `guard.sh:94` | caught (180/1) |
| delete the `..`-traversal deny block | `guard.sh:133` | caught (179/2) |
| **drop `<` from the metacharacter denylist** | `rules.sh:164` | **survived** — `<` is never asserted |
| **typo the `mutation` command key** | `guard.sh:107` | **survived** — fixture's `commands.mutation` is `null`, so the branch is dead in every test |
| **`NotebookRead` path key → `file_path`** | `guard.sh:90` | **survived** — `NotebookRead` is never tested, though `NotebookEdit` has a named regression test for this exact bug class |
| **split `red\|green` so red loses `single`** | `guard.sh:105` | **survived** — Red's Bash access is only ever exercised through the coverage command |

One further mutation (removing the `**`→`*` substitution at `rules.sh:9`) survived but is a genuine
no-op: `**` and `*` behave identically under bash `[[ == ]]`. That substitution is dead code, which
the comment beside it half-admits — and it is the same line that produces the zero-depth gap in S3.

### T2 · Important · The suite tests one spelling per property and treats passing as proof

`tests/guard.test.sh` tests `./x`, `x//y`, and `..` — the spellings that had already been found. It
tests no uppercase spelling, no symlink route, no trailing-`/.` root, and no zero-depth `**`. Every
bypass in S2 and S2a lives in exactly the gap between "the spellings someone thought of" and "the
spellings that exist."

That is why S2a is invisible: `tests/rules.test.sh` asserts the *leading* and *interior* dot cases
and passes, and its passing is indistinguishable from the property holding.

**Recommendation.** Replace spelling-by-spelling assertions with a **table-driven matrix**: for each
role × mode × canonical target, iterate a list of spellings (`x`, `./x`, `x//y`, absolute,
`$ROOT/.`-rooted, uppercase, symlinked) and assert the verdict is identical for all of them. A new
spelling then becomes one row, and the property is stated once rather than sampled.

### T3 · Minor · The harness aborts on an unset variable and reports nothing

`tests/run.sh:3` sets `set -uo pipefail`, and test files are `.`-sourced into the same process. A
test file referencing an unset variable kills the entire harness. Verified:

```
--- zz-unset.test.sh ---
  PASS: this one runs
tests/zz-unset.test.sh: line 2: THIS_VAR_IS_UNSET: unbound variable
exit code: 1        # and NO "N passed, N failed" line at all
```

Every later test file never runs. **The failure is loud but uninformative**: the exit code is 1, so
CI cannot be fooled — only a human reading the pass count rather than the exit status is misled.
That is why this is Minor despite affecting the whole harness. It is a broader form of the risk the
ledger logged as a deferred minor, which anticipated only the rest of *one file* going dark.

**Recommendation.** Run each test file in a subshell, and assert a total expected count so a
truncated run is a failure with a legible reason rather than an absent summary.

### T4 · Minor · Deny assertions check the verdict bit, not the branch

Nearly every `rules.test.sh` deny assertion is `assert_contains "deny" …`. Since the functions only
ever return `allow` or `deny: …`, that is close to asserting a boolean and never confirms *which*
rule fired. Only `guard.test.sh:60` pins a specific message. A mutation that denies for the wrong
reason passes.

### T5 · Minor · Config-shape fail-closed paths are correct by inspection, not by test

`guard.test.sh` exercises only a fully-absent config. I verified nine degenerate shapes by hand
(§4, §8-D) and all fail closed correctly — but none of that is in the suite, so it is not protected
against regression. The fixture also has `commands.mutation: null`, which makes the entire mutation
branch of the Bash allowlist structurally dead in every test (see T1).

### T6 · Minor · Whole categories are untested

Nothing asserts `hooks/hooks.json` wiring, `.claude-plugin/plugin.json` validity, agent `tools:`
frontmatter contents (only `name:` is checked), or any of the orchestrator skill's step logic beyond
a grep for schema keys.

### T7 · Important · `e2e/` is a recorded artifact, not a regression test

It is not wired into `tests/run.sh`; nothing re-runs it, and nothing diffs its result against a
committed expectation. `e2e/tests/test_divide.py` carries a comment marking one test as "PLANTED for
Task 10" — it is a hand-built illustration of a past run. Per `AGENTS.md` it is re-runnable by hand,
but no change to the live workflow would be caught by it.

That matters because **the ledger records that 8 of 20 defects were found only by running the
system**, including the two most consequential ones. The only mechanism that finds that class of
defect is manual and unautomated.

**Recommendation.** Promote `e2e/` to an automated smoke test with a recorded expected outcome
(final checklist state, commit subjects, test count), even if it must be invoked separately from
`tests/run.sh` because it needs a live session. Add a resume case (I1) and an out-of-glob violation
case (I3) — both are currently unexercised paths that this review found broken.

## 6. Findings — Process and methodology

### M1 · The plan *is* the implementation, and that explains where the defects came from

The ledger's closing line is the most important sentence in the repository:

> 20 defects total: 12 found by review, 8 by running. All in the plan, none from an implementer.

That is not a coincidence to be noted; it is a description of the process's architecture. Measured:

| Artifact | Lines |
|---|---|
| Plan | 2943 (1940 of them — 66% — inside code fences) |
| Shipped runtime bash (`hooks/`) | 321 |
| Shipped prompts (`agents/`, `commands/`, `skills/`) | 866 |
| Tests | 589 |

The plan embeds the code that implementers transcribe. Under that arrangement the implementer is a
copying step, so of course no defect originates there — there is no design decision left for them to
get wrong. Every decision was already made in the plan, and the plan was reviewed as a *document*
rather than as the code it actually is.

This also explains the recurring shape of the defects. The ledger records the same class — "a check
that cannot be evaluated reaches `allow`" — appearing at least seven times, each caught individually
and fixed individually. A reviewer reading prose does not simulate the branch; a reviewer reading
code does.

**Recommendation.** Pick one of two coherent models, rather than the current hybrid:

- **Plan as design intent.** The plan states the invariant, the failure modes, and the test cases,
  and does *not* contain the implementation. Implementers write the code and are accountable for it.
  Review targets the diff. This is the model the SDD workflow assumes.
- **Plan as source.** Accept that the plan is the code, and apply to it the rigour currently applied
  to diffs: run the embedded snippets, bite-check the embedded tests, review it adversarially before
  dispatch rather than after.

The current hybrid gets the cost of both and the benefit of neither: the plan carries the risk of
code while receiving the scrutiny of prose.

### M2 · Test-count-as-signal was load-bearing for five tasks before anyone checked it

The ledger records that a one-character typo in a `jq` filter deleted 46 assertions and the suite
reported "122 passed, 0 failed" — healthy-looking. The root cause (`run.sh` had no notion of what
the count *should* be) was identified in Task 2 and carried as a deferred minor for five tasks while
that class recurred six times.

The structural fix landed (zero-assertion and empty-glob guards), and it is a good one. The lesson
worth writing into the spec's own methodology section is narrower: **"green" from a harness that
cannot distinguish "no assertion failed" from "no assertion ran" is not evidence.** The project
learned this expensively; it should be recorded so it is not relearned.

### M3 · Several safety properties are verified by repository state rather than by tests

S5 is one instance (`AGENTS.md` relying on a file's absence). The pattern is worth naming: a
property that is true because of how the working copy happens to be arranged will drift silently,
because nothing runs when it changes. Every such property should become an assertion in
`tests/`.

## 7. Recommendations, in priority order

### Tier 1 — do before this branch merges

**R1. Apply the trailing-`/.` fix to the code (S2a).** One line in `hooks/lib/rules.sh`, three
assertions in `tests/rules.test.sh`. The plan already contains both. Then audit every other "FIXED"
line in the ledger by confirming a non-documentation file appears in the referenced commit's stat.
This is the cheapest high-value item in the report and it closes a live bypass the project believes
is already closed.

**R2. Replace lexical normalisation with canonicalisation (S2).** One change closes the trailing
dot, both case spellings, and the `/private` symlink residual, and ends a class that has recurred
four times. Portable route, verified on this machine:

```bash
# canonicalise the directory (which exists) and re-append the basename,
# because BSD realpath has no -m and cannot handle a not-yet-created file
dir=$(cd "$(dirname "$p")" 2>/dev/null && pwd -P) || deny …
canon="$dir/$(basename "$p")"
# case-fold only when the filesystem is case-insensitive; detect, don't assume.
# ${v,,} is bash 4+; this project is bash 3.2.
```

**R3. Correct the enforcement claim and add a threat model (S1, S5a).** Downgrade "sole enforcement
of read isolation" to what is actually delivered — enforcement against incidental violation — and
add a Threat Model section naming the adversary as a capable, goal-directed model that will route
around obstacles, not a malicious one. Name the three unenforceable channels explicitly: the
permitted runner executing agent-authored files, `observedFailure`, and the orchestrator itself.

**R4. Fix the resume branch (I1) and the mutation counter ordering (I2).** Both are small edits to
`SKILL.md` and both currently break the feature they belong to. Resume is advertised and destroys
state; the round cap is inert on the only path that needs bounding.

**R5. Fix the revert scoping (I3).** Scope to the audit's reported offending paths, not the role's
glob — the current scoping cannot reach the file it exists to clean up.

### Tier 2 — before calling the plugin releasable

**R6. Truncate `observedFailure` (S5a).** Require a terse-traceback form of `commands.single` and
lean on `expected`/`intent` as the designed channel. This is the one leak in S1/S5a with a genuinely
cheap mechanical fix.

**R7. Add the orchestrator-side test-file scan (S1.3).** Have the commit audit reject a committed
test that reads a `globs.source` path. Converts the common shape of the strongest bypass from
undetectable to detected-at-commit, using the prevent-and-verify split the design already relies on.
Be clear about its ceiling: this is a substring heuristic against an LLM-authored file. It raises
the cost of the bypass and catches the obvious spelling; it does not close the channel, and it
should be documented as a detector rather than a control.

**R8. Convert the test suite to a spelling matrix (T2)** and add the untested branches the mutation
run surfaced (T1): `NotebookRead`, `<` in the metacharacter list, Red's `single` command, and a
fixture with a non-null `commands.mutation`.

**R9. Fix the leading-`**` zero-depth gap (S3)**, add zero-depth assertions for every glob shape
`/tdd-init` proposes, and have the partition check refuse to classify test-looking filenames into
`ignore`.

**R10. Resolve the config-committed contradiction (S4), correct `AGENTS.md` (S5), and turn the
missing-config property into a test** rather than a claim about repository state.

**R11. Write a `README.md` (I9).** The repo carries every signal of intended distribution and no
entry documentation.

### Tier 3 — worth doing, not blocking

**R12.** Persist coverage baselines to `checklist.json`, or narrow the compaction claim (S5b).
**R13.** Clear the residual spec and plan drift (S5c) — matcher list, namespace strip, ban list.
**R14.** Add the Scope/Limitations section: concurrency, monorepos, "one test" (S5d).
**R15.** Run each test file in a subshell and assert an expected total (T3).
**R16.** Promote `e2e/` to an automated smoke test with a recorded expectation, and add resume and
out-of-glob-violation cases (T7).
**R17.** Distinguish measured from judgment-based refactor triggers in the schema (I10), and drop
the vestigial `.tdd/phase` ignore entry (S6).

### Tier 4 — process

**R18. Choose one model for the plan (M1).** Either the plan stops embedding implementations and
carries design intent plus test cases, or it is treated as source and reviewed with the rigour
currently applied to diffs. S2a is what the current hybrid costs: a security fix that landed in the
document and never in the artifact, recorded as complete.

**R19. Reconsider the scope of the measurement layer.** CRAP computation, the mutation agent, and the
coverage ratchets are the highest-cost, highest-risk parts of the system — the spec says so itself
twice — and they serve code quality, which is orthogonal to the one-sentence guarantee the plugin
exists to provide. They are not wrong, but if effort is constrained, the guarantee deserves it first.
The mutation pass earned its place by finding a real defect; the three-tier CRAP pipeline has not yet
demonstrated comparable return.

## 8. Appendix — reproduction

Every finding marked "reproduced" was run against the shipped `hooks/guard.sh` and the live
`.tdd/config.json` at `8e58832`. The repository was left clean (`git status --short` empty, 181/181
passing). Sandboxes were created under the session scratchpad, never in the working tree.

### A · Path-spelling bypasses (S2)

```bash
probe() {
  printf '{"agent_type":"%s","tool_name":"%s","tool_input":{"file_path":"%s"},"cwd":"%s"}' \
    "$1" "$2" "$3" "$PWD" | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh >/dev/null 2>&1
  printf '%-14s %-6s %-40s -> %s\n' "${1##*:}" "$2" "$3" \
    "$([ $? -eq 2 ] && echo DENIED || echo '*** PERMITTED ***')"
}
probe claude-tdd:tdd-red   Read "e2e/src/calc/__init__.py"          # DENIED   (baseline)
probe claude-tdd:tdd-red   Read "E2E/src/calc/__init__.py"          # PERMITTED
probe claude-tdd:tdd-red   Read "e2e/SRC/calc/__init__.py"          # PERMITTED
probe claude-tdd:tdd-green Read "E2E/tests/test_divide.py"          # PERMITTED
probe claude-tdd:tdd-red   Read "/private$PWD/e2e/src/calc/__init__.py"   # PERMITTED
probe claude-tdd:tdd-red   Write "E2E/src/calc/__init__.py"         # DENIED (writes allowlist)
```

`head E2E/src/calc/__init__.py` confirms the uppercase spelling resolves to the real source file.
The filesystem's case-insensitivity was confirmed portably rather than assumed:

```bash
t=$(mktemp -d); : > "$t/aA"; [ -e "$t/Aa" ] && echo insensitive; rm -rf "$t"
```

### A2 · Trailing-`/.` root bypass (S2a)

```bash
. hooks/lib/rules.sh
tdd_normalize_path "/a/b/."          # -> /a/b/.   (unchanged; the fix is only in the plan)

p() { printf '{"agent_type":"claude-tdd:tdd-red","tool_name":"Read","tool_input":{"file_path":"%s"},"cwd":"%s"}' "$2" "$1" \
      | TDD_PROJECT_DIR="$1" bash hooks/guard.sh >/dev/null 2>&1
      echo "$([ $? -eq 2 ] && echo DENIED || echo PERMITTED)  root=$1"; }
p "$PWD"   "$PWD/e2e/src/calc/__init__.py"    # DENIED    (correct)
p "$PWD/." "$PWD/e2e/src/calc/__init__.py"    # PERMITTED (bypass)
```

An **absolute** target path is required: with a relative path the root strip is skipped, so the
malformed root never matters. That is why the existing relative-path regression tests pass.

Confirm the fix never reached code:

```bash
git show --stat b97c69f     # touches only the plan and the spec
```

### B · Zero-depth `**` (S3)

```bash
. hooks/lib/rules.sh
tdd_glob_match "**/test_*.py" "test_foo.py"           # no match
tdd_path_verdict green read "test_foo.py" "tests/** **/test_*.py" "src/**"   # -> allow
```

### C · Read isolation defeated via the permitted runner (S1)

Both directions were run in a scratch project containing a copy of `hooks/` and the live config.
Red's leak used a test file containing `print(open("e2e/src/calc/__init__.py").read())`; Green's used
a source file containing `print(open("e2e/tests/test_secret.py").read())`. In both cases the guard
returned PERMITTED for the `Write` and PERMITTED for the `Bash` invocation of the role's own
configured command, and the forbidden content appeared in the runner's captured output.

### D · Degenerate configs (credited as a strength in §4)

Nine malformed `.tdd/config.json` shapes — missing `globs.source`, `[]`, `null`, a string instead of
an array, missing `globs`, `{}`, non-JSON, and empty — all correctly **denied** a `tdd-red` source
read. The config-parsing surface fails closed consistently.

### E · Portability constraints for the recommended fix

| Constraint | Observed |
|---|---|
| `realpath -m` | **unavailable** — BSD `realpath` on macOS rejects `-m`, so it cannot canonicalise a not-yet-existing path (every new-file `Write`) |
| `${v,,}` | **unavailable** — bash 3.2.57; use `tr '[:upper:]' '[:lower:]'` |
| `cd "$dir" && pwd -P` | available, POSIX, resolves symlinks — the portable canonicalisation route |
