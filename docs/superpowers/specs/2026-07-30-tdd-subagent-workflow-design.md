# TDD Subagent Workflow — Design

**Date:** 2026-07-30
**Status:** Implemented; iteration 2 in progress. This document was updated after the build to match the shipped system — several designs below changed on contact with reality, and each such change is marked with *why*.

**Iteration 2** folds in `docs/superpowers/reviews/2026-08-01-architecture-review.md`. That review reproduced live read-isolation bypasses against the shipped guard and found that the enforcement claim below overstated what the mechanism delivers. Sections revised for it carry a *(iteration 2)* marker. The remediation tasks live in `docs/superpowers/plans/2026-08-01-architecture-review-remediation.md`.

**Iteration 2 also changes the implementation substrate from bash to Node.** See *Why the guard is written in Node*. The role model, the boundaries, the handover contract and the orchestrator loop are unaffected — they are Markdown prompts and they do not move.

**Claims in this document describe the design, not necessarily the shipped code.** Where the two are known to differ, the text says so explicitly. That distinction exists because the review found a security fix that had landed in the plan and the spec but never in the code, recorded as complete.

## Purpose

A Claude Code plugin that implements Red-Green-Refactor TDD by dispatching role-constrained subagents. The governing principle: **no single agent writes both a test and the code that satisfies it.** Agents implement tests, or they implement code, never both in one context.

A secondary principle is minimalism. Each agent stops and hands over the moment it achieves its immediate objective.

### Scope

In scope: driving an existing specification to implementation through constrained Red/Green/Refactor cycles.

Out of scope: authoring the specification, and reviewing the resulting code for quality. The workflow starts from a spec that already exists and ends when the checklist has no pending items.

## Threat model *(iteration 2)*

Every enforcement claim in this document is scoped to one adversary. Naming it is what keeps the claims honest.

**The adversary is a capable, goal-directed model that is not trying to subvert the workflow but will route around an obstacle to complete its task.** The realistic failure mode is not malice; it is rationalisation. Red genuinely needs the public API signature to write a compiling test. When `Read` is denied, "let me print it from a scratch test" is exactly the shape of reasoning a capable model produces when blocked — helpful, goal-directed, and fatal to the guarantee.

**What is enforced.** Read isolation against *incidental* violation: an agent reaching for `Read` on the wrong file. That is the common case, and the guard catches it reliably and loudly.

**What is not enforced.** Read isolation against *motivated* violation. Three channels carry forbidden content past the guard with zero denials, and none can be closed in the guard at all — they are properties of the workflow, not of its implementation:

1. **The permitted runner executing an agent-authored file.** The configured test command is a general-purpose code execution engine, and each role is permitted to author the file that engine executes. Red writes a test containing `print(open("<source>").read())`, runs its own configured command, and the source comes back under captured stdout. Green does the symmetric thing through a source file the test imports. Both were reproduced against the shipped guard. Any design in which a constrained role writes the test *and* runs the runner has this property; no metacharacter rule touches it, because no metacharacters are involved.
2. **`observedFailure` on the normal path.** See *Handover artifact* — a default traceback reproduces the failing test's body, and the workflow hands that to Green as required input.
3. **The orchestrator itself.** It is exempt from the guard by construction (`agent_type` absent → permit) and hand-authors every dispatch prompt. It is a trusted, unenforceable participant.

**Consequences accepted.**

- A model that actively wants to defeat the boundary can. That is accepted, not mitigated.
- A hard guarantee would require process-level isolation — running the agent's test command in a sandbox that cannot see `globs.source`. That is a much larger change than the property is worth here. The question is closed, not deferred.
- Channels 1 and 2 get *detection* rather than prevention: a commit-time scan (see *The hook and the audit are not redundant*) and a terse-traceback requirement (see *Handover artifact*). Both raise the cost of the bypass. Neither closes it, and neither should be described as a control.

**The spec file is an unsanitised trust boundary.** Red reads an arbitrary user-supplied spec. The guard bounds *where* an agent may act, never *what* it does within that boundary. A spec instructing behaviour that the implementation should exfiltrate data produces a compliant Green writing exactly that — entirely within `globs.source`, using only configured commands, with zero denials. **Running `/tdd` against an untrusted spec carries the same risk as executing code from that spec's author.**

## Limitations *(iteration 2)*

Each is defensible as a v1 boundary. None is defensible as a surprise.

- **No concurrency story.** There is no lock file, PID guard, or staleness check on `.tdd/checklist.json`. Preflight's clean-tree check guards only the *start* of a run. A second session running `/tdd` against the same repo corrupts the first's `git diff HEAD~1` audit attribution, with no detection. One `/tdd` per repository at a time.
- **Monorepos are architecturally excluded, not merely under-detected.** The schema has one `commands` object and one `globs` partition. A repo with a Python backend and a TypeScript frontend has no path forward. The claim under *Configuration* that adding a toolchain is "a table row rather than new code" holds only for single-toolchain repos.
- **"Exactly one test" is undefined for parametrized and table-driven tests.** `@pytest.mark.parametrize`, Go table tests, and a function carrying several unrelated assertions all satisfy the letter of Red's stop condition while violating its intent. Neither the coverage nor the CRAP machinery can distinguish them from an atomic test.
- **Agents are pinned to `sonnet`** in their frontmatter — a cost decision, recorded here because it was previously undocumented policy. It interacts with the threat model: the weaker the agent model, the less likely the rationalisation route; the stronger the model, the more likely it is to find it.
- **Node of at least the supported LTS must resolve for the process that launches Claude Code**, which is not the same as resolving in your terminal. Claude Code's native installer provides no Node, and per-shell version managers (`fnm`, `nvm`) put it on a `PATH` that only an interactive shell profile assembles. Users of those managers should expose a stable, non-ephemeral node directory — `fnm` keeps one at `<fnm-dir>/aliases/default/bin` — from a file every shell reads, such as `.zshenv` rather than `.zshrc`. A user without Node cannot run this plugin at all: a real requirement, traded knowingly for Windows support that needs neither WSL nor Git Bash.
- **Windows support is by construction, not by verification, until it is exercised there.** The path layer is written so that separator dialect and case are data rather than platform behaviour, and the spelling matrix asserts both from a POSIX machine. That is not the same as having run it on Windows, and the claim should not be made until someone has.

## Roles

### Red

Designs and implements tests. Works from the specification. Never reads or modifies source files.

Objective: one test capturing one aspect of the spec. Stops on achieving it.

### Green

Designs and implements source code. Its only specification is Red's handover report describing a failing test. Never reads or modifies test files.

Objective: the minimum code that turns that failing test green. Stops when it passes.

### Refactor

Improves existing source code while holding every public interface constant and every test passing. Never adds behavior or public interface. Never opens a test file.

Objective: a cleaner implementation with no scope change and no new failures.

### Orchestrator

The main conversation thread. **Not** one of the constrained roles — it reads spec, tests, source, and diffs freely.

This asymmetry is deliberate. The guarantee being bought is that no *agent* couples a test to its implementation, not that no *participant* has full visibility. Something has to sequence work, decompose the spec, and judge refactor triggers. Claude Code subagents cannot dispatch subagents, so the orchestrator must be the main thread.

## Architecture

