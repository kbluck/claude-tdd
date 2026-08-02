# TDD Subagent Workflow — Design

**Date:** 2026-07-30
**Status:** Implemented. This document was updated after the build to match the shipped system — several designs below changed on contact with reality, and each such change is marked with *why*.

## Purpose

A Claude Code plugin that implements Red-Green-Refactor TDD by dispatching role-constrained subagents. The governing principle: **no single agent writes both a test and the code that satisfies it.** Agents implement tests, or they implement code, never both in one context.

A secondary principle is minimalism. Each agent stops and hands over the moment it achieves its immediate objective.

### Scope

In scope: driving an existing specification to implementation through constrained Red/Green/Refactor cycles.

Out of scope: authoring the specification, and reviewing the resulting code for quality. The workflow starts from a spec that already exists and ends when the checklist has no pending items.

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
    └── guard.sh             role-aware path and command guard
```

Each part has one job:

- **`skills/run-tdd-cycle`** holds the loop. `/tdd` is a thin entry point that invokes it, so the loop is also reachable by the model recognizing it applies.
- **`agents/*.md`** are pure role definitions — constraints and stop conditions, no orchestration logic.
- **`hooks/guard.sh`** is the only executable and is stateless: read `agent_type` from the payload and `.tdd/config.json` from disk, decide, exit.
- **`.tdd/`** lives in the target project, not the plugin.

### State

| Path | Committed | Purpose |
|---|---|---|
| `.tdd/config.json` | no — gitignored | toolchain commands, path globs, thresholds |
| `.tdd/checklist.json` | no | run state; enables resume |

Run state is separated from config so an interrupted `/tdd` resumes from disk, and so the completion signal survives context compaction.

There is no phase marker. The hook learns the caller's role from the payload's `agent_type`, so nothing needs to be written before a dispatch and nothing can go stale.

## The Cycle

### Preflight

`/tdd <spec-path>` refuses to start unless all seven hold. Each is a precondition some later step silently depends on.

1. **Target is a git repo with a clean tree.** Reverting a dispatch destroys working-tree state — see *Reverting a dispatch* below.
2. **`.tdd/config.json` exists**, else run `/tdd-init` first.
3. **The full suite passes.** Refactor's stop condition is "all tests still pass" and Green's is "this test now passes"; both are meaningless against an already-red suite. If red, record the failing test IDs in `checklist.json` as `knownRed` and **pass that list into every Refactor and Mutate dispatch**. Both roles stop on a suite that is not green, so an allowlist that only exists in the file makes them refuse to run for the rest of the session. Every later suite comparison subtracts it.
4. **Spec file is readable and non-empty.**

5. **The glob partition is still exhaustive** — `git ls-files` produces no file matching neither `test`, `source`, nor `ignore`. Catches drift from edits made between runs. See *Writes are an allowlist; reads are a denylist* below for why this is load-bearing.
6. **`jq` is on `PATH`** — `guard.sh` parses its stdin with it.
7. **The guard sees `agent_type`** — dispatch a trivial probe subagent and confirm the hook observed a non-empty `agent_type`. If it did not, the guard silently permits everything a subagent does; stop rather than run unenforced. This is the one check that verifies the enforcement mechanism itself is alive.

### Decompose

The orchestrator reads the spec once and writes an ordered checklist of test-sized behaviors, then presents it for approval before the first dispatch. Bad decomposition is cheap to correct here and expensive to correct on cycle 9.

```json
{
  "spec": "docs/specs/parser.md",
  "knownRed": ["<test ids excluded from every comparison>"],
  "mutationRoundsRun": 0,
  "items": [
    { "id": 1, "behavior": "rejects empty input", "status": "pending" },
    { "id": 2, "behavior": "parses a single token", "status": "pending" }
  ]
}
```

`status` moves `pending → red → green → done`, or terminates at `redundant` or `blocked`. Written after every transition.

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

- **any method scores above `refactorTriggers.maxCrap`** — primary trigger; the dispatch is scoped to that method
- the same shape appears a third time (`refactorTriggers.duplicateThreshold`)
- a name in the new code drifted from the spec's vocabulary
- a function crossed `refactorTriggers.maxFunctionLines` — fallback only, when `crapMode` is `unavailable`

No hit, no dispatch. This avoids paying for a subagent to conclude "nothing to do", which is the common case in early cycles, and avoids an idle Refactor agent inventing busywork to justify itself.

### Mutation pass

When the checklist first empties, the orchestrator runs the mutation hardening pass described above rather than declaring completion. Survivors append to the checklist as new Red items; the loop resumes. The run ends when a pass produces no survivors, or after `limits.mutationRounds`.

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

Revert means both, scoped to the role's write globs:

```
git checkout -- <globs>     # restore tracked edits
git clean -fd -- <globs>    # remove new files
```

Only `clean` takes a pathspec; `git reset --hard -- <path>` fails outright. Reset is therefore tree-wide, which is safe only because preflight requires a clean tree and exactly one agent writes per dispatch.

### Paths are normalised before matching

The guard strips the project root by literal prefix, and the glob match then needs the relative path to start with a glob's prefix. Without normalisation a path spelled `./x`, `x//y`, or a root ending `/.` fails to strip, matches no glob — and because reads are a denylist, **no match means allow**.

This was live in the shipped guard until the final review: `red` was denied `e2e/src/calc/__init__.py` and permitted `./e2e/src/calc/__init__.py`, the same file. `./` is how a model habitually writes a relative path, so this was not an adversarial case. `tdd_normalize_path` collapses repeated slashes and leading, interior and trailing `.` segments, applied to both root and path.

**Writes are an allowlist; reads are a denylist.** A write must *match* the role's permitted globs; a read must merely *not match* the forbidden ones. The asymmetry is deliberate — agents legitimately read `README.md`, `pyproject.toml`, and type stubs, and an allowlist would fight them on every call.

But it means the read rule fails *open*: if `globs.source` is incomplete, a source file that matches nothing is readable by Red, and read isolation quietly disappears. Since globs come from auto-detection, this is a live risk — `src/**` misses a root-level package, a Go repo with source at the root, or a monorepo's second module.

**The globs must therefore form a proven-exhaustive partition.** `config.json` carries a third list, `globs.ignore`, for files that are neither test nor source (docs, manifests, CI config). `/tdd-init` runs `git ls-files` and refuses to write a config until every tracked file matches exactly one of the three. Preflight re-runs the same check, catching drift from edits made between runs.

The invariant is self-reinforcing once established: new files can only be created by an agent, and the write allowlist already forces them into `test` or `source`.

**Refactor's read carve-out.** "Only interface is the test runner's output" cannot mean literally no test information: a failing run prints test file paths, test names, assertion diffs, and often source excerpts. That is unavoidable and is not a violation. The boundary is precise: *open a test file, never; read what the runner prints, yes.* The same carve-out applies to Green.

### The hook and the audit are not redundant

The diff audit can only observe writes. Read isolation — the property that actually makes Green's implementation independent of the test's internals — leaves no post-hoc signature. The hook is the only mechanism that can enforce it.

**Hook** — `PreToolUse`, matching `Read|Write|Edit|Bash`. It identifies the caller from the payload's **`agent_type`** field, resolves the target path against that role's allowed globs, and denies on mismatch with a message naming the violated rule. Sole enforcement of read isolation.

```
agent_type absent                        → permit   (main thread / orchestrator)
agent_type not a tdd-* role              → permit   (unrelated work)
tdd-red | tdd-green | tdd-refactor
        | tdd-mutate                     → apply that role's rules
```

**Why `agent_type` and not a phase-marker file.** An earlier draft had the orchestrator write `.tdd/phase` before each dispatch. That design is broken, and the spike (`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`) showed why: during the red phase the orchestrator itself runs `git diff --name-only` to audit Red's work. A marker-based guard would judge that main-thread call against Red's Bash allowlist, find `git diff` does not prefix-match the test command, and **deny the orchestrator's own audit.** A marker file cannot distinguish orchestrator from agent. `agent_type` can, and is the only thing that can.

Dropping the marker also removes the stale-marker failure mode and the strictly-sequential constraint, which existed only because one global file cannot describe two concurrent cycles.

**The hook fails closed — but only once it knows the caller is a constrained role.** For a recognized `tdd-*` agent, a missing `jq`, an unreadable `.tdd/config.json`, or an unmappable role all deny. A guard that cannot evaluate must not default to permitting; that would disable read isolation silently, which is the exact failure this design exists to prevent. `/tdd-init` and preflight both check `jq` so the loud failure lands at setup rather than mid-cycle.

Before that point the guard exits 0 without reading anything, so installing this plugin does not perturb unrelated sessions.

**Residual risk: `agent_type` is undocumented.** It is absent from `plugin-dev/skills/hook-development/SKILL.md` and was found empirically on Claude Code 2.1.220. If a future version removed it, every subagent call would look like a main-thread call and the guard would fail **open** — the worst outcome available here, since reads leave no trace in a diff and nothing else would notice. Preflight therefore dispatches a trivial probe subagent and confirms the guard observed an `agent_type`, refusing to run if not. A startup check, not a per-call one.

**Audit** — after each dispatch, `git diff HEAD~1 --name-only`, re-checking the write set against the role's globs. Backstop for anything the hook missed: hook disabled, `agent_type` unavailable, an unanticipated mutation path.

### Bash: allowlist, not mutation-detection

Detecting mutation by parsing shell commands is unbounded and will lose — `sed -i`, `cat >`, `mv`, a codegen script, and arbitrarily many more.

Invert it. The three agents only ever legitimately need to run the commands in `config.json`. The hook permits a `Bash` call only when it prefix-matches a configured command for the current phase. Everything else is denied. `Read` covers the inspection the agents would otherwise shell out for. `Grep` and `Glob` are deliberately not granted: they sit outside the `PreToolUse` matcher, so such a call would never reach the guard at all, and `Grep` returns file content.

**The metacharacter ban applies to the delta, not the template.** A configured command is trusted — it was authored or confirmed by the user at init time, and some toolchains legitimately need a pipe or redirect to produce coverage. What the agent supplies beyond the template (the `{testId}` substitution, any appended flags) must contain no `;`, `|`, `&&`, `>`, backtick, or `$(`. Banning metacharacters in the template itself would make the rule unsatisfiable for those toolchains, and the failure would surface at init time as an unexplained rejection.

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
  "observedFailure": "<verbatim runner output>"
}
```

`publicApi` is load-bearing. Green cannot read the test, so without an explicit signature it cannot know what to implement.

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

`/tdd-init` must state which of these apply rather than degrading silently. Each one removes a mechanical check and replaces it with prompt discipline, and the user should know which guarantees they are actually getting.

## Risks

**Resolved by the spike** (`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`, Claude Code 2.1.220):

1. ~~Do plugin `PreToolUse` hooks fire inside a subagent?~~ **Yes.** Verified against a real plugin-format hook, not a settings.json proxy.
2. ~~Is a denial correctable or fatal?~~ **Correctable.** The subagent received the `systemMessage` verbatim and continued working.
3. ~~The payload carries no agent identity.~~ **False** — it carries `agent_type` and `agent_id`; the `plugin-dev` documentation is incomplete. This removed the phase marker and fixed the orchestrator-audit bug described under *Enforcement*.

**Open:**

1. **Does a plugin's own custom agent report its own name in `agent_type`?** The spike dispatched the built-in `general-purpose` and got `"general-purpose"` back. The guard's dispatch table assumes `tdd-red` yields `agent_type: "tdd-red"`. Plausible but untested, and load-bearing — if custom agents report something else, every rule lookup misses and the guard permits everything. Verify when the agent definitions land, before they are considered done.
2. **`agent_type` is undocumented and could change.** Mitigated by the preflight probe (*Preflight*, item 7), which fails the run loudly rather than proceeding unenforced.
3. **Coverage and complexity report parsing is toolchain-specific** and is now the largest remaining source of silent failure. An extractor returning `0` on a shape it does not recognize would disable all three coverage gates and the CRAP trigger while every other check still passes.

## Build Order

1. **Spike the two risks above.** Nothing else is worth building until the hook's behavior inside subagents is known.
2. **`hooks/guard.sh`** — unit-tested against piped JSON fixtures, following the shape of `plugin-dev/skills/hook-development/scripts/test-hook.sh`.
3. **`agents/*.md`** — validated with `plugin-dev/skills/agent-development/scripts/validate-agent.sh`.
4. **`/tdd-init`** — detection table and config writer.
5. **`skills/run-tdd-cycle`** — the orchestrator loop.
6. **End-to-end run** against a fixture repo with a three-item spec, one item deliberately already implemented so the `redundant` branch is exercised.

The plugin is built the way it preaches: tests first.
