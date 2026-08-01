---
name: run-tdd-cycle
description: Use when implementing a specification using TDD subagents. Orchestrates cycle, enforces roles, tracks progress.
---

# Run TDD Cycle

You are the orchestrator. You are **not** one of the three constrained roles — you read spec, tests, source, and diffs freely.
That asymmetry is deliberate: the guarantee is that no *agent* couples a test to its implementation, not that no *participant*
has full visibility.

Announce: "Using run-tdd-cycle to implement `<spec>`."

## Preflight — all seven, in order, before any dispatch

1. **Git repo, clean tree.** The audit's revert is `git reset --hard`, which would destroy uncommitted work. Dirty → stop, ask the
   user to commit or stash.
2. **`.tdd/config.json` exists.** Missing → tell the user to run `/tdd-init`. Do not write one yourself.
3. **`jq` on PATH.** Missing → stop. The guard fails closed without it and would deny every tool call.
4. **The full suite passes.** Run the configured test command. Green's stop condition is "this test now passes" and Refactor's is
   "all tests still pass" — both are meaningless against an already-red suite. If red, list the failing test IDs, ask the user whether
   to proceed, and if so record them in `checklist.json` as `knownRed`.

   **`knownRed` is not a note to yourself; it must be threaded or it is a lie.** Every later suite comparison is against "the baseline
   you were given", never against zero failures — and `tdd-refactor` and `tdd-mutate` both stop on a suite that is not green, so they
   must receive the list or they will refuse to run for the rest of the session. Pass `knownRed` in every Refactor and Mutate dispatch.
   When you check a suite yourself, subtract it before judging. If you find yourself unable to thread it somewhere, stop and say so
   rather than proceeding with an allowlist that only exists in the file.
5. **The glob partition is still exhaustive.** `git ls-files`; every path must match `test`, `source`, or `ignore`. Drift since
   init → stop and tell the user to re-run `/tdd-init`. This is what makes the guard's read denylist sound.
6. **Spec file readable and non-empty.** Unreadable or empty → stop; there is nothing to decompose.
7. **The guard actually sees `agent_type`.** Dispatch a throwaway subagent told to read one file under `globs.source` while claiming
   no role, then confirm the guard evaluated it. Cheaper equivalent: dispatch `tdd-red` with the instruction "read `<a source file>`
   and report the first line" and confirm it comes back **denied**.

   If that read succeeds, the guard is not seeing `agent_type`, every subagent looks like the orchestrator, and **read isolation
   is silently absent**. Stop. Do not run unenforced — reads leave no trace in a diff, so nothing downstream would ever notice.
   `agent_type` is undocumented (found empirically on Claude Code 2.1.220) and this is the check that catches it disappearing.

   **Only an observed denial passes this check.** If the probe cannot be dispatched, errors, or returns something you cannot
   interpret, that is not a pass — it is the same unknown state as a missing denial, and it fails closed. The one outcome that
   clears preflight is the agent reporting back that the read was denied, with the guard's message in it.

There is no phase marker to clear — the guard identifies callers from the payload's `agent_type`.

## Decompose

Read the spec once. Write `.tdd/checklist.json`:

    {
      "spec": "<path>",
      "knownRed": ["<test ids excluded from comparisons>"],
      "items": [
        { "id": 1, "behavior": "<one testable behavior>", "status": "pending" }
      ]
    }

Items may also carry `"overbuilt": true`, set by the Green coverage gate. It is a flag for review, not a status — the item still
reaches `done`.

Each item is **one** behavior, small enough for a single test. Order them so earlier items do not depend on later ones.

**Show the checklist to the user and get approval before the first dispatch.** Bad decomposition is cheap to fix here and expensive
to fix on cycle 9.

**A checklist with no items is a failed decomposition, not a finished run.** Completion below is "no item is `pending`", which an
empty list satisfies immediately — so a spec you could not decompose would report success having built nothing. Require at least one
item, state the count when you present it, and if the spec yields none, say so and stop rather than proceeding.