```
claude-tdd/
├── .claude-plugin/
│   ├── plugin.json          name, version, author
│   └── marketplace.json     for distribution
├── agents/
│   ├── tdd-red.md
│   ├── tdd-green.md
│   ├── tdd-refactor.md
│   └── tdd-mutate.md
├── commands/
│   ├── tdd.md               /tdd <spec-path>
│   └── tdd-init.md          /tdd-init
├── skills/
│   └── run-tdd-cycle/
│       └── SKILL.md         orchestrator loop
└── hooks/
    ├── hooks.json           PreToolUse matcher
    ├── guard.mjs            role-aware path and command guard
    └── lib/rules.mjs        pure decision functions
```

Each part has one job:

- **`skills/run-tdd-cycle`** holds the loop. `/tdd` is a thin entry point that invokes it, so the loop is also reachable by the model recognizing it applies.
- **`agents/*.md`** are pure role definitions — constraints and stop conditions, no orchestration logic.
- **`hooks/guard.mjs`** is the only executable and is stateless: read `agent_type` from the payload and `.tdd/config.json` from disk, decide, exit.
- **`.tdd/`** lives in the target project, not the plugin.

## Why the guard is written in Node *(iteration 2)*

The first iteration was bash 3.2 plus `jq`. That choice failed on one platform in the worst available way.

**The failure that ended it.** Claude Code runs a `type: command` hook in shell form through `sh -c` on macOS and Linux, **Git Bash on Windows, or PowerShell when Git Bash is not installed**. A Windows developer without Git Bash therefore handed the shipped `hooks/guard.sh` to PowerShell, which could not execute it. And for `PreToolUse`, **only exit code 2 blocks** — every other non-zero exit is a non-blocking error, and the tool call proceeds. So the guard did not merely fail to work on Windows; it failed *open*, on the read path, which leaves no signature in any diff. The plugin would install, appear healthy, and enforce nothing.

That is the precise failure class this design exists to prevent, so it decides the substrate.

**Why Node rather than PowerShell or Python.** PowerShell 5.1 on Windows versus `pwsh` 7 elsewhere reproduces the bash-3.2-versus-5 dialect problem this project already paid for. Python's Windows story has the same shape (Store aliases, `py` versus `python`, venv variance). Node runs the same code on all three platforms from one file.

**The hook is registered in exec form**, which spawns the interpreter directly with no shell involved, so no `${VAR}`-versus-`$env:VAR` expansion dialect can intervene:

```json
{ "type": "command", "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"], "timeout": 10 }
```

**Node is a dependency, not a free win.** Claude Code now ships a native installer that requires no Node.js, so its presence cannot be assumed. What the port buys is a *swap*: one interpreter in place of `jq`, whose 11 call sites disappear because JSON is native. The asymmetry that matters is that a Windows developer can install Node trivially, whereas installing bash means WSL or Git Bash — the requirement being removed.

**A missing interpreter fails open exactly as a missing shell did**, so the mechanism that catches it must be kept: preflight dispatches a probe subagent and confirms the guard observed a denial (*Preflight*, item 7). That probe is the only check that catches a guard which never launched, whatever the cause.

**Target: Node 22**, the oldest LTS still in support (Maintenance LTS through April 2027; Node 20 reached end of life in April 2026).

**That is a floor the guard must enforce on itself, not a version anyone can pin.** Nothing in the project chooses the interpreter the hook receives — the host does, and the host is not the developer's shell. Measured on the development machine: Claude Code was running under a JetBrains ACP agent whose `PATH` resolves `node` to an IDE-bundled **24.13.0**, while `fnm` and `.node-version` gave the orchestrator's `Bash` tool **22.23.2**. Same machine, same repository, same moment, two runtimes — and the one the guard would actually run under is the one nobody selected.

Three consequences:

- **The guard checks `process.versions.node` at startup and denies if it is below the floor.** A version requirement that nothing enforces is a comment. Denying is the only safe direction, and it must be a deliberate exit 2 rather than a crash on a missing API, because a crash exits non-2 and permits.
- **The code must run on the floor and tolerate anything newer.** It cannot assume the pinned version, so it stays on APIs stable across the supported range — which is the second, independent reason to refuse `path.matchesGlob`.
- **A green suite says nothing about the hook's runtime.** `.node-version` governs the test suite. Only the preflight probe in item 7 executes inside whatever interpreter the host actually supplies.

- **Do not use `path.matchesGlob`.** It landed in v22.5.0 and is experimental, so it is unavailable on early 22.x and its semantics may change. The glob matcher is security-critical and its `**` behaviour is the subject of a live defect — the project owns that matcher and its tests.
- **Do not use the platform-native `path` module for matching.** See *Separators are normalised before matching*.

### Types without a compile step *(iteration 2)*

The guard is plain ESM checked with `// @ts-check` and JSDoc, not TypeScript compiled to JavaScript.

**TypeScript's `target` does not deliver the runtime-compatibility guarantee it appears to.** Verified against `target: ES2023`, `lib: ["ES2023"]`, `module: nodenext` and `@types/node@22`: a file calling `path.matchesGlob` and `fs.globSync` — both unavailable or experimental on early 22.x — **compiled clean**. `target` governs ECMAScript syntax and lib, not the `node:*` API surface. Nor does pinning the types help: `@types/node@22` resolves to 22.20.1, which types everything added across the whole 22.x line. Only running the suite on the target runtime catches this, which is what `.node-version` is for.

**The decisive reason is fail direction.** Compiling produces a generated artifact, and the plugin ships via `source: "./"`, so the guard users run would be committed build output — the source and the artifact kept in sync by a process, with the enforcing file not being the file anyone edits. That is precisely the topology that produced the fix which landed in the plan and never in the code, three times. Compare the two failure modes:

| Approach | If the step is skipped, stale, or silently fails |
|---|---|
| TypeScript compiled | the stale guard runs, reads fail open, and nothing leaves a diff signature |
| `// @ts-check` | no type checking; the source still runs correctly |

One fails dangerous and one fails safe, which is the same reasoning this design applies at every branch of the guard, applied one level up.

**The checking is not given up.** Verified on a plain `.mjs` file with JSDoc `@typedef`s: `tsc --noEmit` with `checkJs` caught a typo'd `commands.mutaton` key — the exact typo that survived a mutation in iteration 1 — along with a glob array treated as a string and an unguarded null. The cost is a `package.json` with dev dependencies in a repository that currently has none.

**Types are not runtime validation.** The guard parses untrusted JSON from disk. Every degenerate config shape must still fail closed at runtime; a `@typedef` describes what the file is supposed to contain and guarantees nothing about what it does contain.

### State

| Path | Committed | Purpose |
|---|---|---|
| `.tdd/config.json` | **yes** | toolchain commands, path globs, thresholds |
| `.tdd/checklist.json` | no — gitignored | run state; enables resume |
| `.tdd/coverage.json` | no — gitignored | coverage report, regenerated per measurement |

**The config is committed** *(iteration 2 — this row previously read "no — gitignored" and contradicted two later statements).* It is the single source of truth for a security boundary, and the partition guarantee is only as good as the review that config receives. Gitignoring it would also make `/tdd-init`'s own commit a silent no-op — `git add` on an ignored path does nothing without `-f` — breaking the first-run path in exactly the way that step exists to prevent.

