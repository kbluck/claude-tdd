# Node Port and Architecture Review Remediation — Implementation Plan

**Date:** 2026-08-01
**Sources:** `docs/superpowers/reviews/2026-08-01-architecture-review.md`; the Windows fail-open analysis recorded in the spec under *Why the guard is written in Node*
**Design contract:** `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` (revised for iteration 2)
**Predecessor:** `docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` (iteration 1, tasks 1–10, complete)

## What this iteration does

Two things at once, because doing them separately means writing the path layer twice:

1. **Ports the guard from bash 3.2 + `jq` to Node.** On Windows without Git Bash, Claude Code hands a `.sh` hook to PowerShell, which cannot run it — and `PreToolUse` treats every non-zero exit except 2 as a non-blocking error, so the tool call proceeds. The plugin installed, looked healthy, and enforced nothing on an entire platform, on the read path, with no diff signature.
2. **Fixes the twenty-odd findings of the architecture review.** Several of them are path-layer defects that the port dissolves rather than fixes; the rest are prompt, orchestration and test-coverage work that the port does not touch.

**Target: Node 22** — the oldest LTS still in support (Maintenance LTS through April 2027; Node 20 reached EOL in April 2026).

## How this plan differs from iteration 1

**It contains no implementation code.** Iteration 1's plan embedded 1940 lines of bash inside a 2943-line document — 66% of it inside code fences. Under that arrangement the implementer is a transcription step, every design decision has already been made in a document reviewed as prose, and the ledger's closing line follows directly: *20 defects total, all in the plan, none from an implementer.*

The failure that decides it: commit `b97c69f`, labelled `fix(plan): normalise a trailing /.`, touched the plan and the spec and never `hooks/lib/rules.sh`. The ledger recorded it FIXED. *Fixing the document about the artifact is not fixing the artifact.*

So each task states the **invariant**, **why it fails today**, the **constraints** an implementer must not get wrong, the **tests**, and a **done-when** that a reader can check without trusting a claim. **Every done-when requires a non-documentation file in the commit stat**, checkable with `git show --stat`.

## Global constraints

| Constraint | Fact |
|---|---|
| Runtime | Node 22 (oldest supported LTS). Pin it in `.node-version` so `fnm` selects it; the dev machine otherwise runs 26. |
| Hook registration | **Exec form** — `"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"]`. Spawns directly, no shell, no `${VAR}`-versus-`$env:VAR` dialect. |
| Module format | ESM (`.mjs`). No runtime dependencies and **no build step** — the file the hook runs is the file you edit. |
| Type checking | `// @ts-check` plus JSDoc, verified with `tsc --noEmit` (checked against TypeScript 7.0.2). Dev dependency only: if it is absent, type checking is lost and the guard still runs correctly. **Not** TypeScript compiled to JS — see the spec, *Types without a compile step*. |
| Forbidden APIs | `path.matchesGlob` (v22.5.0, experimental — unavailable on early 22.x). The ambient `path` module for **matching** — `path.win32.normalize("e2e/src/x.py")` returns `e2e\src\x.py`, which manufactures the very bypass we are closing. |
| Test runner | `node:test` + `node:assert`, stable since Node 20. |
| Exit semantics | Only **2** blocks. Every other non-zero exit permits the tool call. Any uncaught throw is therefore a fail-open. |

**The instrument hazard has moved, not gone.** Iteration 1's was sourcing a bash library into zsh. This iteration's is **developing on Node 26 while targeting Node 22**: an API added after 22 works perfectly on the dev machine and fails for users. `.node-version` plus `fnm` is the mitigation; treat a green suite on the wrong major as no evidence at all.

---

## Tier 0 — the gate

### Task 1: Spike the hook contract under exec form

**Nothing else is worth building until these are known.** This is the same decision-gate discipline that Task 1 of iteration 1 applied to `agent_type`, and it earned its place there by finding the orchestrator-audit bug.

Four unknowns, each load-bearing and each cheap to settle:

1. **Does `${CLAUDE_PLUGIN_ROOT}` expand inside `args`?** Exec form is documented as spawning without a shell. If plugin variables are expanded by Claude Code before the spawn, exec form is correct; if they are expanded *by the shell*, exec form receives a literal `${CLAUDE_PLUGIN_ROOT}` and the guard never launches — which fails open.
2. **Does `agent_type` still arrive namespaced?** Re-confirm `claude-tdd:tdd-red` rather than assuming iteration 1's finding survives a different hook registration.
3. **How is stdin delivered, and can it be read reliably?** The payload arrives on stdin. `fs.readFileSync(0, 'utf8')` can throw `EAGAIN` on a non-blocking pipe. Establish which read strategy is safe within the 10s timeout.
4. **Does exit 2 with a JSON body on stdout still block, and is the `systemMessage` delivered verbatim to the subagent?** Iteration 1 established this for the shell form; it is the mechanism the entire design rests on.

