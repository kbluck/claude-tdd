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

1. **Git repo, clean tree.** Reverting a dispatch destroys working-tree state — see *Reverting a dispatch* for what that actually
   runs. Dirty → stop, ask the user to commit or stash.
2. **`.tdd/config.json` exists.** Missing → tell the user to run `/tdd-init`. Do not write one yourself.
3. **The full suite passes.** Run the configured test command. Green's stop condition is "this test now passes" and Refactor's is
   "all tests still pass" — both are meaningless against an already-red suite.

   **`knownRed` is captured once, at first-run preflight, and never re-derived.** It means "failing before this run began" — a
   property of the starting tree, not of whatever this check happens to see. Before treating a red suite as a candidate baseline,
   determine first run vs. resume the same way `## Decompose` does: does `.tdd/checklist.json` exist and have items?

   - **First run** (checklist absent or empty). If red, list the failing test IDs, ask the user whether to proceed, and if so record
     them in `checklist.json` as `knownRed`.
   - **Resume** (checklist present with items). Read the checklist's existing `knownRed` — this step does not ask for it again and
     does not overwrite it. If the suite is red, classify every failing test ID against three buckets, checked in this order —
     **a red suite is not automatically a baseline just because this is a resume; only an exact match against one of the first two
     buckets is exempt:**

     1. **Already in the recorded `knownRed`.** Expected by definition — accepted before this run began. Do not re-ask, do not
        re-record. Check this bucket first: on an ordinary resume with no item currently at status `red`, every failure lands
        either here or in bucket 3, and starting with attribution instead of this check would route already-accepted failures
        into the ask again — contradicting "does not ask for it again" two sentences up.
     2. **Matches the `testId` recorded on the item currently at status `red`**, if any. Expected mid-cycle state — Red wrote
        this test, Green has not run yet — and must not be added to `knownRed`. This is an exact test-ID comparison against the
        field *Decompose* declares and *Per item / Red* writes, not a guess at which file a failure belongs to.
     3. **Neither of the above.** A genuinely new red suite, not a resume artifact: treat it exactly like the first-run case
        above — list it, ask the user, and if they agree to proceed, append it to the existing recorded `knownRed` rather than
        overwriting the list.

   **`knownRed` is not a note to yourself; it must be threaded or it is a lie.** Every later suite comparison is against "the baseline
   you were given", never against zero failures — and `tdd-refactor` and `tdd-mutate` both stop on a suite that is not green, so they
   must receive the list or they will refuse to run for the rest of the session. Pass `knownRed` in every Refactor and Mutate dispatch.
   When you check a suite yourself, subtract it before judging. If you find yourself unable to thread it somewhere, stop and say so
   rather than proceeding with an allowlist that only exists in the file.
4. **Spec file readable and non-empty.** Unreadable or empty → stop; there is nothing to decompose.
5. **The glob partition is still exhaustive.** `git ls-files`; every path must match `test`, `source`, or `ignore`. Drift since
   init → stop and tell the user to re-run `/tdd-init`. This is what makes the guard's read denylist sound.
6. **Node is on `PATH` and is at least v22** — the floor `hooks/lib/rules.mjs` enforces on itself as `NODE_FLOOR`. A floor, not a
   pin; a newer major passes. Run `node --version` through the `Bash` tool. Missing, or below v22 → stop and tell the user to
   install or upgrade Node.

   **The two failures are not the same shape.** A too-old-but-*present* Node does launch `guard.mjs`, which checks its own
   version first, before anything else can throw, and denies loudly with exit 2 — that path is genuinely fail-closed on its own.
   A missing Node never launches the guard at all: `PreToolUse` sees a non-2 exit and silently *permits* the call, exactly like a
   missing shell did. Preflight exists to catch both loudly, at setup, rather than let either reach a live dispatch.

   **This proves less than it looks like it proves — item 7 is what closes the gap.** This check only shows that node is on the
   *`Bash` tool's* `PATH`. The hook itself is spawned by Claude Code directly, in exec form, with no shell, so it resolves `node`
   against a different environment — and under a per-shell version manager (`fnm`, `nvm`) the two routinely disagree. Measured on
   the development machine: an IDE-hosted session resolved the hook's `node` to a bundled 24.13.0 while `fnm` gave the `Bash` tool
   22.23.2, at the same moment on the same machine. Report both results to the user: a green version check here is necessary and
   **never sufficient** — do not let it read as proof the guard can start. Only item 7's observed denial is that proof.
