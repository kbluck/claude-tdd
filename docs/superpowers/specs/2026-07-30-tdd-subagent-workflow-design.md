# TDD Subagent Workflow — Design

**Date:** 2026-07-30
**Status:** Approved, not yet implemented

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
│   └── tdd-refactor.md
├── commands/
│   ├── tdd.md               /tdd <spec-path>
│   └── tdd-init.md          /tdd-init
├── skills/
│   └── run-tdd-cycle/
│       └── SKILL.md         orchestrator loop
└── hooks/
    ├── hooks.json           PreToolUse matcher
    └── guard.sh             phase-aware path guard
```

Each part has one job:

- **`skills/run-tdd-cycle`** holds the loop. `/tdd` is a thin entry point that invokes it, so the loop is also reachable by the model recognizing it applies.
- **`agents/*.md`** are pure role definitions — constraints and stop conditions, no orchestration logic.
- **`hooks/guard.sh`** is the only executable and is stateless: read `.tdd/phase` and `.tdd/config.json`, decide, exit.
- **`.tdd/`** lives in the target project, not the plugin.

### State

| Path | Committed | Purpose |
|---|---|---|
| `.tdd/config.json` | yes | toolchain commands, path globs, refactor thresholds |
| `.tdd/checklist.json` | no | run state; enables resume |
| `.tdd/phase` | no | current phase, read by the hook |

Run state is separated from config so an interrupted `/tdd` resumes from disk, and so the completion signal survives context compaction.

## The Cycle

### Preflight

`/tdd <spec-path>` refuses to start unless all four hold. Each is a precondition some later step silently depends on.

1. **Target is a git repo with a clean tree.** The audit's revert is `git reset --hard`, which would destroy uncommitted work.
2. **`.tdd/config.json` exists**, else run `/tdd-init` first.
3. **The full suite passes.** Refactor's stop condition is "all tests still pass" and Green's is "this test now passes"; both are meaningless against an already-red suite. If red, record the failing test IDs as a known-red allowlist and exclude them from every later comparison.
4. **Spec file is readable and non-empty.**

Preflight also clears any stale `.tdd/phase` left by an interrupted run, so the hook never evaluates against a phase from a previous session.

### Decompose

The orchestrator reads the spec once and writes an ordered checklist of test-sized behaviors, then presents it for approval before the first dispatch. Bad decomposition is cheap to correct here and expensive to correct on cycle 9.

```json
{
  "spec": "docs/specs/parser.md",
  "items": [
    { "id": 1, "behavior": "rejects empty input", "status": "pending" },
    { "id": 2, "behavior": "parses a single token", "status": "pending" }
  ]
}
```

`status` moves `pending → red → green → done`, or terminates at `redundant` or `blocked`. Written after every transition.

### Per item

```
write .tdd/phase = "red"  →  dispatch tdd-red
  │
  ├─ test FAILS ─────────────→ commit "red: <behavior>"
  │                            audit → phase = "green" → dispatch tdd-green
  │                            test passes → commit "green: <behavior>" → audit
  │                            → refactor trigger check
  │
  ├─ test PASSES, coverage ↑ → commit "test: <behavior>"   (no Green dispatch)
  │                            status = done → next item
  │
  └─ test PASSES, flat ──────→ git checkout -- .           (nothing committed)
                               status = redundant → next item
```

**Every commit is audited**, including the `test:` branch — Red can violate its write boundary whether the test it produced passed or failed. The diagram elides the repeat for readability; the rule has no exceptions.

The three-way outcome is the literal reading of the requirement that every authored test must *either* fail *or* measurably increase coverage. A passing test that raises coverage documents real existing behavior and is worth keeping; a passing test that raises nothing is waste.

**Consequence:** an item can complete without Green ever running. Completion is therefore **"no `pending` items remain"**, not "every item went red then green." This contradicts the usual TDD mental model and must be stated in the orchestrator skill.

### Refactor trigger check

After each green, the orchestrator reads the accumulated source diff and dispatches `tdd-refactor` only on a hit against a written trigger list:

- the same shape appears a third time (`refactorTriggers.duplicateThreshold`)
- a function crossed the line threshold (`refactorTriggers.maxFunctionLines`)
- a name in the new code drifted from the spec's vocabulary

No hit, no dispatch. This avoids paying for a subagent to conclude "nothing to do", which is the common case in early cycles, and avoids an idle Refactor agent inventing busywork to justify itself.

### Commits

Phase-level commits: `red:`, `green:`, `test:`, `refactor:`, each suffixed with the behavior. The history reads as the cycle and is bisectable; `git log --grep '^red:'` is a usable audit trail.

Per-phase commits also give the audit its baseline. Without one, `git diff` shows the accumulated work of all three agents and a violation cannot be attributed to the agent that caused it.

## Enforcement

Guardrails are enforced twice, at different surfaces.

### Boundaries

| | May read | May write | May run |
|---|---|---|---|
| **Red** | spec, existing test files, runner output | test globs only | configured test + coverage commands |
| **Green** | Red's handover report, source files, runner output | source globs only | configured single-test command |
| **Refactor** | source files, runner output | source globs only | configured full-suite command |

**Refactor's read carve-out.** "Only interface is the test runner's output" cannot mean literally no test information: a failing run prints test file paths, test names, assertion diffs, and often source excerpts. That is unavoidable and is not a violation. The boundary is precise: *open a test file, never; read what the runner prints, yes.* The same carve-out applies to Green.

### The hook and the audit are not redundant

The diff audit can only observe writes. Read isolation — the property that actually makes Green's implementation independent of the test's internals — leaves no post-hoc signature. The hook is the only mechanism that can enforce it.

**Hook** — `PreToolUse`, matching `Read|Write|Edit|Bash`. Reads `.tdd/phase` and `.tdd/config.json`, resolves the target path against the phase's allowed globs, denies on mismatch with a message naming the violated rule. Sole enforcement of read isolation. Safe against concurrency because the cycle is strictly sequential.

**Audit** — after each dispatch, `git diff HEAD~1 --name-only`, re-checking the write set against the phase's globs. Backstop for anything the hook missed: hook disabled, stale phase marker, an unanticipated mutation path.

### Bash: allowlist, not mutation-detection

Detecting mutation by parsing shell commands is unbounded and will lose — `sed -i`, `cat >`, `mv`, a codegen script, and arbitrarily many more.

Invert it. The three agents only ever legitimately need to run the commands in `config.json`. The hook permits a `Bash` call only when it prefix-matches a configured command for the current phase. Everything else is denied. `Read`, `Grep`, and `Glob` cover the inspection the agents would otherwise shell out for.

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

## Configuration

`.tdd/config.json` is committed and is the single source of truth shared by orchestrator, agents, and hook.

```json
{
  "version": 1,
  "commands": {
    "test":     "pytest -q",
    "single":   "pytest -q {testId}",
    "coverage": "pytest -q --cov --cov-report=json:.tdd/coverage.json"
  },
  "globs": {
    "test":   ["tests/**", "**/test_*.py"],
    "source": ["src/**"]
  },
  "refactorTriggers": { "maxFunctionLines": 40, "duplicateThreshold": 3 },
  "limits": { "greenAttempts": 3, "violationRetries": 1 }
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