This governs target projects. *This plugin's own repository* gitignores its `.tdd/config.json` because that config describes the `e2e/` fixture rather than the plugin, and committing a config whose globs point into a test fixture would be misleading. A `tdd-*` dispatch here is therefore guarded normally against the fixture's globs, not denied for want of a config.

**The guard resolves the project root from `TDD_PROJECT_DIR`, else `CLAUDE_PROJECT_DIR`, else the payload's `cwd`.** The first exists so the suite can point the guard at a sandbox holding a fixture config; it is part of the contract rather than a test affordance, because anything that can relocate the root can relocate the boundary.

Run state is separated from config so an interrupted `/tdd` resumes from disk. **`checklist.json` also carries the coverage baselines** each gate compares against *(iteration 2)*. They were previously held only in the orchestrator's conversation, so a compaction between capturing a baseline and comparing against it left the gate comparing against nothing, or against a wrong figure — silently. The compaction claim covers only what is on disk; anything a gate needs across a dispatch boundary belongs in the file.

There is no phase marker. The hook learns the caller's role from the payload's `agent_type`, so nothing needs to be written before a dispatch and nothing can go stale.

## The Cycle

### Preflight

`/tdd <spec-path>` refuses to start unless all seven hold. Each is a precondition some later step silently depends on.

1. **Target is a git repo with a clean tree.** Reverting a dispatch destroys working-tree state — see *Reverting a dispatch* below.
2. **`.tdd/config.json` exists**, else run `/tdd-init` first.
3. **The full suite passes.** Refactor's stop condition is "all tests still pass" and Green's is "this test now passes"; both are meaningless against an already-red suite. If red, record the failing test IDs in `checklist.json` as `knownRed` and **pass that list into every Refactor and Mutate dispatch**. Both roles stop on a suite that is not green, so an allowlist that only exists in the file makes them refuse to run for the rest of the session. Every later suite comparison subtracts it.
4. **Spec file is readable and non-empty.**

5. **The glob partition is still exhaustive** — `git ls-files` produces no file matching neither `test`, `source`, nor `ignore`. Catches drift from edits made between runs. See *Writes are an allowlist; reads are a denylist* below for why this is load-bearing.
6. **Node is on `PATH` and is at least the supported LTS** — `guard.mjs` runs under it. Check the version, not merely the presence: an interpreter too old to run the guard denies loudly on its own — `guard.mjs` checks `process.version` before anything else can throw and exits 2 below the floor. Only a *missing* interpreter fails open, because the hook process never starts at all.

   **This check proves less than it appears to, and item 7 is what closes the gap.** Preflight runs `node --version` through the orchestrator's `Bash` tool, which proves node is on the *Bash tool's* `PATH`. The hook is spawned by Claude Code directly, in exec form, with no shell — so it resolves `node` against a different environment. The two can disagree, and when they do this check passes while the guard cannot launch.

   That is not hypothetical. Per-shell Node version managers make it the normal case: `fnm` and `nvm` put node on a `PATH` assembled by an interactive shell profile, and `fnm` in particular resolves to a per-session directory keyed by shell PID. Observed on the development machine: no node existed anywhere outside that ephemeral directory, and a non-interactive spawn found none at all. A user who launches Claude Code from a desktop icon rather than an fnm-active terminal gets a guard that cannot start — and a hook that cannot start exits non-2, which permits.
7. **The guard sees `agent_type`** — dispatch a trivial probe subagent and confirm the hook observed a non-empty `agent_type`. If it did not, the guard silently permits everything a subagent does; stop rather than run unenforced. This is the one check that verifies the enforcement mechanism itself is alive.

### Decompose

The orchestrator reads the spec once and writes an ordered checklist of test-sized behaviors, then presents it for approval before the first dispatch. Bad decomposition is cheap to correct here and expensive to correct on cycle 9.

```json
{
  "spec": "docs/specs/parser.md",
  "knownRed": ["<test ids excluded from every comparison>"],
  "mutationRoundsRun": 0,
  "baselines": { "uncoveredLines": 14, "capturedAt": "<phase and item this was measured before>" },
  "items": [
    { "id": 1, "behavior": "rejects empty input", "status": "pending" },
    { "id": 2, "behavior": "parses a single token", "status": "pending" }
  ]
}
```

`status` moves `pending → red → green → done`, or terminates at `redundant` or `blocked`. Written after every transition.

**Decompose runs only when the checklist is absent** *(iteration 2)*. Re-invoking `/tdd <spec>` is the advertised way to resume an interrupted run, and decomposition was unconditional — so the documented resume path overwrote the file it was resuming from, discarding every item's `status`, the recorded `knownRed`, `mutationRoundsRun`, and the baselines. The section claiming resume works was the same section destroying the state it depends on. If `.tdd/checklist.json` exists and has items, this is a resume: load it, re-surface any `blocked` items, and continue from the first non-terminal item.

### Per item

```
dispatch tdd-red
  │
  ├─ test FAILS ─────────────→ commit "red: <behavior>"
  │                            audit → dispatch tdd-green
  │                            test passes → commit "green: <behavior>" → audit
  │                            → refactor trigger check
  │
  ├─ test PASSES, coverage ↑ → commit "test: <behavior>"   (no Green dispatch)
  │                            status = done → next item
  │
  └─ test PASSES, flat ──────→ revert                      (nothing committed)
                               status = redundant → next item
```

**Every commit is audited**, including the `test:` branch — Red can violate its write boundary whether the test it produced passed or failed. The diagram elides the repeat for readability; the rule has no exceptions.

The three-way outcome is the literal reading of the requirement that every authored test must *either* fail *or* measurably increase coverage. A passing test that raises coverage documents real existing behavior and is worth keeping; a passing test that raises nothing is waste.

**Consequence:** an item can complete without Green ever running. So the checklist empties on **"no `pending` items remain"**, not "every item went red then green." This contradicts the usual TDD mental model and must be stated in the orchestrator skill.

An empty checklist is not the end of the run — it triggers the mutation pass, which may append new items and restart the loop.

**Items originating from a mutation survivor are exempt from the three-way rule.** A surviving mutant means the source is *correct* and the test is weak, so Red's test for that behavior necessarily passes and necessarily moves no coverage — the line was already executed by the assertion-free test that let the mutant survive. Judged by the rule above, every such item lands on `passing-flat` and is discarded, the next round rediscovers the identical survivors, and the loop terminates having closed nothing. The feature was structurally incapable of working until this exception was added. Mutation-origin items are instead judged on whether the test kills the recorded mutants, which the orchestrator verifies by applying each one — Red cannot, since it may not write source.

### Refactor trigger check

After each green, the orchestrator dispatches `tdd-refactor` only on a hit against a written trigger list:

| Trigger | Kind | Threshold |
|---|---|---|
| any method scores above `refactorTriggers.maxCrap` — primary; the dispatch is scoped to that method | measured | `maxCrap` |
| a function crossed `refactorTriggers.maxFunctionLines` — fallback only, when `crapMode` is `unavailable` | measured | `maxFunctionLines` |
| Green reported a non-empty `mess` | reported | — |
| the same shape appears a third time | **judgment** | `duplicateThreshold` counts occurrences, but "shape" has no definition |
| a name in the new code drifted from the spec's vocabulary | **judgment** | none |