**Done when.** Each of the four has an observed answer recorded in the ledger — not an inferred one. If (1) fails, fall back to shell form with an explicit `"shell"` field and re-spike, because that reintroduces the dialect problem the exec form exists to avoid.

### Task 1b: Finish the ledger block-diff — **before anything deletes the bash sources**

**This is in Tier 0 because it has an expiry.** Task 3 deletes `hooks/guard.sh` and `hooks/lib/rules.sh`; after that the comparison target no longer exists and this audit becomes impossible. Scheduling it late and relying on a note in the Ordering section is the weaker half of the very pattern this iteration exists to correct.

**Invariant.** Every code block iteration 1's plan embeds matches the artifact it was transcribed into, or the difference is recorded.

**Status.** Four files done and the result bounds the rest: `hooks/guard.sh` and `tests/fixtures/config.json` match byte for byte, `tests/run.sh` differs only in variable naming and stripped comments, and `hooks/lib/rules.sh` is missing exactly one line — the `*/.)` case the ledger recorded as FIXED. That is the only drift in the security-critical files.

A commit-stat scan flags 18 ledger SHAs as documentation-only, but that measure over-reports under iteration 1's plan-as-source model, where fixing the plan before transcription was the intended workflow. Spot-checks confirm those reached the code.

**What remains.** Extend the diff to `agents/*.md`, `commands/*.md`, `skills/run-tdd-cycle/SKILL.md` and `hooks/hooks.json`.

**Done when.** The ledger records the result and the count of blocks compared.

---

## Tier 1 — the port

Ordered. Task 2 before Task 3: the suite is what makes the port safe, and writing it after the implementation means testing what was built rather than what was specified.

### Task 2: Port the test suite to `node:test`, as a spelling matrix

**Invariant.** Every bypass this project has ever found reproduces **red** against an empty implementation, and a new path spelling is caught by the suite rather than by a reviewer.

**Why this is first.** The 589 lines of bash tests encode twenty defects' worth of history, and a mechanical port loses it. The suite is the deliverable here; the implementation in Task 3 is what makes it pass.

**Approach.** Replace spelling-by-spelling assertions with a table-driven matrix: for each role × mode × canonical target, iterate every spelling and assert the verdict is identical for all of them. The property is stated once instead of sampled, and a new spelling is one row.

Spellings that must be rows, each one a defect this project actually shipped or that the port introduces:

| Spelling | Origin |
|---|---|
| `x` | baseline |
| `./x`, `x//y` | iteration-1 fixes |
| absolute path | iteration-1 fix |
| root spelled `$ROOT/.` | S2a — **recorded FIXED, never in the code** |
| `..` traversal | iteration-1 fix |
| uppercase directory, uppercase basename | S2 — live at time of review |
| symlinked route (`/tmp` versus `/private/tmp`) | S2 residual, recorded not fixed |
| **backslash separators** | **new: introduced by Windows support** |
| drive-letter case (`C:` versus `c:`) | new: Windows |

Plus the branches iteration 1 never covered, each of which survived a mutation: `NotebookRead`'s path key, `<` in the metacharacter list, Red's `single` command, and a fixture whose `commands.mutation` is non-null (the current `null` makes an entire branch of the Bash allowlist structurally dead in every test).

**Constraints.** Assert **which rule fired**, not merely that the verdict was `deny` — nearly every iteration-1 deny assertion checked a boolean, so a mutation that denied for the wrong reason passed. Cover the nine degenerate config shapes (missing `globs.source`, `[]`, `null`, a string for an array, missing `globs`, `{}`, non-JSON, empty file) that were verified by hand and never committed as tests.

**Done when.** The whole matrix runs red against a stub, `git show --stat` names files under `tests/`, and the row count is asserted so a matrix that silently enumerates nothing fails.

### Task 3: Port the guard and the decision rules to Node

**Invariant.** The guard produces the same verdict as the bash implementation for every case the bash implementation got right, and the correct verdict for every case it got wrong.

**Scope.** `hooks/guard.sh` + `hooks/lib/rules.sh` (321 lines) become `hooks/guard.mjs` + `hooks/lib/rules.mjs`. `hooks/hooks.json` moves to exec form. `jq` disappears — 11 call sites, JSON is native.

