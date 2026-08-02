# Architecture Review Remediation — Implementation Plan

**Date:** 2026-08-01
**Source:** `docs/superpowers/reviews/2026-08-01-architecture-review.md`
**Design contract:** `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` (revised for iteration 2)
**Predecessor:** `docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` (iteration 1, tasks 1–10, complete)

## How this plan differs from iteration 1

**It contains no implementation code.** Iteration 1's plan embedded 1940 lines of bash inside a 2943-line document — 66% of it inside code fences. Under that arrangement the implementer is a transcription step, every design decision has already been made in a document reviewed as prose, and the ledger's closing line follows directly: *20 defects total, all in the plan, none from an implementer.* A reviewer reading prose does not simulate a branch; a reviewer reading code does.

The failure that decides it: commit `b97c69f`, labelled `fix(plan): normalise a trailing /.`, touched the plan and the spec and never `hooks/lib/rules.sh`. The ledger recorded it FIXED. The bypass is still live. *Fixing the document about the artifact is not fixing the artifact* — a lesson the ledger itself names twice, recurring a third time on a security boundary.

So each task below states:

- **Invariant** — the property that must hold when the task is done.
- **Why it fails today** — the observed defect, with its review ID.
- **Constraints** — what the implementer must not get wrong. Portability facts, verified.
- **Tests** — what must be asserted, described by property rather than written out.
- **Done when** — a completion criterion that a reader can check without trusting a claim.

**Every task's "Done when" requires a non-documentation file in the commit stat.** That is not ceremony. It is the direct countermeasure to the failure above, and it is checkable with `git show --stat`.

## Global constraints

These apply to every task and are verified on the development machine, not assumed.

| Constraint | Fact |
|---|---|
| Shell | bash 3.2.57 (macOS system bash). `${v,,}`, `${v^^}`, associative arrays, and `mapfile` are **unavailable**. |
| `realpath` | BSD; **has no `-m`**, so it cannot canonicalise a path that does not exist yet — which is every `Write` of a new file. |
| Canonicalisation route | `cd "$dir" && pwd -P` — POSIX, resolves symlinks, and returns the **true stored case** of every directory component. Verified against a constructed symlink and a case variant together: `cd LINK/SRC/pkg` yields `.../real/src/pkg`. |
| Case folding | `tr '[:upper:]' '[:lower:]'`. |
| Dependencies | `jq` only. No runtime, no packages, no test framework. |
| Test harness | `bash tests/run.sh`, ~1.3s, sourced not executed: no shebang, no `set -e`, no `exit` in test files. |
| Verification | **Green does not mean the assertions ran.** After adding or editing a test file, confirm the passed-count actually moved. |

**A caution specific to this plan.** Two of the findings below were reproduced by the reviewer under `bash`, and re-verifying them by sourcing `hooks/lib/rules.sh` from an interactive **zsh** shell produces different, wrong answers — `[[ == ]]` glob semantics differ between the shells. Verify with `/bin/bash -c '...'` explicitly. This bit during the preparation of this plan.

---

## Tier 1 — before this branch merges

These four tasks are ordered. Task 1 is a live security bypass; Task 2 subsumes it and must not be attempted first.

### Task 1: Land the trailing-`/.` fix in the code

**Invariant.** A project root spelled `$ROOT/.` produces the same verdict as `$ROOT` for every path, role, and mode.

**Why it fails today** (S2a, Critical). `tdd_normalize_path` handles a leading `./` and an interior `/./` but not a trailing `/.`. The fix and its three regression assertions exist in the iteration-1 plan and in the spec; neither ever reached `hooks/lib/rules.sh` or `tests/rules.test.sh`. Reproduced: `tdd_normalize_path "/a/b/."` returns `/a/b/.` unchanged, and a `tdd-red` read of a source file is PERMITTED when the root carries the trailing dot. An **absolute** target path is required to trigger it — with a relative path the root strip is skipped, which is why the existing relative-path regression tests pass.

**Constraints.** Do not fix the other spellings here; Task 2 replaces this layer wholesale and a second one-spelling patch is exactly the pattern this iteration exists to end. This task is the smallest change that closes a live bypass, kept separate so it can merge alone if Task 2 slips.