**The last two are deliberately judgment-based** *(iteration 2 — recorded because a design that otherwise converts judgment into measurement leaves these unexplained, and a maintainer would read the omission as an oversight)*. There is no `commands.duplication` in the schema and no mechanical definition of "shape". Both triggers are prompt discipline, kept because a cheap imprecise trigger for duplication beats no trigger, and dropped from any claim that refactor triggers are measured.

No hit, no dispatch. This avoids paying for a subagent to conclude "nothing to do", which is the common case in early cycles, and avoids an idle Refactor agent inventing busywork to justify itself.

### Mutation pass

When the checklist first empties, the orchestrator runs the mutation hardening pass described above rather than declaring completion. Survivors append to the checklist as new Red items; the loop resumes. The run ends when a pass produces no survivors, or after `limits.mutationRounds`.

**The round counter increments before the branch, not after it** *(iteration 2)*. `mutationRoundsRun` was incremented in a step written after both terminal branches, and the survivor branch hands control back to the per-item loop before reaching it. So the counter advanced reliably only on the no-survivor path — which ends the run anyway. `limits.mutationRounds` exists to bound *repeated survivor-producing passes*, and that is precisely the path where the increment was skipped: the cap was inert exactly where it was needed. Increment first, write the file, then branch on survivors and remaining budget.

### Commits

Phase-level commits: `red:`, `green:`, `test:`, `refactor:`, each suffixed with the behavior. The history reads as the cycle and is bisectable; `git log --grep '^red:'` is a usable audit trail.

Per-phase commits also give the audit its baseline. Without one, `git diff` shows the accumulated work of all three agents and a violation cannot be attributed to the agent that caused it.

## Enforcement

Guardrails are enforced twice, at different surfaces.

### Boundaries

| | May read | May write | May run |
|---|---|---|---|
| **Red** | spec, existing test files, runner output | test globs only | configured test + coverage commands |
| **Green** | Red's handover report, source files, runner output | source globs only | configured single-test + coverage commands |
| **Refactor** | source files, runner output | source globs only | configured full-suite + coverage + complexity commands |
| **Mutate** (`tdd-mutate`) | source files, runner output | source globs only — every write must be reverted before handover | full-suite + mutation commands |

### Reverting a dispatch

Several branches discard an agent's work. **`git checkout -- .` does not do it**, and neither does `git reset --hard` — both restore or reset *tracked* files and leave untracked ones in place, and Red's tests are almost always new files. Found on the first live run: after a rejected `passing-flat` test, `git checkout -- .` left the test sitting in the tree, where the next item's commit would have swept it up.

Revert means both:

```
git checkout -- <pathspec>     # restore tracked edits
git clean -fd -- <pathspec>    # remove new files
```

Only `clean` takes a pathspec; `git reset --hard -- <path>` fails outright. Reset is therefore tree-wide, which is safe only because preflight requires a clean tree and exactly one agent writes per dispatch.

**The pathspec is every path the triggering check found, not the role's write globs** *(iteration 2)*. Scoping to the role's globs was wrong in the one scenario the revert exists for: a guardrail violation is *by definition* a write to a path that does not match the role's globs — that is what makes it a violation rather than ordinary work. In the backstop case the audit exists to catch, the rogue file sits outside the glob by construction, and a glob-scoped `clean` cannot touch it. Nor is the pathspec only the paths that broke the match: a violating dispatch usually also writes legitimate in-glob files alongside the rogue one, and scoping to the offending subset alone leaves those behind — reproducing this section's founding bug (a rejected file surviving to be swept into a later commit) for the half of the dispatch that happened to pass. Fall back to the role's globs only when the triggering check named nothing at all, which is the ordinary discard case (a rejected `passing-flat` test) rather than a violation.

This is the third instance of the same class — a revert that does not revert. The first two were command choice (`git checkout -- .` leaving untracked files; `git reset --hard` with the same blind spot); this one is scoping.

### Paths are canonicalised before matching *(iteration 2 — was "normalised")*

The guard strips the project root by literal prefix, and the glob match then needs the relative path to start with a glob's prefix. Any spelling that defeats that lexical match reaches no glob — and because reads are a denylist, **no match means allow**. Every such spelling is therefore a read-isolation bypass, silent and invisible in any diff.

Note the asymmetry that makes this dangerous rather than merely wrong: `Write E2E/src/...` is correctly *denied*, because writes are an allowlist and fail closed. Only reads leak.

**Lexical normalisation cannot establish path identity, and the project proved it the expensive way.** Path identity on a real filesystem involves case-folding rules, symlinks, hardlinks, and mount aliases — none of them lexical properties. Four separate one-spelling fixes shipped (`./x`, `x//y`, a root ending `/.`, traversal), and the review still reproduced live bypasses in every remaining spelling: `E2E/src/...` and `e2e/SRC/...` resolve to the same files on a case-insensitive filesystem while the matcher treats them as different, in both directions; and a root spelled `$ROOT/.` defeated the prefix strip entirely. **That last one is the fix the ledger recorded as complete: it landed in the plan and the spec, and never in the code.** A direct diff of the plan's embedded `rules.sh` against the shipped file showed exactly one missing line.

The bash implementation is retired by the port, but the lesson is not, and neither is the evidence: this class was discovered one spelling at a time across four fixes because the tests sampled spellings instead of asserting the property. Re-implementing in Node closes the spellings that were lexical accidents; it does nothing for the sampling habit that hid them. The matrix is the part that must survive the port.

**Canonicalise, do not normalise.** Resolve both root and target through the filesystem, then compare:

- **`fs.realpathSync.native`** resolves symlinks and returns the filesystem's own stored spelling of every component **including the basename**. Verified: `E2E/SRC` resolves to `.../e2e/src`, and `E2E/tests/TEST_divide.py` to `.../e2e/tests/test_divide.py`. One call replaces the whole lexical layer, closes the case bypass and the symlink route together, and needs no case-sensitivity probe and no configuration. It is strictly stronger than the shell recipe it replaces, which recovered directory case only.
- **Resolve the nearest existing ancestor, then re-append the tail.** `realpath` throws `ENOENT` on a path that does not exist — verified against a not-yet-created test file, which is every `Write` Red performs. Walk up to the deepest ancestor that resolves, then re-append the remainder. Resolving only the parent directory — the obvious recipe — rejects a legitimate write into a new subdirectory.
- **The non-existent tail is the residual, and folding it is asymmetric.** Whatever did not resolve keeps the spelling the caller supplied, because the filesystem has no stored case for a component that does not exist yet. Close it by **folding case only in the direction that fails closed**: a *read* matches the denylist against the resolved path **or** its case-folded form, and either match denies; a *write* matches the allowlist on the resolved path only, since folding a write comparison would permit more rather than less. On a case-sensitive filesystem this costs a false denial for a repository carrying both `src/` and `SRC/` — loud and safe, the same trade already accepted for the plugin-namespace strip.

  Note how much smaller this residual is than the shell design's: there, every basename was unresolved and the fold carried the whole burden. Here it covers only genuinely new paths.
- **`realpath` failures deny.** A permissions error, a broken symlink, a path that resolves outside the root: none can be evaluated, and an unevaluable check on a read must not reach `allow`.