**What the port dissolves.** These are not fixed; they cannot occur:

- the `set -f` glob-expansion fail-open, where an unquoted glob string expanded against the filesystem and made the verdict depend on the working directory;
- the `${p//\/\//\/}` replacement-half trap, which silently emitted `e2e\/src/a.py` and bit twice;
- an empty static prefix making `case "$cmd" in *)` match every command;
- unset positionals aborting the whole script under `set -u`.

**The path layer, which is the security-critical part.** Four rules, each with a failure mode named in the spec:

1. **Canonicalise with `fs.realpathSync.native`**, which resolves symlinks and returns the filesystem's stored spelling — closing the case bypass and the symlink residual together, with no case-detection probe.
2. **Resolve the nearest existing ancestor, then re-append the tail.** `realpath` throws `ENOENT` on a path that does not exist, and every `Write` of a new test has a non-existent leaf. Resolving only the parent rejects a legitimate write into a new subdirectory.
3. **Convert separators to `/` before any comparison**, on both root and target. Globs are a POSIX-spelled dialect. Do not reach for the ambient `path` module to do it.
4. **Fold case asymmetrically.** A read matches the denylist against the resolved path *or* its case-folded form and either match denies; a write matches the allowlist on the resolved path only. Folding a write comparison permits more, not less.

**Own the glob matcher.** `*` matches within one segment, `**` crosses `/`, and **a leading `**/` matches at zero depth** — the S3 defect, where `**/test_*.py` missed a root-level `test_foo.py` and `**/*_test.go` missed an idiomatic Go `main_test.go`, so Green could read them.

**Constraints.** Wrap the entire body so that any thrown error becomes a deliberate exit 2 — an uncaught exception exits 1, which permits. Do not call `process.exit()` in the same tick as a stdout write; the write can truncate. `realpath` failures deny.

This task also adds the `package.json` and `tsconfig.json` the type checking needs — `devDependencies` only, `noEmit`, `allowJs` and `checkJs`, with `@types/node` on the 22 line. **Typing the config does not replace validating it**: every degenerate shape in Task 2 must still fail closed at runtime, because the guard parses untrusted JSON and a `@typedef` guarantees nothing about what is on disk.

**Done when.** Task 2's matrix passes in full; the review's Appendix A probes return DENIED on all six read rows; `git show --stat` names `hooks/guard.mjs`, `hooks/lib/rules.mjs` and `hooks/hooks.json`; and the bash files are deleted in the same commit.

### Task 4: Preflight and `/tdd-init` learn about the interpreter

**Invariant.** A missing or too-old Node is a loud setup failure, never a silent unenforced run.

**Why.** A missing interpreter fails open exactly as a missing shell did. Preflight item 6 changes from "`jq` is on `PATH`" to a **version** check — an interpreter too old to run the guard fails identically to an absent one. Item 7, the probe that dispatches a subagent and confirms an observed denial, is the only check that catches a guard which never launched; it stays, and its importance goes up.

`/tdd-init` reports the same at setup, and gains the `commands.singleTerse` detection from Task 8.

**Done when.** `git show --stat` names `commands/tdd-init.md` and `skills/run-tdd-cycle/SKILL.md`, and pointing the suite at a stubbed too-old interpreter produces a refusal rather than a run.

---

## Tier 2 — findings the port does not touch

These are prompt and orchestration defects. None involves the guard's implementation language.

### Task 5: Correct the enforcement claim in the prompts

**Invariant.** No document or prompt claims an enforcement property the mechanism does not deliver.

**Status.** The spec half is **done** — see *Threat model*, the revised *The hook and the audit are not redundant*, and *Handover artifact*. What remains is the agent prompts.

Nothing in them anticipates the **rationalisation route**: Red genuinely needs the public API signature, `Read` is denied, and "let me print it from a scratch test" is exactly the shape a capable model produces when blocked — helpful, goal-directed, and fatal to the guarantee. Both directions were reproduced with zero guard denials. Red's and Green's prompts must name that route and forbid it, because it is the one crossing the guard cannot catch.

**Done when.** `git show --stat` names files under `agents/`, and no file in the repository contains "sole enforcement".

### Task 6: Fix the resume branch and the mutation round counter

**Invariant.** Re-invoking `/tdd <spec>` on an interrupted run continues it. The round cap bounds repeated survivor-producing passes.