**Tests.** `tdd_normalize_path` collapses a trailing `/.`; the guard denies an absolute source read under a `$ROOT/.` root, for both `tdd-red` and `tdd-green` in their respective directions.

**Done when.** `git show --stat` names `hooks/lib/rules.sh` and `tests/rules.test.sh`. The suite's passed-count is higher than before by at least the number of assertions added.

### Task 2: Replace lexical normalisation with canonicalisation

**Invariant.** Two spellings that name the same file on disk produce the same verdict — for every role, both modes.

**Why it fails today** (S2, Critical). The guard strips the project root by literal prefix and glob-matches the remainder. Reads are a denylist, so **any path matching no glob is permitted**. Path identity on a real filesystem involves case-folding, symlinks, hardlinks, and mount aliases; none is a lexical property. Three one-spelling fixes have already shipped and these remain live, reproduced against the shipped guard: `E2E/src/calc/__init__.py` and `e2e/SRC/calc/__init__.py` PERMITTED for `tdd-red`, `E2E/tests/test_divide.py` PERMITTED for `tdd-green`, and the `/private` symlink prefix PERMITTED. `head E2E/src/calc/__init__.py` confirms the uppercase spelling resolves to the real file.

**Approach.** Canonicalise both root and target through the filesystem, then compare. Three constraints the obvious recipe gets wrong:

1. **Walk up to the nearest existing ancestor.** Canonicalising `dirname "$p"` fails whenever an agent writes into a new subdirectory, which is ordinary work — BSD `realpath` has no `-m` and `cd` on a non-existent directory fails. Canonicalise the deepest ancestor that exists, then re-append the non-existent tail, lexically normalised. Verified working; the naive `dirname`-only recipe denies a legitimate `tests/new_module/test_foo.py` write.
2. **`pwd -P` recovers directory case for free.** No case-sensitivity probe, no cached flag, no config field. This is better than the review's "detect and cache" recommendation and keeps `guard.sh` stateless, which the spec requires.
3. **The basename is the residual, and folding it is asymmetric.** `pwd -P` does not recover the basename's case, so `E2E/tests/TEST_divide.py` canonicalises to `.../e2e/tests/TEST_divide.py` and still misses `**/test_*.py`. Fold **only in the direction that fails closed**: a *read* matches the denylist against the literal path **or** its case-folded form, and either match denies; a *write* matches the allowlist on the literal path only. Folding a write comparison would permit more, not less. This needs no filesystem probe and is correct on both case-sensitive and case-insensitive filesystems. Cost on a case-sensitive filesystem: a false denial for a repo carrying both `src/` and `SRC/` — loud and safe, the same trade already accepted for the plugin-namespace strip.

**Constraints.** Canonicalisation touches the filesystem on every guarded call; keep it to `cd`/`pwd -P` and avoid creating anything. Preserve the existing `set -f` discipline in `tdd_matches_any` — an unquoted glob string still undergoes pathname expansion and that bug was a silent fail-open on reads.

**Tests.** This is the task that ends spelling-by-spelling testing. See Task 8; write the matrix first and let it drive this implementation.

**Done when.** Every row of the spelling matrix passes, the probes in the review's Appendix A return DENIED for all six read rows, and `git show --stat` names `hooks/lib/rules.sh`.

### Task 3: Correct the enforcement claim and add the threat model

**Invariant.** No document in the repository claims an enforcement property the mechanism does not deliver.

**Why it fails today** (S1 + S5a, Critical). The spec called the hook the "sole enforcement of read isolation". Both constrained roles can obtain the forbidden content using only calls the guard permits — reproduced in both directions, zero denials — because the configured test command is a general-purpose execution engine and each role may author the file it executes. Separately, `observedFailure` hands Green the full body of the test it may not read, on the normal path, by design.

**Status.** The spec half of this is **already done** — see *Threat model*, the revised *The hook and the audit are not redundant*, and *Handover artifact*. What remains is code and prompts.

**Scope.** Bring `AGENTS.md`, `commands/tdd-init.md`, and the four agent prompts into line with the revised spec. Nothing in an agent prompt currently anticipates the rationalisation route ("`Read` was denied, so let me print it from a scratch test"), which is the realistic failure mode — a helpful, goal-directed model routing around an obstacle. Red's and Green's prompts must name that route and forbid it explicitly, because it is the one boundary crossing the guard cannot catch.