7. **The guard actually sees `agent_type`.** This is also the only check that runs inside the interpreter Claude Code actually
   hands the hook — item 6's version check cannot see that far. Dispatch a throwaway subagent told to read one file under
   `globs.source` while claiming no role, then confirm the guard evaluated it. Cheaper equivalent: dispatch `tdd-red` with the
   instruction "read `<a source file>` and report the first line" and confirm it comes back **denied**.

   If that read succeeds, the guard is not seeing `agent_type` — or never launched at all, which looks identical from here — every
   subagent looks like the orchestrator, and **read isolation is silently absent**. Stop. Do not run unenforced — reads leave no
   trace in a diff, so nothing downstream would ever notice. `agent_type` is undocumented (found empirically on Claude Code
   2.1.220) and this is the check that catches it disappearing.

   **Only an observed denial passes this check.** If the probe cannot be dispatched, errors, or returns something you cannot
   interpret, that is not a pass — it is the same unknown state as a missing denial, and it fails closed. The one outcome that
   clears preflight is the agent reporting back that the read was denied, with the guard's message in it.

There is no phase marker to clear — the guard identifies callers from the payload's `agent_type`.

## Decompose

**Decompose runs only when the checklist is absent.** Before doing anything else, check whether `.tdd/checklist.json`
exists and has items:

- **Absent, or present with no items** → this is a first run. Continue below.
- **Present with items** → this is a resume, not a first run. Load the file exactly as written — every field, including any this
  section does not itself populate (`baselines`, for instance, is written by the coverage-gate machinery elsewhere in this file, not
  here) — rather than reconstructing only the fields below. Do not write a new checklist: doing so is exactly what discarded every
  item's `status`, `knownRed`, `mutationRoundsRun`, and the baselines before this branch existed. Re-surface every item with status
  `blocked` and ask the user before continuing (see *Completion*), then resume the per-item loop from the first item whose status is
  not terminal — `pending`, `red`, and `green` are not terminal; `done`, `redundant`, and `blocked` are.

  **Unless every item is still `pending`, skip the approval step below** — it is for a new decomposition, not a continued one. If
  every item is still `pending`, nothing has been dispatched yet, so this state is indistinguishable from a first run interrupted
  between writing the checklist and showing it for approval: `.tdd/checklist.json` is gitignored, so that write never dirties the
  tree for Preflight's clean-tree check to catch. Show it for approval as if this were a first run — cheap, since no work exists yet
  to lose by asking again.

Read the spec once. Write `.tdd/checklist.json`:

    {
      "spec": "<path>",
      "knownRed": ["<test ids excluded from comparisons>"],
      "mutationRoundsRun": 0,
      "items": [
        { "id": 1, "behavior": "<one testable behavior>", "status": "pending", "testId": null }
      ]
    }

Write `mutationRoundsRun` at decompose time, initialised to `0`, and `testId` on every item initialised to `null`. Every field the
loop reads is declared here; leaving one to be created later by whichever step first needs it is the shape `knownRed` had before it
turned out nothing read it — a value that exists in prose but not in the schema is one nobody has to account for. `testId` is set once
Red's outcome is `failing` (see *Per item / Red*) and stays there as the exact identifier of that item's own test; Preflight step 3
reads it back on a resume to tell the in-progress item's expected failure apart from a genuinely new one — the same argument that put
`mutationRoundsRun` here applies to `testId`.

Items may also carry `"overbuilt": true`, set by the Green coverage gate. It is a flag for review, not a status — the item still
reaches `done`.

Each item is **one** behavior, small enough for a single test. Order them so earlier items do not depend on later ones.

**Show the checklist to the user and get approval before the first dispatch.** Bad decomposition is cheap to fix here and expensive
to fix on cycle 9.