**This is a deliberate departure from the retired bash guard, not merely an incidental consequence of using `fs.realpathSync.native`.** The bash implementation stripped the project root by a literal string prefix: a path that resolved outside the root stayed an unmatched absolute string, matched no configured glob, and — reads being a denylist — was silently *permitted*. `toRepoRelative` returns `null` for exactly this case (unresolvable, or resolved outside the root), and `pathVerdict` denies on a `null` `relPath` in **both** modes, not only on write. An unplaceable path cannot be classified against the `test`/`source`/`ignore` partition the whole read-isolation argument depends on being exhaustive, and that is the same "check cannot be evaluated" case this design already treats as fail-closed everywhere else — it would be inconsistent to make an exception for it on the read side alone. This also closes the class the `/private` symlink residual belonged to: an absolute path naming the same file by a route the literal prefix strip never recognised as in-root at all.

Correctness here is a property of *spellings*, not of any one spelling, so it is tested as a matrix: for each role × mode × canonical target, every spelling of that target must produce an identical verdict. A new spelling becomes one row rather than one more review finding.

### Separators are normalised before matching *(iteration 2)*

Cross-platform support introduces a bypass that did not exist while the plugin was macOS-only, and it is the same shape as every other one: **`e2e\src\calc\x.py` matches no POSIX-spelled glob, and a read that matches nothing is permitted.** Windows tool payloads carry backslashes, and the configured globs are written with forward slashes.

The trap is that the platform-native API makes it worse rather than better. Verified: `path.win32.normalize("e2e/src/x.py")` returns `e2e\src\x.py`, and `path.win32.join` produces backslashes. **Using the ambient `path` module for matching would manufacture the bypass on Windows** — every glob comparison would be made against a string the globs cannot match.

The rule is therefore: **globs are a POSIX-spelled dialect, and every path is converted into that dialect before any comparison.** Convert separators to `/` on both root and target immediately after canonicalisation, and match with the project's own matcher rather than any platform-aware helper. Drive-letter case (`C:\` versus `c:\`) is covered by the same asymmetric fold as the rest of the path.

This must be tested on a POSIX machine, because that is where it will be developed: the matcher takes the spelling as data, so a backslash-spelled path is a row in the spelling matrix like any other, not a test that requires Windows.

### `**` at the start of a glob must match zero depth *(iteration 2)*

The bash matcher rewrote `**` to `*`, relying on bash's `*` crossing `/` inside `[[ ]]`. That is correct for `src/**`. It is wrong at the start of a pattern: `**/test_*.py` becomes `*/test_*.py`, which requires at least one directory component. A root-level `test_foo.py` therefore matches **no** test glob, and Green may read it.

The port does not make this go away — it makes it a decision. The matcher is written explicitly rather than delegated, so the dialect is defined here and asserted in tests: `*` matches within one segment, `**` crosses `/`, and a leading `**/` matches at zero depth.

In every glob dialect a config author knows — git pathspec, `.gitignore`, minimatch, Python `pathlib` — `**/x` matches `x` at zero depth. This implementation diverges silently, and `/tdd-init` proposes exactly these globs. `**/*_test.go` is the worst case: a root-level `main_test.go` is idiomatic Go.

A leading `**/` must therefore match both depths. The partition check partially masks this — it flags a root-level test as unclassified and stops — but the natural resolution, dropping the stray file into `globs.ignore`, silently removes read isolation for it with no warning. The partition check must refuse to classify a file into `ignore` when its name matches a recognised test-file pattern, and say why.

### Writes are an allowlist; reads are a denylist

A write must *match* the role's permitted globs; a read must merely *not match* the forbidden ones. The asymmetry is deliberate — agents legitimately read `README.md`, `pyproject.toml`, and type stubs, and an allowlist would fight them on every call.

But it means the read rule fails *open*: if `globs.source` is incomplete, a source file that matches nothing is readable by Red, and read isolation quietly disappears. Since globs come from auto-detection, this is a live risk — `src/**` misses a root-level package, a Go repo with source at the root, or a monorepo's second module.

**The globs must therefore form a proven-exhaustive partition.** `config.json` carries a third list, `globs.ignore`, for files that are neither test nor source (docs, manifests, CI config). `/tdd-init` runs `git ls-files` and refuses to write a config until every tracked file matches exactly one of the three. Preflight re-runs the same check, catching drift from edits made between runs.

The invariant is self-reinforcing once established: new files can only be created by an agent, and the write allowlist already forces them into `test` or `source`.

**Refactor's read carve-out.** "Only interface is the test runner's output" cannot mean literally no test information: a failing run prints test file paths, test names, assertion diffs, and often source excerpts. That is unavoidable and is not a violation. The boundary is precise: *open a test file, never; read what the runner prints, yes.* The same carve-out applies to Green.

### The hook and the audit are not redundant

The diff audit can only observe writes. Read isolation — the property that actually makes Green's implementation independent of the test's internals — leaves no post-hoc signature at the *tool-call* layer. The hook is the only mechanism that can observe it at that layer.

**Hook** — `PreToolUse`, matching `Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Bash` *(iteration 2: this list previously read `Read|Write|Edit|Bash`, four of the seven the shipped matcher carries)*. It identifies the caller from the payload's **`agent_type`** field, resolves the target path against that role's allowed globs, and denies on mismatch with a message naming the violated rule.

**What the hook delivers, stated precisely** *(iteration 2 — this previously read "sole enforcement of read isolation", which is false as written)*. The hook makes the read boundary **observable and costly to cross accidentally**. It does not make crossing impossible: the three channels named in *Threat model* carry forbidden content past it with zero denials, and two of them are reachable using only calls the guard permits. Enforcement is against incidental violation, which is the common case.

```
agent_type absent                        → permit   (main thread / orchestrator)
strip "<plugin>:" namespace prefix                 ← load-bearing; see below
agent_type not a tdd-* role              → permit   (unrelated work)
tdd-red | tdd-green | tdd-refactor
        | tdd-mutate                     → apply that role's rules
```

**The payload shape differs by caller, and that difference is the dispatch** *(iteration 2, measured under exec form)*. A subagent call carries `agent_id` and `agent_type`; a main-thread call omits **both keys entirely**. The key is absent, not present-and-null — a distinction worth preserving in code, because treating "absent" and "null" as one case is how a fail-open hides.

**`tool_input.file_path` arrives absolute**, even when the agent was given a relative path: a dispatch asking for `e2e/spec.md` produced `/Users/…/claude-tdd/e2e/spec.md` in the payload. The path layer must not assume repo-relative input.

**The namespace strip is not an implementation detail** *(iteration 2: the pseudocode above previously omitted it)*. Plugin-provided agents arrive namespaced — `claude-tdd:tdd-red`, verified empirically on Claude Code 2.1.220. Matching the bare name alone misses every real dispatch, falls through to permit, and renders the guard **entirely inert** while every test using a bare-name payload still passes. This was the single most consequential defect in the project, and the canonical pseudocode has to show its fix. Stripping is deliberately broad: another plugin shipping its own `tdd-red` is also constrained here — a false denial, loud and safe, versus matching too narrowly and permitting silently.