`status`: `pending` → `red` → `green` → `done`, or terminating at `redundant` or `blocked`. Write the file after every transition.
An interrupted run resumes from this file, not from your context.

## Coverage baselines

All three roles are gated on coverage, and every gate compares against a baseline you capture. Skip all of this if
`commands.coverage` is null.

**A measurement you cannot parse is unavailable, never zero.** Every gate in this workflow compares a number against a threshold, so
an extractor that returns `0` on a report shape it does not recognise silently satisfies all of them: Green's overbuild check
passes, Refactor's hard-zero check passes, and CRAP finds no triggers. Nothing else in the design would notice. If a report cannot
be parsed, say so, skip the gate explicitly, and record it in the run summary as unenforced — do not let a parse failure read as a
clean result.

Run the coverage command and record the uncovered-line count:

- **at preflight**, as the run's starting baseline
- **immediately before each Green dispatch** (after Red's commit)
- **immediately before each Refactor dispatch**

Compare after each dispatch. If a baseline reports zero total lines — an empty project, a first implementation — skip that cycle's
gate; there is nothing meaningful to compare against.

**Red is the one role that measures for its own branch decision.** It needs the coverage delta to distinguish `passing-covered` from
`passing-flat`, and it needs that answer before it can report at all — so you pass it the current baseline and it runs coverage
itself. You then re-measure to confirm, exactly as you re-run Green's test rather than trusting its word.

For Green and Refactor, measuring is your job. They may check themselves to self-correct before handing over, which is cheaper than
a re-dispatch, but your measurement is the one that decides.

## Per item

### Red

1. Dispatch `tdd-red` with: the spec path, the one item, the configured commands, and the current coverage baseline.
2. On return, **audit**: `git diff --name-only` plus `git status --porcelain`. Every touched path must match `globs.test`.
   Violation → `git checkout -- .`, re-dispatch quoting the rule and the offending path, up to `limits.violationRetries` times.
   Beyond that → stop, escalate.

   **An empty diff is not a passing audit.** "Every touched path matched" is vacuously true when nothing was touched. If Red reports
   `failing`, `passing-covered`, or `passing-flat`, it claims to have written a test — so at least one path must have changed. Zero
   changed paths alongside any of those outcomes means the agent reported work it did not do: treat it as `blocked` and escalate
   rather than committing an empty commit and moving on. The same applies to Green's audit below.
3. Branch on `outcome`:
   - `failing` → commit `red: <behavior>`, status `red`, continue to Green.
   - `passing-covered` → **re-measure coverage yourself before committing.** This branch writes a commit and skips Green entirely on
     the strength of a number the agent computed about its own work; it is the one place nothing else would catch a wrong answer.
     Delta confirmed → commit `test: <behavior>`, status `done`, next item. Delta not confirmed → treat as `passing-flat`.
   - `passing-flat` → `git checkout -- .`, status `redundant`, next item.
   - `blocked` → status `blocked`, record the reason, **stop and escalate**.

`blocked` is not `redundant`. `redundant` means a test was written, passed, and moved no coverage — the behavior is already covered.
`blocked` means Red failed to do its job. Collapsing them would silently drop a spec item as "already covered" without verification.

### Green

1. Dispatch `tdd-green` with **only** Red's handover report. Do not paste test source — that is the whole point of the separation.
2. On return, audit as above against `globs.source`.
3. `outcome: stuck` → record the reason on the item, write the checklist, then stop and escalate with the agent's attempts.
4. Independently verify: run the configured single-test command against `testId` yourself. Do not take the agent's word for it.
   **Not passing → `git checkout -- .`, treat it as `stuck`, and escalate.** An agent reporting a pass the orchestrator cannot
   reproduce is worse than one reporting failure, and committing on its word would bury it.
5. **Run the full suite**, subtracting `knownRed`. Green only ever runs one test, so nothing else in the loop would notice it
   regressing a previously-passing test elsewhere — the next signal would be a Refactor dispatch that may never fire, or the mutation
   pass after every item is done. New failure → `git checkout -- .`, re-dispatch once naming the regressed tests. Still failing → stop
   and escalate.
6. **Coverage gate** (skip entirely if `commands.coverage` is null, or if the baseline reports zero total lines):
   - Run the coverage command. Compute new uncovered lines against the pre-dispatch baseline.
   - Within `coverageGates.greenMaxNewUncovered` → commit `green: <behavior>`, status `green`.
   - Over → `git checkout -- .` and re-dispatch once, naming the specific uncovered file:line ranges and instructing Green to
     implement only what the test drives.
   - Over a second time → accept it, commit, and set `"overbuilt": true` on the checklist item. Do not grind. The rule has honest
     exceptions — satisfying a divide-by-zero test requires writing the happy path, which that test never executes — and a flagged
     item is more useful to the user than a stalled run.

`overbuilt` is a flag on the item, not a status; the item still reaches `done`.

### Refactor trigger check

Dispatch `tdd-refactor` only on a hit:

- **any method scores above `refactorTriggers.maxCrap`** — the primary trigger. Scope the dispatch to that method.
- the same shape appears `refactorTriggers.duplicateThreshold` times
- a name drifted from the spec's vocabulary
- Green reported a non-empty `mess`
- a function exceeds `refactorTriggers.maxFunctionLines` — **only** when `crapMode` is `unavailable`

**Computing CRAP.** `CRAP(m) = comp(m)² × (1 − cov(m))³ + comp(m)`, with `cov` as a fraction. At full coverage it reduces to plain
complexity; as coverage falls the penalty grows cubically. Threshold 30 means a 5-complexity untested method and a 30-complexity
fully-tested one rank equally — which is the point.

By `crapMode`:

- `native` — read the score straight from the coverage report (PHPUnit, Cobertura).
- `computed` — run `commands.complexity` for per-method cyclomatic complexity, take per-file line coverage from the coverage report,
   map covered lines onto each method's line range to get `cov(m)`, then apply the formula.
- `unavailable` — skip; use `maxFunctionLines`.

The line-range mapping is the fiddly part and the most likely thing to be quietly wrong. If a method's computed coverage is `1.0`
for every method in a file you know is partly untested, the mapping is broken — say so rather than reporting no triggers.

No hit → status `done`, next item. This avoids paying for a subagent to conclude "nothing to do", a common case in early cycles.

On dispatch: pass the trigger, the source paths in scope, and `knownRed`. Audit against `globs.source`.

Then apply the **hard coverage gate**: run coverage yourself and compare against the pre-dispatch baseline. Any increase in
uncovered lines beyond `coverageGates.refactorMaxNewUncovered` (default 0) → `git reset --hard HEAD` and record `reverted`,
regardless of what the agent reported. New uncovered lines mean new behavior, and Refactor adding behavior is a boundary violation,
not a quality issue. There is no re-dispatch — reverting is the correct outcome.

Branch on all four outcomes:

- `improved` and the gate passed → commit `refactor: <behavior>`.
- `no-change-needed` → commit nothing, record it, continue. This is a good outcome, not a failure; the trigger fired and the agent
  judged there was nothing worth doing.
- `reverted` → record it and continue. A refactor that backed out cleanly is not a failed cycle.
- `blocked` → **stop and escalate.** Refactor reports `blocked` when it could not evaluate its own work — typically a suite that was
  already failing. That is a broken precondition, not a judgement call, and continuing past it means every later Refactor dispatch
  hits the same wall silently. This is the same rule as the Escalation section below; there is no Refactor exemption.

**On `reverted`, verify the tree rather than trusting the report.** Refactor restores by rewriting recorded text with `Edit`/`Write`
instead of `git checkout`, so an imperfect restore is possible and the coverage gate would not catch one whose uncovered-line count
happened to match. Require `git diff HEAD` to be empty; if it is not, `git reset --hard HEAD` yourself and record that the agent's
restore was incomplete.

Then status `done`, next item.

## Mutation pass

**An empty checklist does not end the run.** When no item is `pending`, run the hardening pass — unless you have already run
`limits.mutationRounds` of them.

Coverage gates prove code was executed. They cannot prove any test would notice if that code were wrong. This pass finds the tests
that execute without asserting.

1. Rank the targets. With `crapMode` `native` or `computed`, compute CRAP per method and rank descending. With
   `crapMode: "unavailable"` there are no scores to rank by — fall back to the source files changed since the last mutation
   round, longest function first, and say in the report that ranking was unguided. Do not dispatch with an empty target
   list; that guarantees `mutantsAttempted: 0`.
2. **Verify the tree is clean before dispatching**: `git status --porcelain` and `git diff HEAD` must both be empty. `tdd-mutate`'s
   prompt tells it you have already done this, and it skips its own check on that basis — so if you skip it too, nobody checks. A
   mutate run started on a dirty tree cannot distinguish its own mutations from pre-existing edits, and its restore step would
   silently revert your work along with its own. Dirty → stop and report; do not dispatch.
3. Dispatch **`tdd-mutate`** with the ranked target list, `limits.mutantsPerPass`, `knownRed`, and the mutation command if one is
   configured.
4. On return, **verify the tree is clean**: `git status --porcelain` must be empty and `git diff HEAD` must be empty. If the tree is
   not clean → `git reset --hard HEAD`, record it, and do not trust the report — an agent that failed to revert may also have failed
   to run the suite honestly between mutants.
5. Re-run the full suite. It must be green.
6. For each survivor, append a checklist item:

       { "id": <next>, "behavior": "<the survivor's missingBehavior>",
         "status": "pending", "origin": "mutation",
         "mutant": { "file": ..., "line": ..., "mutation": ... } }

7. Survivors found → report the count and **resume the per-item loop**. The new items run as ordinary Red→Green cycles.
8. No survivors, or `limits.mutationRounds` reached → done.

Record the completed round count in `checklist.json` as `mutationRoundsRun` each time a pass finishes. It is the one piece of loop
state not otherwise on disk, and without it an interrupted run resumes with no idea how many passes it has already spent — which
contradicts this file's own claim that the checklist, not your context, is what a resumed run reads.

If the pass skipped mutants because of `mutantsPerPass`, say how many. A capped pass that reports "no survivors" without mentioning
the cap reads as a clean bill of health it did not earn.

**`mutantsAttempted: 0` is a failed pass, not a clean one.** No targets ranked, a mutation tool that did not run, a CRAP computation
that produced no scores — each yields zero survivors and looks identical to a suite whose tests are genuinely strong. Check
`mutantsAttempted` before believing `survivors`, and if it is zero, report the pass as unable to run rather than as passing.

## Completion

Done when no item is `pending`, **no item is `blocked`**, and the mutation pass has either produced no survivors or exhausted
`limits.mutationRounds`.

`blocked` is not `pending`, so a completion test that only looks for `pending` reports success with real work outstanding. That
cannot happen mid-run, because `blocked` stops immediately — but a resumed run loading a checklist that already contains one would
sail past it. On resume, re-surface every `blocked` item and ask the user before continuing.

Report the tally: how many items went red→green, how many were `passing-covered`, how many `redundant`, how many originated from
mutation survivors, and how many mutants were skipped by the cap.

Note that "every item went red then green" was never the completion condition — the `passing-covered` branch completes an item
without Green ever running.

The guard needs no teardown — it is inert for any call that carries no `tdd-*` `agent_type`.

## Escalation

Stop and return to the user on: a second guardrail violation by the same agent, Green stuck after `limits.greenAttempts`, any
`blocked` outcome, or a suite that goes red in a way Refactor did not cause. Do not loop. A stuck agent is information the user
needs, not a problem to grind on.