**A checklist with no items is a failed decomposition, not a finished run.** Completion below is "no item is `pending`", which an
empty list satisfies immediately — so a spec you could not decompose would report success having built nothing. Require at least one
item, state the count when you present it, and if the spec yields none, say so and stop rather than proceeding.

`status`: `pending` → `red` → `green` → `done`, or terminating at `redundant` or `blocked`. Write the file after every transition.
An interrupted run resumes from this file, not from your context — the branch at the top of this section is exactly how.

## Reverting a dispatch

Several branches below say to discard an agent's work. **`git checkout -- .` is not sufficient on its own** — it restores tracked
files but leaves untracked ones in place, and Red's tests are almost always new files. Verified during the first live run: after
`git checkout -- .`, a rejected `passing-flat` test was still sitting in the tree, where the next item's commit would have swept it
up.

**Scoping `checkout` to a pathspec does not fix that, and is worse.** `git checkout -- <path1> <path2>` validates every pathspec
before touching anything: if *any* one of them does not match a file git already tracks, the whole command aborts and restores
*nothing* — not even the paths that would have matched. Verified: `git checkout -- tracked.py untracked.py`, where `tracked.py`
was a legitimately modified tracked file and `untracked.py` was new, exited 1 and left `tracked.py` unrestored. `tracked.py`
alone (no untracked sibling in the pathspec) exited 0 and succeeded. The exit code does distinguish the two cases reliably, but
the tree state is what actually matters — an orchestrator that ran this inside a larger command (piped through a filter, or
guarded by `|| true` the way a defensive probe script might) could still lose the signal and read the error line without
noticing nothing was restored. This is the ordinary shape of a violating dispatch, not an edge case — Red's tests are almost
always new files, so a pathspec built from what a check found routinely mixes a tracked-modified path with an untracked-new
one. The consequence is the worst available shape: `checkout` silently restores nothing, `clean` (which does not share this
failure — see below) still removes the untracked files, and the tree looks reverted while the tracked modification survives
into the next commit. A fourth instance of the class this section opens with — not created by scoping the pathspec to fix the
third, but *exposed* by it: this failure was already latent in `checkout`'s literal-pathspec handling, and the pre-Task-7 glob
pathspec happened to mask it, since a glob resolves against tracked files only and never fails to match the way a literal
untracked path does.

Revert means both:

    git reset --hard HEAD          # restore every tracked file to HEAD — no pathspec, so nothing to abort on
    git clean -fd -- <pathspec>    # remove the untracked paths this dispatch's check found