**Detection where prevention is impossible** *(iteration 2)*. The orchestrator already reads everything and audits every commit, so it is the right place for the counter-measure the hook cannot provide: scan Red's committed test files for source-file reads (`open(`, `require(`, `include`, `File.read`) targeting a `globs.source` path, and treat a hit as a guardrail violation under the existing revert-and-re-dispatch rule. That converts the strongest bypass from undetectable to detected-at-commit, using the same prevent-and-verify split the design relies on everywhere else.

**Its ceiling must be stated wherever it is described.** This is a substring heuristic against an LLM-authored file. It raises the cost of the bypass and catches the obvious spelling; it does not close the channel. It is a **detector, not a control**, and describing it otherwise would manufacture exactly the false confidence this section exists to remove.

**Why `agent_type` and not a phase-marker file.** An earlier draft had the orchestrator write `.tdd/phase` before each dispatch. That design is broken, and the spike (`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`) showed why: during the red phase the orchestrator itself runs `git diff --name-only` to audit Red's work. A marker-based guard would judge that main-thread call against Red's Bash allowlist, find `git diff` does not prefix-match the test command, and **deny the orchestrator's own audit.** A marker file cannot distinguish orchestrator from agent. `agent_type` can, and is the only thing that can.

Dropping the marker also removes the stale-marker failure mode and the strictly-sequential constraint, which existed only because one global file cannot describe two concurrent cycles.

**The hook fails closed — but only once it knows the caller is a constrained role.** For a recognized `tdd-*` agent, an unreadable or unparseable `.tdd/config.json`, an unresolvable path, or an unmappable role all deny. A guard that cannot evaluate must not default to permitting; that would disable read isolation silently, which is the exact failure this design exists to prevent. `/tdd-init` and preflight both check the interpreter so the loud failure lands at setup rather than mid-cycle.

**The one failure the guard cannot make fail closed is its own.** An uncaught exception, a syntax error, or a missing interpreter exits non-zero-but-not-2, which `PreToolUse` treats as a non-blocking error and permits. Two consequences the implementation must honour: wrap the whole body so that *any* thrown error becomes a deliberate exit 2 rather than a stack trace, and keep the preflight probe, which is the only check that catches a guard that never ran at all.

**The denial goes to stderr. On exit 2, stdout is ignored entirely** *(iteration 2, measured — the earlier draft of this paragraph said stdout and was wrong)*. A probe that wrote its JSON body to stdout and exited 2 blocked the call correctly and had its message **dropped**: the transcript reported "No stderr output". Rewritten to stderr, the same body arrived verbatim. The shipped bash guard always did this correctly; the spec did not.

This matters more than a stream name. A guard whose denials are silently discarded still blocks, so it looks like it works — the agent is stopped but never learns which rule it violated, and the design depends on that message being correctable feedback rather than an opaque refusal.

**Emit before exiting.** Calling `process.exit()` in the same tick as the write can truncate it, because `process.exit` does not wait for asynchronous flushes. Set `process.exitCode` and let the process end naturally, or write synchronously.

Before that point the guard exits 0 without reading anything, so installing this plugin does not perturb unrelated sessions.

**Residual risk: `agent_type` is undocumented.** It is absent from `plugin-dev/skills/hook-development/SKILL.md` and was found empirically on Claude Code 2.1.220. If a future version removed it, every subagent call would look like a main-thread call and the guard would fail **open** — the worst outcome available here, since reads leave no trace in a diff and nothing else would notice. Preflight therefore dispatches a trivial probe subagent and confirms the guard observed an `agent_type`, refusing to run if not. A startup check, not a per-call one.

**Audit** — after each dispatch, `git diff HEAD~1 --name-only`, re-checking the write set against the role's globs. Backstop for anything the hook missed: hook disabled, `agent_type` unavailable, an unanticipated mutation path.

### Bash: allowlist, not mutation-detection

Detecting mutation by parsing shell commands is unbounded and will lose — `sed -i`, `cat >`, `mv`, a codegen script, and arbitrarily many more.

Invert it. The three agents only ever legitimately need to run the commands in `config.json`. The hook permits a `Bash` call only when it prefix-matches a configured command for the current phase. Everything else is denied. `Read` covers the inspection the agents would otherwise shell out for. `Grep` and `Glob` are deliberately not granted: they sit outside the `PreToolUse` matcher, so such a call would never reach the guard at all, and `Grep` returns file content.

**The metacharacter ban applies to the delta, not the template.** A configured command is trusted — it was authored or confirmed by the user at init time, and some toolchains legitimately need a pipe or redirect to produce coverage. What the agent supplies beyond the template (the `{testId}` substitution, any appended flags) must contain no `;`, `|`, `&&`, `&`, `>`, `<`, backtick, `$(`, or a literal newline *(iteration 2: this list previously omitted `&`, `<` and the newline, all of which the shipped code bans)*. Banning metacharacters in the template itself would make the rule unsatisfiable for those toolchains, and the failure would surface at init time as an unexplained rejection.

**The ban list is shell-agnostic on purpose** *(iteration 2)*. On Windows the agent's `Bash` tool may be backed by Git Bash or by PowerShell, whose metacharacters differ — backtick is an escape, `$(...)` is a subexpression, `&` and `;` are separators in both. The list bans a superset of what either shell treats as special, so it stays correct without the guard needing to know which shell will receive the command. It cannot know: the guard sees the command string, not the interpreter.

**The delta check must also reject traversal** *(iteration 2)*. The path half of the guard explicitly rejects `..` before matching; the Bash half checks only for metacharacters. Where `{testId}` is a filesystem path — pytest node IDs are — a fabricated `testId` in Red's handover report invokes the configured runner against a path outside the test tree, and the two halves of the guard disagree about whether traversal matters. The primary fix is orchestrator-side, and is cheaper and more precise: **validate `testId` against `globs.test` before dispatching it**, rather than executing whatever Red reported. Rejecting `..` in the delta is defence in depth behind that.

`/tdd-init` validates that each detected command parses under this rule and warns if one does not.

A tight rule that is actually checkable beats a broad rule that is not.

### Handover artifact

Red returns this, and it is the entirety of what Green receives:

```json
{
  "item": 1,
  "testId": "tests/test_parser.py::test_rejects_empty",
  "publicApi": "parse(text: str) -> Node",
  "intent": "empty input is an error, not an empty tree",
  "expected": "raises ParseError('empty input')",
  "observedFailure": "<failure line and location only — see below>"
}
```

`publicApi` is load-bearing. Green cannot read the test, so without an explicit signature it cannot know what to implement.

**`observedFailure` used to leak the whole test** *(iteration 2)*. It was specified as `<verbatim runner output>`, and pytest's default traceback reproduces the full source of the failing test function — every line up to and including the failing assertion. For most tests, `observedFailure` *was* the test. The design's central guarantee was undercut on the happy path, by design: Green is denied `Read` on the test file and then handed its contents as required input. The hook was blocking a channel carrying strictly less information than the one the workflow mandated.

Three changes, in order of how much they buy:

1. **`intent` and `expected` are the designed channel and the primary contract.** They already existed. Red populates them properly; Green implements from them.
2. **`observedFailure` is truncated to the failure line plus location.** Configure the runner to suppress source in tracebacks where the toolchain allows it — for pytest, `--tb=line` or `--tb=no -q`. This is carried as `commands.singleTerse`, and Red uses it when producing the report.
3. **Residual leakage is accepted and named.** Assertion diffs still carry values, and a terse traceback still names the test. That is the *Refactor read carve-out* applied to the handover: read what the runner prints, never open the file. The point is that the mandated channel should not carry more than the runner incidentally does.