**Done when.** `git show --stat` names files under `agents/`. No file in the repository contains the string "sole enforcement".

### Task 4: Fix the resume branch and the mutation round counter

**Invariant.** Re-invoking `/tdd <spec>` on an interrupted run continues it. The mutation round cap bounds repeated survivor-producing passes.

**Why it fails today** (I1 + I2, Critical). `skills/run-tdd-cycle/SKILL.md` asserts "an interrupted run resumes from this file, not from your context", and `## Decompose` is unconditional — "Read the spec once. Write `.tdd/checklist.json`." No branch says *if the checklist exists, load it*. The section claiming resume works is the section that destroys the state resume depends on: item statuses, `knownRed`, `mutationRoundsRun`. Separately, `mutationRoundsRun` increments in a numbered step written after both terminal branches, and the survivor branch hands control back to the per-item loop before reaching it — so the cap is inert on the only path that needs bounding.

**Approach.** Branch before Decompose on the checklist's existence and non-empty items; on resume, re-surface `blocked` items and continue from the first non-terminal one. For the counter, increment and write **first**, then branch on survivors and remaining budget. The file currently anticipates the misreading and argues against it — remove the ordering that invites it instead.

**Constraints.** Neither defect is exercised by the suite or by `e2e/`, which is why both survived every review round. Task 12 adds the e2e cases; do not consider this task verified by inspection alone.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`. A resume against a hand-authored partial checklist preserves every field.

### Task 5: Scope the revert to the offending paths

**Invariant.** The revert procedure can remove the file a guardrail violation created.

**Why it fails today** (I3, Important). The revert is scoped to "the globs that role may write". A violation is *by definition* a write outside those globs — that is what makes it a violation. In the backstop scenario the audit exists for, the rogue file sits outside the glob by construction and `git clean -fd -- <glob>` cannot reach it.

**Approach.** Scope the pathspec to the offending paths the audit reported; fall back to the role's globs only when the audit named none (the ordinary discard case, such as a rejected `passing-flat` test).

**Constraints.** This is the third instance of the revert-does-not-revert class; the first two were command choice, this one is scoping. Do not add `-x` to `git clean` — gitignored paths (the venv, the checklist, the coverage report) must survive.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and an out-of-glob violation is cleaned in the e2e case added by Task 12.

---

## Tier 2 — before calling the plugin releasable

### Task 6: Truncate `observedFailure`

**Invariant.** The mandated handover channel carries no more test content than the runner incidentally prints.

**Why it fails today** (S5a). `observedFailure` is specified as `<verbatim runner output>` and is mandatory; pytest's default traceback reproduces the failing test function's entire body. For most tests, `observedFailure` *is* the test.

**Approach.** Add `commands.singleTerse` to the schema (pytest: `--tb=line`), have Red use it when producing the report, and make `intent`/`expected` the primary contract. Degrade explicitly when it is null — the degradation table already has its row; the user must be told the full traceback is being handed over.

**The spec is already the outlier, deliberately.** The revision for iteration 2 added `commands.singleTerse` and a `baselines` field to the spec's schema blocks and to neither of the other two copies. `config-contract.test.sh` derives its expected keys from `tests/fixtures/config.json` and asserts presence, so an extra key in the spec does not fail it — the suite is green and the drift is unasserted. That is the exact shape of the defect the test exists to catch, one copy further along: reconcile all three copies here, and treat a green suite as no evidence either way.

**Done when.** `git show --stat` names `agents/tdd-red.md`, `commands/tdd-init.md`, and `tests/fixtures/config.json`. The config-contract test pins the new key, and removing it from any one of the three copies turns the suite red.

### Task 7: Add the orchestrator-side test-file scan

**Invariant.** A committed test that reads a `globs.source` path is caught at commit time.

**Why** (S1.3/R7). Prevention is impossible here; detection is cheap and uses the prevent-and-verify split the design already relies on. Scan Red's committed test files for `open(`, `require(`, `include`, `File.read` targeting a `globs.source` path; treat a hit as a guardrail violation under the existing revert-and-re-dispatch rule.

**Constraints.** **Document it as a detector, not a control**, wherever it appears. It is a substring heuristic against an LLM-authored file: it raises the cost of the bypass and catches the obvious spelling, and it does not close the channel. Describing it otherwise manufactures exactly the false confidence Task 3 removes.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and the text describing the scan contains the word "detector".

### Task 8: Convert the suite to a spelling matrix, and kill the surviving mutants

**Invariant.** A new path spelling is caught by the suite, not by a reviewer.

**Why it fails today** (T2 + T1, Important). The suite tests one spelling per property — `./x`, `x//y`, `..`, the three already found — and treats passing as proof. Every bypass in S2 and S2a lives in the gap between "the spellings someone thought of" and "the spellings that exist". `tests/rules.test.sh` asserts the leading and interior dot cases and passes, and its passing is indistinguishable from the property holding.

**Approach.** Replace spelling-by-spelling assertions with a table-driven matrix: for each role × mode × canonical target, iterate a list of spellings — plain, `./x`, `x//y`, absolute, `$ROOT/.`-rooted, uppercase directory, uppercase basename, symlinked — and assert the verdict is identical for all of them. The property is then stated once rather than sampled, and a new spelling is one row.

Four mutants survived the reviewer's mutation run against the guard's decision surface; each names an untested branch:

| Mutation | Why it survived |
|---|---|
| drop `<` from the metacharacter denylist | `<` is never asserted |
| typo the `mutation` command key | the fixture's `commands.mutation` is `null`, so the branch is dead in every test |
| `NotebookRead` path key → `file_path` | `NotebookRead` is never tested, though `NotebookEdit` has a named regression test for this exact bug class |
| split `red\|green` so red loses `single` | Red's Bash access is only ever exercised through the coverage command |

Add a fixture with a non-null `commands.mutation` — one null field currently kills an entire branch of the Bash allowlist in every test.

**Constraints.** A derived loop that enumerates nothing contributes zero assertions and leaves the suite green while the check has silently vanished; this has already happened here, when a one-character `jq` typo dropped 46 assertions and the run reported "122 passed, 0 failed". Count the iterations and assert a floor.

**Done when.** The passed-count rises by the matrix's full cardinality, and re-applying each of the four mutations above turns the suite red.

### Task 9: Fix the leading-`**` zero-depth gap

**Invariant.** `**/x` matches `x` at zero depth, as it does in every glob dialect a config author knows.

**Why it fails today** (S3, Important). `tdd_glob_match` rewrites `**` to `*`, so `**/test_*.py` becomes `*/test_*.py` and requires at least one directory component. Verified under bash: `**/test_*.py` does not match `test_foo.py`, `**/*_test.go` does not match `main_test.go`, and `tdd_path_verdict green read "test_foo.py" ...` returns `allow`. `/tdd-init` proposes exactly these globs; a root-level `main_test.go` is idiomatic Go.

**Approach.** Expand a leading `**/` to match both depths. Add zero-depth assertions for every glob shape `/tdd-init` proposes. Have the partition check **refuse** to classify a file into `globs.ignore` when its name matches a recognised test-file pattern, and say why — the partition check masks this today, and the natural resolution (dropping the stray file into `ignore`) silently removes read isolation for it.

**Note.** The `**`→`*` substitution itself is a no-op under bash `[[ == ]]`, where `*` already crosses `/`. Removing it survives mutation because it does nothing. It is dead code and the same line that produces this gap.

**Done when.** `git show --stat` names `hooks/lib/rules.sh` and `commands/tdd-init.md`.

### Task 10: Resolve the config-committed contradiction and turn the missing-config property into a test

**Invariant.** Every claim about `.tdd/config.json`'s tracked status agrees, and the guard's missing-config behaviour is asserted rather than described.

**Why it failed** (S4 + S5, Important). The spec gave three answers in three places — the State table said gitignored, two later statements said committed. If an implementer follows the table, `/tdd-init`'s commit becomes a silent no-op (`git add` on an ignored path does nothing without `-f`), breaking the first-run path that step exists to protect. Separately, `AGENTS.md` claimed this repo has no `.tdd/config.json`, so a `tdd-*` dispatch denies every guarded call with "run /tdd-init" — but the file **exists on disk**, gitignored, and a live probe showed dispatches guarded normally against the fixture's globs (`tdd-red` writing `e2e/tests/test_new.py` is permitted).

**Status.** The spec and `AGENTS.md` halves are **done**. The spec now states that target projects commit the config, and that this repository gitignores its own because that config describes the `e2e/` fixture rather than the plugin — a distinction the next reader should not have to re-derive.

**What remains.** Have `/tdd-init` verify `git ls-files .tdd/config.json` is non-empty after committing, and add a real assertion to `tests/guard.test.sh` — point `TDD_PROJECT_DIR` at an empty sandbox and assert exit 2 with the `run /tdd-init` message. Note that this asserts the *guard's* missing-config behaviour, which is genuine contract; it is no longer a claim about this repository's incidental state.

**Why the test matters more than the correction.** A safety property verified by *the repository's own incidental state* rather than by a test drifts silently, because nothing runs when it changes. That is the general pattern (M3); this was its clearest instance, and correcting the prose does not close it.

**Done when.** `git show --stat` names `tests/guard.test.sh` and `commands/tdd-init.md`.

### Task 11: Write a `README.md`

**Invariant.** An installing user has entry documentation.

**Why** (I9). The repo has `plugin.json`, `marketplace.json`, an MIT licence and keywords — every signal of intended distribution — and no README. Cover: what the plugin guarantees, what it explicitly does not (link the threat model), `/tdd-init` then `/tdd`, the config schema, and the degradation table.

Two packaging defects belong here. `source: "./"` ships the whole repository — `docs/`, `.superpowers/`, `tests/`, `e2e/`, `.idea/`; the ledger records this as fixed, but it was fixed by *documenting* it, not by excluding anything. And `version` is duplicated across `plugin.json` and `marketplace.json` with nothing keeping them in sync, while `config.version` is written by `/tdd-init` and read by nothing.

**Done when.** `README.md` exists and `git show --stat` names it.

---

## Tier 3

### Task 12: Promote `e2e/` to an automated smoke test

**Invariant.** A change that breaks the live workflow fails something.

**Why it fails today** (T7, Important). `e2e/` is a recorded artifact, not a regression test: not wired into `tests/run.sh`, nothing re-runs it, nothing diffs its result against a committed expectation, and `e2e/tests/test_divide.py` carries a comment marking one test as "PLANTED for Task 10". It is a hand-built illustration of a past run.

That matters because the ledger records **8 of 20 defects were found only by running the system**, including the two most consequential. The only mechanism that finds that class of defect is manual and unautomated — and this review found four more of the same kind.

**Approach.** Record an expected outcome (final checklist state, commit subjects, test count) and diff against it. It may be invoked separately from `tests/run.sh` since it needs a live session. Add two cases for paths this review found broken and nothing exercises: **resume** (Task 4) and an **out-of-glob violation** (Task 5).

**Done when.** A documented command runs the e2e workflow and fails on a seeded regression.

### Task 13: Run each test file in a subshell and assert an expected total

**Why** (T3, Minor). `tests/run.sh` sets `set -uo pipefail` and sources test files into the same process, so a file referencing an unset variable kills the whole harness — every later file never runs, and no "N passed, N failed" line is printed at all. The exit code is 1, so CI cannot be fooled; only a human reading the pass count rather than the exit status is misled. That is why it is Minor despite affecting everything.

**Done when.** A deliberately broken test file yields a legible failure and a summary line, and later files still run.

### Task 14: Remaining correctness and consistency items

Each is small, independently verifiable, and named by the review. Group them into one or two commits by scope.

| ID | Item |
|---|---|
| I4 | Validate `testId` against `globs.test` orchestrator-side before dispatch; reject `..` in the Bash delta as defence in depth. |
| I5 | Green's dispatch: "Red's handover report **and** `limits.greenAttempts`. Do not paste test source." The current "only the report" contradicts `tdd-green.md`, which says the orchestrator passes the limit. |
| I7 | Agent input lists omit inputs their own procedures require: `tdd-red.md` omits the coverage baseline it is told to compare against; `tdd-refactor.md` omits `knownRed`. |
| I8 | Tie `tdd-mutate`'s `blocked` outcome to the stop-and-escalate rule, as every other role's is. |
| I11 | `tests/fixtures/config.json` omits `globs.ignore`; the fixture is the schema's only executable specimen and should be faithful. |
| S6 | Drop the vestigial `.tdd/phase` entry from `.gitignore` — the phase marker was eliminated and nothing writes it. |
| S5b | Persist coverage baselines into `checklist.json` (schema already revised in the spec). |
| S5c | Clear residual plan drift: the iteration-1 plan's File Structure table still describes a four-tool matcher while its own embedded `hooks.json` has seven. |

---

## Tier 4 — process

### Task 15: Re-audit the ledger's "FIXED" lines

**Why** (R1, second half). S2a is a fix recorded as complete that never reached the code. If it happened once it can have happened more than once, and the ledger is the project's primary record.

**Status: substantially done, and the result bounds the work.** A direct diff of every code block the iteration-1 plan embeds against its shipped counterpart found **exactly one** drift: the `*/.)` case missing from `hooks/lib/rules.sh`. `hooks/guard.sh` and `tests/fixtures/config.json` match byte for byte; `tests/run.sh` differs only in variable naming and stripped comments.

A commit-stat scan flags 18 ledger SHAs as touching only documentation, but that measure over-reports badly under iteration 1's plan-as-source model — fixing the plan *before* transcription is the intended workflow there, and spot-checks confirm those fixes did reach the code (the namespace strip, the per-tool path key, the empty-prefix deny are all present in the shipped guard).

**What remains.** Extend the block-diff to the files the plan embeds beyond the four checked: `agents/*.md`, `commands/*.md`, `skills/run-tdd-cycle/SKILL.md`, `hooks/hooks.json`. Record the result in the ledger.

**Done when.** The ledger carries the audit's result, including the count of blocks compared.

### Task 16: Record the methodology decisions

Two decisions were taken when this plan was commissioned. Write them into the ledger so they are not relitigated:

- **The plan carries design intent, not implementation** (R18). The current document is the first instance. The hybrid it replaces got the cost of both models and the benefit of neither: the plan carried the risk of code while receiving the scrutiny of prose.
- **The measurement layer stays** (R19). CRAP, the coverage ratchets and the mutation pass are all retained; only the defects found are fixed. Rationale is recorded in the spec's *Risks* under "Decided, not open", including what would change the judgment.

One lesson is worth stating in its own right (M2): **"green" from a harness that cannot distinguish "no assertion failed" from "no assertion ran" is not evidence.** A one-character `jq` typo once deleted 46 assertions while the suite reported "122 passed, 0 failed", and the root cause was carried as a deferred minor for five tasks while the class recurred six times. The structural fix landed; the lesson should not have to be relearned.

---

## Ordering

Tier 1 is ordered; Task 1 before Task 2, and Task 8's matrix is written before Task 2's implementation so it drives it. Within Tier 2 and Tier 3 the tasks are independent and may be taken in any order, except that Task 12 depends on Tasks 4 and 5 having landed — its two new cases exercise them.

Tasks 3, 4, 5, 6, 7 and 14 modify prompts and orchestration rather than code, so their real verification is Task 12, not the unit suite. Do not treat inspection of a Markdown file as evidence that a workflow branch works — the four defects this review found in `SKILL.md` were all invisible to document review, and roughly forty prior review rounds passed over them.

## Status of the findings this plan does not change

Recorded so nothing reads as an oversight:

- **S1's bypass is not closed**, only detected and documented. Closing it needs process-level sandboxing, which the spec now rules out explicitly.
- **T4** (deny assertions check the verdict bit, not which rule fired) and **T5** (nine degenerate config shapes verified by hand, not by the suite) are real and are folded into Task 8's matrix work where they overlap. Neither gets its own task.
- **T6** (nothing asserts `hooks.json` wiring, `plugin.json` validity, or agent `tools:` frontmatter) is accepted for now. The `tools:` frontmatter is the one with teeth — it is a strict subset of the `PreToolUse` matcher today, and nothing enforces that it stays one.