`git reset --hard` replaces `checkout` here, everywhere in this file — not only at the sites that already used it before this
fix (Refactor's coverage gate, Refactor's incomplete-restore check, the mutation pass's tree-clean recovery). `reset --hard` is
tree-wide and **cannot** be scoped: `git reset --hard -- <path>` fails with `fatal: Cannot do hard reset with paths.` That is
exactly what makes it immune to the failure above — with no pathspec to validate, it cannot abort partway through one. It is safe
to run unscoped only because preflight requires a clean tree and exactly one agent writes per dispatch, so the only tracked
changes to discard are ever that dispatch's own; that argument already justified the three sites using it before this fix, and
it holds identically at the rest, so nothing is lost by extending it to all of them.

**`clean` does not share `checkout`'s atomicity failure.** `git clean -fd -- <path1> <path2>` evaluates each pathspec entry on
its own: an entry that is not an untracked path is silently skipped, not treated as an error that aborts the rest. Verified:
`git clean -fd -- tracked.py untracked.py` removed only `untracked.py` and exited 0. This is why the pathspec below can safely
be *every* path a check found, tracked or not, without splitting it first — `reset --hard` handles the tracked half
unconditionally, and `clean` correctly no-ops on whichever entries in its own list turn out to already be tracked.

The mutation-pass case is the sharpest illustration of why `clean` must be paired with something at all: that reset is the safety
net for an agent that failed to revert its own mutations. It detects the problem with `git status --porcelain`, which *does* show
untracked files, and `reset --hard` alone can never remove them — only `clean` can.

**Only the `clean` half takes a pathspec — and that pathspec is every path the triggering check actually found, not the role's
write globs.** A guardrail violation is *by definition* a write to a path that does not match the role's globs — that is what
makes it a violation rather than ordinary work. So in the scenario this backstop exists for, the rogue file sits outside the
glob by construction, and a `clean` scoped to the glob can never reach it. Two cases, not one; do not collapse them:

- **A check found concrete paths responsible for the discard.** Red's audit and Green's each name the paths that failed the glob
  match (see *Per item*). Refactor's incomplete-restore check and the mutation pass's tree-clean recovery each re-run `git status
  --porcelain` (and `git diff HEAD`) and find it non-empty when it was supposed to be clean — that finding **is** a list of
  concrete paths, the same way an audit's is. **Refactor's hard coverage gate belongs here too, for a reason specific to
  Refactor:** its own audit step (see *Per item*) is one clause with no defined violation branch, so unlike Green's coverage-gate
  overrun below — which fires only after an audit that *does* gate conformance — reaching Refactor's gate proves nothing about
  whether every touched path stayed inside `globs.source`. Run the same `git diff --name-only` / `git status --porcelain` Red's
  and Green's audits use, fresh, at the point the gate fires, and scope `clean` to what it returns instead. In every one of
  these five sites, scope `clean` to **every path the check found**, not only the subset that broke the glob match where one
  exists. A dispatch that violated the glob usually also wrote legitimate in-glob files alongside the rogue one — leaving those
  behind after `clean` reproduces the exact bug this section opens with (a rejected file surviving to be swept into a later
  commit), just for the half of the dispatch that happened to pass the glob check. And a dirty path found at any of these sites
  is not automatically confined to `globs.source`: the guard that normally keeps Refactor and Mutate inside it is the same
  fallible mechanism Preflight item 7 exists to probe, so a dirty path outside the glob here is the backstop scenario, not a
  hypothetical one.
- **No check found anything — the discard follows a judgment made from an already-clean audit that gates conformance.** Red's
  `passing-flat` outcome, Green's unreproducible pass, Green's full-suite regression, and Green's coverage-gate overrun are
  decisions made *after* that dispatch's own audit already passed with nothing flagged — and, unlike Refactor's audit, Red's and
  Green's each have a defined `Violation → revert` branch (see *Per item*), which is what makes "the audit already confirmed
  everything is inside the glob" a fact rather than an assumption. There is no list of problem paths to name here, only that
  earlier confirmation. Fall back to `globs.test` for Red, `globs.source` for Green. Refactor and Mutate have no site in this
  bucket: every one of their discards is the found-paths case above.

Either way, an unscoped `git clean -fd` would delete legitimately untracked work elsewhere in the tree, so never run `clean`
without one of these two pathspecs — the found paths, or the role's glob fallback. (`clean` without `-x` spares gitignored paths,
so the venv, the checklist and the coverage report survive either way; do not add `-x`.)

Branches below say **revert** or **reset and clean** and point here — both now name the identical mechanism, `reset --hard HEAD`
plus a scoped `clean`. They do not spell out the bare git commands at the point of use, deliberately: an orchestrator reading
`git checkout -- .`, or a scoped `git checkout -- <pathspec>`, at the point of use would run exactly that — which is the defect
this section exists to fix, twice over now. Keeping the mechanism defined in exactly one place is also what let this fix land as
an edit to this section alone, rather than nine separate edits at every call site.

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
   Violation → **revert** (see *Reverting a dispatch*) scoped to every path this audit found touched, not only the ones that
   broke the glob match — the whole dispatch is rejected, not just its out-of-glob half. Re-dispatch quoting the rule and the
   specific paths that broke the match, up to `limits.violationRetries` times. Beyond that → stop, escalate.

   **An empty diff is not a passing audit.** "Every touched path matched" is vacuously true when nothing was touched. If Red reports
   `failing`, `passing-covered`, or `passing-flat`, it claims to have written a test — so at least one path must have changed. Zero
   changed paths alongside any of those outcomes means the agent reported work it did not do: treat it as `blocked` and escalate
   rather than committing an empty commit and moving on. The same applies to Green's audit below.