This is the one leak in *Threat model* with a genuinely cheap mechanical fix. The other two are detected, not closed.

**The orchestrator's dispatch prompt is the unenforceable half.** `SKILL.md`'s "do not paste test source" is prose discipline, not a tool call, so nothing can observe a violation. That is inherent to the orchestrator being trusted, and it is recorded rather than fixed. What the dispatch *must* carry is the report **and** `limits.greenAttempts` — an instruction to pass "only Red's handover report" reads literally as excluding the attempt limit, which is Green's own stop condition and the orchestrator's escalation trigger.

### Violation and failure handling

- **Guardrail violation:** revert, re-dispatch once with the violated rule and the offending path quoted. A second violation stops the run and escalates to the user.
- **Green cannot reach green after 3 attempts:** stop and escalate. Surface a stuck agent rather than looping on it. Configurable as `limits.greenAttempts`.
- **Red cannot produce a test at all** (errors out, or reports it cannot express the behavior): mark the item `blocked`, record the reason, stop and escalate.

`blocked` is deliberately distinct from `redundant`. `redundant` means Red wrote a test, it passed, and coverage did not move — the behavior is genuinely already covered. `blocked` means Red failed to do its job. Collapsing the two would let a spec item be silently dropped as "already covered" when in fact nothing verified it.

## CRAP scores as the primary refactor trigger

The Change Risk Anti-Patterns score, per method:

```
CRAP(m) = comp(m)² × (1 − cov(m))³ + comp(m)        cov ∈ [0,1]
```

At full coverage it collapses to `comp(m)` — a complex method that is thoroughly tested is not a risk. As coverage falls the penalty grows cubically. A 5-complexity untested method scores 30; so does a 30-complexity fully-tested one. The conventional "crappy" threshold is 30.

This is the right trigger for this workflow specifically, because it is the intersection of the two things already being measured. Line count was a crude proxy for complexity that said nothing about whether the code was tested; CRAP is per-method and weights exactly the combination that warrants attention.

**Trigger order.** CRAP is primary: any method scoring above `refactorTriggers.maxCrap` (default 30) dispatches Refactor, scoped to that method. Duplication and naming drift remain as secondary triggers. `maxFunctionLines` is demoted to a fallback for toolchains that cannot produce CRAP.

**Computing it is toolchain-specific and is the main cost of this feature.** Three tiers, in order of preference:

1. **Native** — PHPUnit and Cobertura report CRAP directly. Read it.
2. **Computed** — combine a complexity tool with per-method coverage: `radon cc --json` plus `coverage.py`'s per-file line data for Python; equivalents elsewhere. Requires mapping coverage lines onto function line ranges.
3. **Unavailable** — fall back to `maxFunctionLines`, and say so at init rather than silently degrading.

`/tdd-init` detects which tier applies and records it as `crapMode: "native" | "computed" | "unavailable"`.

## Mutation testing as a hardening pass

Coverage proves a line *ran*. It does not prove any test would notice if that line were wrong — a test that executes code without asserting on its result yields full coverage and zero protection. Mutation testing closes that gap: perturb the source, re-run the suite, and see whether anything fails. A mutant that survives is proof of a test that does not actually test.

**Why this belongs to the Refactor family, and why it is a separate agent.**

Refactor is the only role that can write source *and* is categorically forbidden from keeping a behavior change. Red cannot touch source; Green has no reason to revert its own work. Mutation is mutate → observe → revert, and only Refactor's boundaries make that natural.

It ships as a **separate agent, `tdd-mutate`**, rather than a mode flag on `tdd-refactor`. Since the guard identifies callers by `agent_type`, a distinct agent gets a distinct rule set for free — `tdd-mutate` needs the mutation command in its Bash allowlist and `tdd-refactor` needs the complexity command, and neither should have the other's. A mode flag would force both to share the union, widening each role beyond what it needs.

**Refactor detects; it never fixes.** A surviving mutant is a *test* defect, and Refactor may not read or write tests. It reports the survivor and stops.

**Survivors become Red items.** This is the part that makes the feature fit rather than bolt on. A surviving mutant is already a specification of a missing test — "no test distinguishes `>` from `>=` at `parser.py:42`" is exactly the shape Red consumes. The orchestrator appends each survivor to the checklist as a new item and the normal Red→Green cycle absorbs it. The workflow extends itself.

**When it runs.** Not per cycle — mutation testing runs the suite once per mutant and would dominate wall-clock. It runs as a **hardening pass after the checklist first empties**, in its own `mutation` phase. Survivors generate items; those items run through normal cycles; the pass may then repeat until it produces no survivors or hits `limits.mutationRounds` (default 2).

**How mutants are generated.** Prefer a real tool (`mutmut`, `Stryker`, `PIT`, `cosmic-ray`) when `commands.mutation` is configured — they are systematic and use standard operators. Otherwise Refactor hand-mutates, targeting the **highest-CRAP methods first**, which is where the two features compose: CRAP says where the risk is concentrated, mutation says whether the tests there are real.

**Bounded by construction.** `limits.mutantsPerPass` (default 20) caps how many mutants a single pass attempts, and the orchestrator logs what it skipped. An unbounded mutation pass on a large codebase does not terminate in useful time.

## Coverage as a shared ratchet

Coverage is not only Red's concern. All three roles are measurable against it, and in each case the measurement detects the same underlying failure: **code that exists without a test driving it.**

| Role | Rule | What a violation means |
|---|---|---|
| **Red** | the test must fail, or raise coverage | the test is waste — it neither drives new code nor documents existing behavior |
| **Green** | making the test pass must add no more than `greenMaxNewUncovered` uncovered lines | Green wrote more than the test demanded — speculative generality, unrequested error handling |
| **Refactor** | must add **zero** uncovered lines | new uncovered paths are new behavior, which Refactor is categorically forbidden from adding |

This turns "write the minimum code to pass" from prompt discipline into a measured property.

**The metric is new uncovered lines, not coverage percentage.** Percentage moves with the denominator: a large, well-tested addition and a small, untested one can produce the same delta, and a big legitimate change can look like a regression. Uncovered-line count is the direct signal — it names the actual defect, and it points at the specific lines to delete.

**The thresholds are asymmetric, because the roles are.**

Refactor's gate is hard zero. A behavior-preserving change moves, renames, or collapses code; covered lines stay covered. Any new uncovered line is evidence it did something it was not allowed to do. Violation reverts.

Green's gate cannot be zero. Legitimate cases exist: satisfying a divide-by-zero test requires writing the happy-path `return a / b`, which that test never executes. So Green gets a small allowance (`greenMaxNewUncovered`, default 2) and, on breach, a re-dispatch naming the uncovered lines and instructing it to delete what no test drives. A second breach is accepted but recorded as `overbuilt` on the checklist item, because the divide case proves the rule has honest exceptions and grinding on it would be worse than flagging it for review.