**Why it fails today** (I1 + I2, Critical). `SKILL.md` asserts "an interrupted run resumes from this file, not from your context", and `## Decompose` is unconditional. The section claiming resume works is the section that destroys the state it depends on — item statuses, `knownRed`, `mutationRoundsRun`, the baselines. Separately, `mutationRoundsRun` increments in a step written after both terminal branches, and the survivor branch returns to the per-item loop before reaching it, so the cap is inert on the only path needing it.

**Approach.** Branch on the checklist's existence before Decompose; re-surface `blocked` items and continue from the first non-terminal one. Increment and write the counter **first**, then branch on survivors and remaining budget.

**Constraints.** Neither defect is exercised by any test, which is why both survived every review round. Task 12 adds the cases; inspection is not verification.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and a resume against a hand-authored partial checklist preserves every field.

### Task 7: Scope the revert to the offending paths

**Invariant.** The revert can remove the file a guardrail violation created.

**Why it fails today** (I3). The revert is scoped to the globs the role may write. A violation is *by definition* a write outside those globs — so in the backstop scenario the audit exists for, the rogue file is unreachable by a glob-scoped `git clean`.

**Approach.** Scope to the offending paths the audit reported; fall back to the role's globs only when the audit named none.

**Constraints.** Third instance of revert-does-not-revert; the first two were command choice, this is scoping. Do not add `-x` to `git clean` — the venv, checklist and coverage report must survive.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and the out-of-glob case in Task 12 cleans.

### Task 8: Truncate `observedFailure`

**Invariant.** The mandated handover channel carries no more test content than the runner incidentally prints.

**Why** (S5a, Critical). `observedFailure` is specified as verbatim runner output and is mandatory; a default pytest traceback reproduces the failing test function's entire body. For most tests, `observedFailure` *is* the test — so Green is denied `Read` on the test file and then handed its contents as required input, on the normal path, by design.

**Approach.** Add `commands.singleTerse` (pytest: `--tb=line`), have Red use it for the report, and make `intent`/`expected` the primary contract. Degrade explicitly when null.

**The spec is deliberately the outlier.** The iteration-2 revision added `commands.singleTerse` and a `baselines` field to the spec's schema blocks and to neither of the other two copies. The contract test derives its expected keys from the fixture and asserts presence, so an extra spec key does not fail it — the suite is green and the drift is unasserted, which is the shape of the defect that test exists to catch. Reconcile all three copies here.

**Done when.** `git show --stat` names `agents/tdd-red.md`, `commands/tdd-init.md` and the fixture; removing the key from any one of the three copies turns the suite red.

### Task 9: Add the orchestrator-side test-file scan

**Invariant.** A committed test that reads a `globs.source` path is caught at commit time.

**Why.** Prevention is impossible; detection is cheap and uses the prevent-and-verify split the design already relies on. Scan Red's committed tests for `open(`, `require(`, `include`, `File.read` targeting a source path; treat a hit as a guardrail violation.

**Constraints.** **Document it as a detector, not a control.** It is a substring heuristic against an LLM-authored file: it raises the cost and catches the obvious spelling, and it does not close the channel.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and the text describing the scan contains "detector".

### Task 10: Config-committed contradiction and the missing-config test

**Invariant.** Every claim about `.tdd/config.json`'s tracked status agrees, and the guard's missing-config behaviour is asserted rather than described.

**Status.** The spec and `AGENTS.md` halves are **done**. The spec now states that target projects commit the config, and that this repository gitignores its own because that config describes the `e2e/` fixture.

**What remains.** `/tdd-init` verifies `git ls-files .tdd/config.json` is non-empty after committing — `git add` on an ignored path is a silent no-op without `-f`, which would break the first-run path that step exists to protect. And the suite gains a missing-config assertion: point the guard at an empty sandbox and assert exit 2 with the setup message.

**Why the test matters more than the correction.** A safety property verified by *the repository's own incidental state* drifts silently, because nothing runs when it changes.

**Done when.** `git show --stat` names a test file and `commands/tdd-init.md`.

### Task 11: `README.md` and packaging

**Invariant.** An installing user has entry documentation, and it states the Node requirement.

Cover what the plugin guarantees, what it explicitly does not (link the threat model), the Node 22 requirement, `/tdd-init` then `/tdd`, the config schema, and the degradation table.

Two packaging defects belong here. `source: "./"` ships the whole repository — `docs/`, `.superpowers/`, `tests/`, `e2e/`, `.idea/`; the ledger records this fixed, but it was fixed by *documenting* it. And `version` is duplicated across `plugin.json` and `marketplace.json` with nothing keeping them in sync, while `config.version` is written by `/tdd-init` and read by nothing.

**Done when.** `README.md` exists and `git show --stat` names it.

---

## Tier 3