3. Branch on `outcome`:
   - `failing` → record the handover's `testId` on the item, commit `red: <behavior>`, status `red`, continue to Green.
   - `passing-covered` → **re-measure coverage yourself before committing.** This branch writes a commit and skips Green entirely on
     the strength of a number the agent computed about its own work; it is the one place nothing else would catch a wrong answer.
     Delta confirmed → commit `test: <behavior>`, status `done`, next item. Delta not confirmed → treat as `passing-flat`.
   - `passing-flat` → **revert** (see *Reverting a dispatch*), status `redundant`, next item — **unless the item has
     `origin: "mutation"`**, in which case see below.

   **Mutation-origin items are judged on killing the mutant, not on coverage.** A surviving mutant means the source is *correct* and
   the test is weak, so a Red test for that behavior necessarily passes, and it necessarily moves no coverage — the line was already
   executed by the assertion-free test that let the mutant survive in the first place. Applying the three-way rule unchanged
   classifies every such item `passing-flat`, discards the test, and the next round rediscovers the identical survivors: the loop
   runs to `limits.mutationRounds` having closed nothing.

   So for an item carrying `origin: "mutation"`, ignore the coverage delta and verify the kill yourself. For each mutation recorded
   in the item's `mutant` field: apply it to the source, run Red's new test, confirm it **fails**, then restore. You can do this
   because you are unconstrained; Red cannot, since it may not write source.

   - Every recorded mutation now fails the test → commit `test: <behavior>`, status `done`, next item. This is a real fix even
     though nothing went red first and coverage did not move.

   - Any mutation still passes → the test does not close the gap. Re-dispatch once, naming the mutation that survived it. Still
     surviving → status `blocked`, escalate.

   - `blocked` → status `blocked`, record the reason, **stop and escalate**.

`blocked` is not `redundant`. `redundant` means a test was written, passed, and moved no coverage — the behavior is already covered.
`blocked` means Red failed to do its job. Collapsing them would silently drop a spec item as "already covered" without verification.

### Green

1. Dispatch `tdd-green` with **only** Red's handover report. Do not paste test source — that is the whole point of the separation.
2. On return, audit as above against `globs.source`.
3. `outcome: stuck` → record the reason on the item, write the checklist, then stop and escalate with the agent's attempts.
4. Independently verify: run the configured single-test command against `testId` yourself. Do not take the agent's word for it.
   **Not passing → revert (see *Reverting a dispatch*), treat it as `stuck`, and escalate.** An agent reporting a pass the orchestrator
   cannot reproduce is worse than one reporting failure, and committing on its word would bury it.
5. **Run the full suite**, subtracting `knownRed`. Green only ever runs one test, so nothing else in the loop would notice it
   regressing a previously-passing test elsewhere — the next signal would be a Refactor dispatch that may never fire, or the mutation
   pass after every item is done. New failure → **revert** (see *Reverting a dispatch*), re-dispatch once naming the regressed tests.
   Still failing → stop and escalate.
6. **Coverage gate** (skip entirely if `commands.coverage` is null, or if the baseline reports zero total lines):
   - Run the coverage command. Compute new uncovered lines against the pre-dispatch baseline.
   - Within `coverageGates.greenMaxNewUncovered` → commit `green: <behavior>`, status `green`.
   - Over → **revert** (see *Reverting a dispatch*) and re-dispatch once, naming the specific uncovered file:line ranges and
     instructing Green to implement only what the test drives.
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
uncovered lines beyond `coverageGates.refactorMaxNewUncovered` (default 0) → **reset and clean** (see *Reverting a dispatch*),
scoped to `git diff --name-only` plus `git status --porcelain` run fresh at this point — the "Audit against `globs.source`" step
above has no defined violation consequence, so nothing has yet confirmed every touched path stayed inside `globs.source`, and
falling back to that glob here would carry the gap into the one site meant to catch it — and record `reverted`, regardless of
what the agent reported. New uncovered lines mean new behavior, and Refactor adding behavior is a boundary violation, not a
quality issue. There is no re-dispatch — reverting is the correct outcome.

Branch on all four outcomes:

- `improved` and the gate passed → commit `refactor: <behavior>`.
- `no-change-needed` → commit nothing, record it, continue. This is a good outcome, not a failure; the trigger fired and the agent
  judged there was nothing worth doing.