`.tdd/phase` and `.tdd/checklist.json` are added to `.gitignore`.

**`/tdd-init` commits its own output.** It writes `.tdd/config.json` and edits `.gitignore`, which leaves the tree dirty — and preflight step 1 refuses to start against a dirty tree. Without this, the first-time path (`/tdd-init` then `/tdd`) fails on its own side effects.

**Coverage is optional.** If `commands.coverage` is null, Red's three-way outcome collapses to strict red: a passing test is always discarded. The workflow degrades rather than refusing to run.

## Risks

Two unverified assumptions sit under the enforcement design. Both are cheap to test and expensive to discover late.

1. **Do plugin `PreToolUse` hooks fire for tool calls made inside a subagent?** Not confirmable from local documentation. If they do not, the hook is inert, read isolation has no enforcement mechanism, and the audit cannot substitute — it cannot observe reads. This would require rework, not patching.
2. **Does a hook denial reach the subagent as a correctable message, or does it fail the agent outright?** Determines whether "deny and let it self-correct" is real or whether every denial costs a full re-dispatch.

A third, lower risk: the `PreToolUse` payload carries no agent identity (confirmed against `plugin-dev/skills/hook-development/SKILL.md`), which is why the phase marker file exists. The marker can go stale if a run is interrupted mid-phase; preflight must clear it.

## Build Order

1. **Spike the two risks above.** Nothing else is worth building until the hook's behavior inside subagents is known.
2. **`hooks/guard.sh`** — unit-tested against piped JSON fixtures, following the shape of `plugin-dev/skills/hook-development/scripts/test-hook.sh`.
3. **`agents/*.md`** — validated with `plugin-dev/skills/agent-development/scripts/validate-agent.sh`.
4. **`/tdd-init`** — detection table and config writer.
5. **`skills/run-tdd-cycle`** — the orchestrator loop.
6. **End-to-end run** against a fixture repo with a three-item spec, one item deliberately already implemented so the `redundant` branch is exercised.

The plugin is built the way it preaches: tests first.