### Task 12: Promote `e2e/` to an automated smoke test

**Invariant.** A change that breaks the live workflow fails something.

**Why** (T7). `e2e/` is a recorded artifact, not a regression test: not wired into the suite, nothing re-runs it, nothing diffs it against an expectation, and one test carries a comment marking it "PLANTED for Task 10".

The ledger records **8 of 20 defects found only by running the system**, including the two most consequential — and this review found four more of that kind. The only mechanism that finds that class is currently manual.

**Approach.** Record an expected outcome (final checklist state, commit subjects, test count) and diff against it. Add the two cases this review found broken and nothing exercises: **resume** (Task 6) and an **out-of-glob violation** (Task 7).

**Done when.** A documented command runs the workflow and fails on a seeded regression.

### Task 13: Remaining consistency items

| ID | Item |
|---|---|
| I4 | Validate `testId` against `globs.test` orchestrator-side before dispatch; reject `..` in the Bash delta as defence in depth. The two halves of the guard currently disagree about whether traversal matters. |
| I5 | Green's dispatch: "Red's handover report **and** `limits.greenAttempts`." The current "only the report" contradicts `tdd-green.md`. |
| I7 | `tdd-red.md` omits the coverage baseline its own step 4 uses; `tdd-refactor.md` omits `knownRed`. |
| I8 | Tie `tdd-mutate`'s `blocked` outcome to the stop-and-escalate rule, as every other role's is. |
| I11 | The fixture omits `globs.ignore`; it is the schema's only executable specimen and should be faithful. |
| S6 | Drop the vestigial `.tdd/phase` entry from `.gitignore`. |
| S5b | Persist coverage baselines into `checklist.json` (schema already revised in the spec). |
| — | Rewrite `AGENTS.md`'s bash-specific traps once the port lands. The fail-open asymmetry, doc-versus-artifact, revert, `git add -A` and bytecode entries all survive; the shell-dialect ones become history and the Node-major hazard replaces them. |

---

## Tier 4 — process

### Task 14: Record the decisions

Three, so they are not relitigated:

- **The plan carries design intent, not implementation** (R18). This document is the first instance.
- **The measurement layer stays** (R19). CRAP, the coverage ratchets and the mutation pass are retained; only found defects are fixed. The mutation pass earned its place by finding a real spec violation; the CRAP pipeline has not yet shown comparable return and is the first thing to reconsider.
- **The substrate is Node 22**, for the reason in the spec: bash failed open on Windows, and a fail-open on the read path is the failure this design exists to prevent.
- **Checked JavaScript, not compiled TypeScript.** `target: ES2023` was measured and does not gate the `node:*` API surface — a file calling `path.matchesGlob` and `fs.globSync` compiled clean under it. The deciding argument is fail direction: a stale build artifact runs and fails open, whereas a missing type-checker merely stops checking. Full rationale in the spec under *Types without a compile step*.

One lesson worth stating in its own right (M2): **"green" from a harness that cannot distinguish "no assertion failed" from "no assertion ran" is not evidence.** A one-character `jq` typo once deleted 46 assertions while the suite reported "122 passed, 0 failed". Carry that requirement into `node:test`, which has its own version of the same trap — a `describe` block that throws during collection can report zero failures.

---

## Ordering

Tier 0 gates everything, and Task 1b is in Tier 0 precisely because Task 3 destroys its comparison target. Within Tier 1 the order is strict: 2 → 3 → 4.

Tier 2 and Tier 3 are independent of the port and of each other, except that Task 12 needs Tasks 6 and 7 landed, since its new cases exercise them.

Tasks 5–10 and 13 modify Markdown, so their real verification is Task 12, not the unit suite. Do not treat reading a prompt as evidence that a workflow branch works — the four `SKILL.md` defects this review found were all invisible to document review, and roughly forty prior rounds passed over them.

## Findings this plan does not close

- **S1's bypass remains open**, detected and documented rather than closed. Closing it needs process-level sandboxing, which the spec rules out explicitly.
- **T4** (deny assertions check the verdict bit, not the branch) and **T5** (degenerate config shapes untested) are folded into Task 2 rather than given their own tasks.
- **T6** — nothing asserts `hooks.json` wiring, `plugin.json` validity, or agent `tools:` frontmatter. The frontmatter is the one with teeth: it is a strict subset of the `PreToolUse` matcher today, and nothing enforces that it stays one.
- **Windows is not verified**, only written for. The spelling matrix asserts separator and case handling as data from a POSIX machine. Nobody has run this on Windows, and the claim should not be made until someone has.