**Who measures.** The orchestrator, at audit time, authoritatively — the same reason it independently re-runs the test rather than trusting Green's word. Green and Refactor are also permitted to run the coverage command themselves so they can self-correct before handing over, which is cheaper than a re-dispatch. This is the same prevent-and-verify split as the hook and the diff audit.

**When coverage is unavailable** (`commands.coverage` is null), all three gates are skipped along with Red's three-way branch. The workflow degrades to strict red plus prompt discipline rather than refusing to run.

**Baseline edge case:** on the first implementation in an empty project, or whenever the baseline reports zero total lines, skip the gate for that cycle — there is nothing meaningful to compare against.

## Configuration

`.tdd/config.json` is committed and is the single source of truth shared by orchestrator, agents, and hook.

```json
{
  "version": 1,
  "commands": {
    "test":       "pytest -q",
    "single":     "pytest -q {testId}",
    "singleTerse":"pytest -q --tb=line {testId}",
    "coverage":   "pytest -q --cov --cov-report=json:.tdd/coverage.json",
    "complexity": "radon cc -j -s src",
    "mutation":   null
  },
  "crapMode": "computed",
  "globs": {
    "test":   ["tests/**", "**/test_*.py"],
    "source": ["src/**"],
    "ignore": ["docs/**", "*.md", "pyproject.toml", ".gitignore"]
  },
  "refactorTriggers": { "maxCrap": 30, "duplicateThreshold": 3, "maxFunctionLines": 40 },
  "limits": {
    "greenAttempts": 3, "violationRetries": 1,
    "mutationRounds": 2, "mutantsPerPass": 20
  },
  "coverageGates": { "greenMaxNewUncovered": 2, "refactorMaxNewUncovered": 0 }
}
```

`/tdd-init` detects the toolchain from a marker-file table, proposes values, accepts confirmation or correction, and writes the file:

| Marker | Toolchain |
|---|---|
| `pytest.ini`, `pyproject.toml` with pytest | pytest |
| `package.json` with jest or vitest | jest / vitest |
| `Cargo.toml` | cargo |
| `*.csproj` | dotnet |
| `go.mod` | go |

Data-driven, so supporting a new toolchain is a table row rather than new code.

`.tdd/checklist.json` and `.tdd/coverage.json` are added to `.gitignore`.

**`/tdd-init` commits its own output.** It writes `.tdd/config.json` and edits `.gitignore`, which leaves the tree dirty — and preflight step 1 refuses to start against a dirty tree. Without this, the first-time path (`/tdd-init` then `/tdd`) fails on its own side effects.

**Every measurement is optional, and each degrades independently.** The workflow always runs; it just enforces less.

| Missing | Lost |
|---|---|
| `commands.coverage` is null | Red's three-way branch collapses to strict red; both coverage gates skipped; `crapMode` forced to `unavailable` |
| `crapMode: "unavailable"` | CRAP trigger unavailable; refactor falls back to `maxFunctionLines` |
| `commands.mutation` is null | mutation pass uses agent-driven hand-mutation instead of a tool; still runs |
| `commands.complexity` is null and no native CRAP | same as `crapMode: "unavailable"` |
| `commands.singleTerse` is null | `observedFailure` falls back to `commands.single` and carries the full traceback — say so, because it hands Green the test body |

**`/tdd-init` must verify its own commit landed** *(iteration 2)*: after committing, confirm `git ls-files .tdd/config.json` is non-empty. The same "prove the step actually happened" discipline the project applies elsewhere, applied to the step whose silent failure breaks the first run.

`/tdd-init` must state which of these apply rather than degrading silently. Each one removes a mechanical check and replaces it with prompt discipline, and the user should know which guarantees they are actually getting.

## Risks

**Resolved by the spike** (`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`, Claude Code 2.1.220):

1. ~~Do plugin `PreToolUse` hooks fire inside a subagent?~~ **Yes.** Verified against a real plugin-format hook, not a settings.json proxy.
2. ~~Is a denial correctable or fatal?~~ **Correctable.** The subagent received the `systemMessage` verbatim and continued working.
3. ~~The payload carries no agent identity.~~ **False** — it carries `agent_type` and `agent_id`; the `plugin-dev` documentation is incomplete. This removed the phase marker and fixed the orchestrator-audit bug described under *Enforcement*.

**Resolved by the build:**

1. ~~**Does a plugin's own custom agent report its own name in `agent_type`?**~~ **Resolved** *(iteration 2 — this was still listed as open after it had been answered).* It reports the **namespaced** form, `claude-tdd:tdd-red`, verified on Claude Code 2.1.220. The guard strips the `<plugin>:` prefix before matching. Until it did, every rule lookup missed and the guard was inert for every real dispatch while the suite stayed green — see *The hook and the audit are not redundant*.

**Open:**

1. **`agent_type` is undocumented and could change.** Mitigated by the preflight probe (*Preflight*, item 7), which fails the run loudly rather than proceeding unenforced.
2. **Coverage and complexity report parsing is toolchain-specific** and is now the largest remaining source of silent failure. An extractor returning `0` on a shape it does not recognize would disable all three coverage gates and the CRAP trigger while every other check still passes.
3. **Read isolation is not enforced against a motivated agent.** Accepted, scoped, and detailed in *Threat model*. Listed here so it is not rediscovered as a surprise.
4. **The spec file is an unsanitised trust boundary.** See *Threat model*.

**Decided, not open** *(iteration 2)*:

- **The measurement layer stays.** The review argued that CRAP, the coverage ratchets and the mutation pass are the highest-cost, highest-risk parts of the system, serve code quality rather than the one-sentence guarantee, and should perhaps be trimmed. The decision is to keep all three and fix only the defects found. The mutation pass earned its place by finding a real spec violation (`if b == 0` vs `if b <= 0`) that no human had noticed; the coverage ratchets are what turn "write the minimum code" from prompt discipline into a measured property, which is the same conversion the whole design is built on. The CRAP pipeline has not yet demonstrated comparable return and is the first thing to reconsider if this judgment proves wrong.
- **A hard read-isolation guarantee is out of scope.** It requires process-level sandboxing of the agent's test command. See *Threat model*.

## Build Order

1. **Spike the two risks above.** Nothing else is worth building until the hook's behavior inside subagents is known.
2. **`hooks/guard.mjs`** — unit-tested against piped JSON fixtures.
3. **`agents/*.md`** — validated with `plugin-dev/skills/agent-development/scripts/validate-agent.sh`.
4. **`/tdd-init`** — detection table and config writer.
5. **`skills/run-tdd-cycle`** — the orchestrator loop.
6. **End-to-end run** against a fixture repo with a three-item spec, one item deliberately already implemented so the `redundant` branch is exercised.

The plugin is built the way it preaches: tests first.

**Iteration 2** does not rebuild; it remediates. Order and rationale live in `docs/superpowers/plans/2026-08-01-architecture-review-remediation.md`. Two properties of that plan are worth stating here because they are design decisions, not scheduling ones:

- **The plan carries design intent, not implementation.** It states the invariant, the failure modes, and the test cases, and leaves the code to the implementer. The previous plan embedded 1940 lines of code inside a document reviewed as prose; all 20 recorded defects originated there, and one security fix landed in the document and never in the artifact. A plan that holds no code cannot drift from the code.
- **Every task's completion criterion requires a non-documentation file in the commit.** That is the direct countermeasure to the same failure.