- `reverted` → record it and continue. A refactor that backed out cleanly is not a failed cycle.
- `blocked` → **stop and escalate.** Refactor reports `blocked` when it could not evaluate its own work — typically a suite that was
  already failing. That is a broken precondition, not a judgement call, and continuing past it means every later Refactor dispatch
  hits the same wall silently. This is the same rule as the Escalation section below; there is no Refactor exemption.

**On `reverted`, verify the tree rather than trusting the report.** Refactor restores by rewriting recorded text with
`Edit`/`Write`, not `git checkout`, so an imperfect restore is possible and the coverage gate would not catch one whose
uncovered-line count happened to match. Require `git status --porcelain` and `git diff HEAD` to both be empty; if either is not,
**reset and clean** (see *Reverting a dispatch*) yourself, scoped to whatever those two commands just reported, and record that
the agent's restore was incomplete.

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

**Restoring source is not enough — invalidate the language's compiled cache too.** `git status` will call the tree clean, because
caches are gitignored, while the interpreter still holds bytecode compiled from the *mutated* source. Observed on the first live
pass: after a kill verification the suite reported a failure whose traceback showed source that could not produce it, and clearing
`__pycache__` returned it to green. A false red is the lucky outcome; the same mechanism can serve a false green from a cache
compiled before a bad restore, and step 5 below is exactly where that would be believed.

For Python, prefix the configured commands with `PYTHONDONTWRITEBYTECODE=1` so no cache is written at all — verified to suppress
`__pycache__` and to still satisfy the guard's Bash allowlist. Other toolchains have their own caches; whatever the language, the
rule is that a restore is not complete until the cache is too.

4. On return, **verify the tree is clean**: `git status --porcelain` must be empty and `git diff HEAD` must be empty. Not clean →
   **reset and clean** (see *Reverting a dispatch*) scoped to whatever those two commands just reported, record it, and do not
   trust the report — an agent that failed to revert may also have failed to run the suite honestly between mutants.
5. Re-run the full suite, **subtracting `knownRed`**. Every test outside that list must pass. This is the last orchestrator-side
   suite check that did not subtract it, and leaving it flat would dead-end every mutation pass on any run where preflight recorded a
   non-empty `knownRed` — reproducing the exact failure the threading rule above was added to prevent.
6. **Group survivors by `missingBehavior` first**, then append one checklist item per distinct behavior. Several mutants routinely
   map to a single gap — the first live pass returned four survivors of which three were "nothing asserts divide's error message"
   (mutated to `None`, to an `XX`-wrapped string, and to upper case). One test closes all three, so queueing three Red cycles wastes
   two of them. Keep every mutant in the item's `mutant` field as evidence, and report the survivor count, not the item count.

   For each distinct behavior, append:

       { "id": <next>, "behavior": "<the survivor's missingBehavior>",
         "status": "pending", "origin": "mutation",
         "mutant": { "file": ..., "line": ...,
                     "mutations": [ ...every mutant that revealed this gap... ] } }

7. **Increment `mutationRoundsRun` in `checklist.json` and write the file — before the branch below, not after it.** This is the one
   piece of loop state nothing else reconstructs, and the survivor branch hands control back to the per-item loop without ever
   reaching a step written later, so it must be written first.
8. Branch on survivors and the count just written:
   - No survivors → done.
   - Survivors found, and `mutationRoundsRun` (read back from `checklist.json`, not from memory — on a resumed run your context has
     no record of passes already spent) has not yet reached `limits.mutationRounds` → report the survivor count and **resume the
     per-item loop**. The new items run as ordinary Red→Green cycles.
   - Survivors found, but `mutationRoundsRun` has reached `limits.mutationRounds` → done. Report the survivors found but not
     pursued, so the cap's cost is visible rather than silently swallowed.

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

Stop and return to the user on: a guardrail violation by the same agent beyond `limits.violationRetries` re-dispatches, Green stuck
after `limits.greenAttempts`, any `blocked` outcome, or a suite that goes red in a way Refactor did not cause. Do not loop. A stuck
agent is information the user needs, not a problem to grind on.
