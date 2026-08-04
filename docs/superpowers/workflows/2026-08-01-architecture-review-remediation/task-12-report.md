# Task 12 report: promote `e2e/` to an automated smoke test

## Scoping constraint, restated

A subagent cannot dispatch `tdd-*` subagents, so nothing that requires a live orchestrator reading `SKILL.md` and making a
judgement call could run from this task. Everything below is split honestly along that line: what runs headlessly and asserts on
real process/git output, versus what is scaffolded — built, verified to be internally correct, and documented for a human or
main-thread session to actually exercise.

## What was built

- **`e2e/smoke.mjs`** — the harness entry point. `node e2e/smoke.mjs` or `npm run smoke`. A bespoke `check(name, fn)` runner
  (no `node:test`) that counts pass/fail, prints one line per check, and exits non-zero on any failure **or on zero checks
  recorded** — the same "a green suite that ran nothing is not evidence" guard `run.sh` gives the unit suite.
- **`e2e/expected-outcome.json`** — the recorded expected outcome the brief asked for: the fixture's pytest count (7), the
  configured test command, and (as documentation only, not asserted against) the final `checklist.json` and the ordered commit
  subjects from the actual live run that produced `e2e/`'s current git history. That real `.tdd/checklist.json` exists on this
  machine (gitignored, not in the repo) — I copied it in verbatim rather than fabricating a golden state.
- **`e2e/lib/checklist-invariants.mjs`** — `checkResumePreserved(seed, result)`, the structural comparator for Task 6's resume
  invariant: terminal items (`done`/`redundant`/`blocked`) must survive with status and `testId` unchanged, no item's status may
  rank backward (`pending < red < green < done/redundant/blocked`), `knownRed` entries must not be dropped, `mutationRoundsRun`
  must not regress, and the item count must not shrink. Doubles as a CLI: `node e2e/lib/checklist-invariants.mjs <seed> <result>`.
- **`e2e/fixtures/checklist-resume-seed.json`** — a hand-authored, schema-faithful partial checklist representing an interrupted
  run: item 1 (`add`) terminal at `redundant`, item 2 (`subtract`) mid-cycle at `red` with a real `testId`, item 3 (`divide`)
  `pending`. `knownRed` carries one synthetic entry (`tests/test_known_flaky.py::test_pretend_baseline_failure` — does not
  correspond to a real file; it exists purely so the comparator's `knownRed`-preservation check has something to check).
- **`e2e/fixtures/prepare-resume-scratch.mjs`** — mechanical (non-LLM) setup for the live resume test: creates a detached `git
  worktree` at HEAD, rewrites its `e2e/src/calc/__init__.py` to implement only `add()`, deletes its `e2e/tests/test_divide.py`,
  commits that as the worktree's own clean baseline, and seeds `.tdd/checklist.json` from the resume-seed fixture. CLI
  (`node e2e/fixtures/prepare-resume-scratch.mjs`) prints the worktree path and the exact remaining steps; also exports
  `prepareResumeScratch()` for `smoke.mjs` to verify headlessly.
- **`package.json`**: added `"smoke": "node e2e/smoke.mjs"`. Did not touch `"test"`.
- **`AGENTS.md`**: extended "Running the plugin against itself" with the `npm run smoke` command and the five-step live-resume
  procedure (prepare scratch → `/tdd-init` if needed → live `/tdd e2e/spec.md` → compare with `checklist-invariants.mjs` →
  remove worktree).
- **`.tdd/config.json`** (local, gitignored, not committed): added the four new `e2e/` paths to `globs.ignore` so a live run
  against this checkout doesn't immediately fail Preflight's glob-exhaustiveness check on files this task added. This is a
  convenience edit only — a fresh `/tdd-init` on any other machine would classify them the same way on its own.

## Automated vs. scaffolded — explicit table

| Case | Automated (headless, `npm run smoke`) | Scaffolded for a live session |
|---|---|---|
| Fixture's recorded outcome (pytest count) | **Yes** — diffs a real pytest run's `"N passed"` against `e2e/expected-outcome.json` | — |
| Seeded regression fails, restore goes green | **Yes** — mutates `subtract()`, confirms the configured test command fails naming the right test, restores, confirms green, confirms `git status` on `e2e/src` is empty afterward | — |
| `git clean -fd` skips tracked paths in a mixed pathspec (a claim `SKILL.md` makes) | **Yes** — sandboxed git repo, asserted directly | — |
| Out-of-glob revert, **pre-Task-7 regression** (clean scoped to role's own glob leaves the rogue file) | **Yes** — sandboxed, asserts the rogue file survives | — |
| Out-of-glob revert, **post-Task-7 fix** (clean scoped to every audited path removes it) | **Yes** — sandboxed, asserts full restore, rogue gone, gitignored stand-in survives | — |
| Resume comparator's own correctness | **Yes** — bite-checked against a legitimate advance (must pass) and a fabricated full-Decompose-overwrite reconstruction plus two targeted regressions (`mutationRoundsRun` backward, non-terminal status backward) (must fail) | — |
| Resume scratch prep produces a valid, clean, genuinely-red interrupted state | **Yes** — `smoke.mjs` imports `prepareResumeScratch()` directly, inspects the worktree, runs pytest against it, tears it down | — |
| **An actual `/tdd e2e/spec.md` resume** against the prepared scratch, verifying `SKILL.md`'s `## Decompose` branch really loads rather than rewrites | No | **Yes** — `e2e/fixtures/prepare-resume-scratch.mjs` + the 5-step procedure in `AGENTS.md` |
| Comparing that real resume's resulting `checklist.json` against the seed | No (the comparator itself is automated; feeding it real live output is not) | **Yes** — `node e2e/lib/checklist-invariants.mjs <seed> <result>` |
| A full end-to-end `/tdd e2e/spec.md` first run, diffed against `expected-outcome.json`'s `finalChecklist`/`commitSubjects` | No | **Yes** — documented as the comparison target; requires a live orchestrator dispatching all four roles |

I did not find a way to make either live-session row headless without literally dispatching subagents, which is exactly what the
task brief rules out for a subagent. I did not claim either row as automated.

## Actual output

```
$ node --test 2>&1 | tail -8
1..227
# tests 307
# suites 0
# pass 306
# fail 0
# cancelled 0
# skipped 0
# todo 1
# duration_ms ~1530   (unit suite, unchanged from before this task)

$ npm run smoke
ok - e2e fixture: the pytest venv is present (provision e2e/.venv before running this)
ok - e2e fixture: recorded outcome — pytest reports exactly "7 passed"
ok - seeded regression: breaking subtract() fails the configured test command, restoring it goes green again
ok - SKILL.md's revert claim: `git clean -fd` given a mixed tracked+untracked pathspec skips the tracked entry silently and exits 0
ok - out-of-glob revert — PRE-TASK-7 REGRESSION: `clean` scoped to the role's own write glob cannot reach a rogue file outside it
ok - out-of-glob revert — POST-TASK-7 FIX: `clean` scoped to every path the audit found removes the rogue file and fully restores the tree
ok - resume comparator: a legitimately advanced checklist (loaded, not rebuilt) reports preserved
ok - resume comparator bite-check: an unconditional Decompose rewrite (the pre-Task-6 bug) is caught
ok - resume comparator bite-check: mutationRoundsRun regressing backward is caught even when every item field matches
ok - resume comparator bite-check: a non-terminal item sliding backward (red -> pending) is caught even with testId untouched
ok - resume scratch prep: prepare-resume-scratch.mjs produces a clean, genuinely-interrupted worktree

# smoke checks: 11
# pass: 11
# fail: 0
```

Exit codes: `node --test` → 0. `npm run smoke` → 0.

### Bite-checks (AGENTS.md: "a green suite is not evidence" — broke things on purpose)

1. **Neutered `checkResumePreserved` to always return `{ok: true, violations: []}`.** Re-ran `npm run smoke`:
   **CORRECTED (see "Fix round 1" below) — this originally reported `8 pass / 2 fail`, which was wrong.** The real, reproduced
   result is `8 pass / 3 fail`: every check whose assertion depends on the comparator reporting `ok: false` fails, and there are
   three of them, not two, because a third bite-check (the `red -> pending` regression) was added after this experiment was
   first run and the experiment was never re-run following that addition. Every other check, including the ones that don't
   touch the comparator, stayed green. Reverted, diffed against the original to confirm an exact restore, re-ran — back to
   11/11.
2. **Swapped the post-Task-7 revert check's pathspec back to the pre-fix scoping (`'src/**'` instead of the found paths).**
   Re-ran: exactly that one check failed (`rogue.py` and `tests/test_new.py` survived), reported `9 pass / 1 fail`, exit 1.
   Reverted, diffed to confirm exact restore, re-ran — back to 11/11.

Both confirm the checks have teeth rather than passing vacuously.

### CLI sanity checks (run directly, not through smoke.mjs)

```
$ node e2e/fixtures/prepare-resume-scratch.mjs
/var/folders/.../tdd-resume-scratch-XXXXXX
Scratch worktree ready. Next, in a live Claude Code session:
  1. cd /var/folders/.../tdd-resume-scratch-XXXXXX
  2. Confirm .tdd/config.json exists (run /tdd-init if not -- ...)
  3. Run: /tdd e2e/spec.md
  4. After it resumes and advances at least one item, compare: ...
  5. Remove the worktree when done: ...

$ node e2e/lib/checklist-invariants.mjs e2e/fixtures/checklist-resume-seed.json <that worktree>/.tdd/checklist.json
resume preserved: OK

$ node e2e/lib/checklist-invariants.mjs e2e/fixtures/checklist-resume-seed.json /tmp/bad-reconstruction.json
resume preserved: FAILED
  - knownRed dropped an entry a resume must preserve: "tests/test_known_flaky.py::test_pretend_baseline_failure"
  - item 1: status regressed from "redundant" to "pending"
  - item 1: terminal status "redundant" was overwritten with "pending"
  - item 2: status regressed from "red" to "pending"
  - item 2: testId "tests/test_subtract.py::test_subtract_returns_difference" was cleared (result has no testId)
```

Worktree and temp files removed after; `git worktree list` shows only the main worktree; `git status --porcelain` shows only the
files this task intends to commit.

## How a human invokes the scaffolded parts

See `AGENTS.md`'s "Running the plugin against itself" section — reproduced in summary:

1. `node e2e/fixtures/prepare-resume-scratch.mjs` → prints a scratch worktree path.
2. `cd` there; run `/tdd-init` if `.tdd/config.json` is missing (it always will be — gitignored, fresh worktree).
3. In a **live Claude Code session** with that worktree as the project: `/tdd e2e/spec.md`. Watch for: no fresh decomposition
   prompt, resumption starting at item 2 (not item 1).
4. `node e2e/lib/checklist-invariants.mjs e2e/fixtures/checklist-resume-seed.json <worktree>/.tdd/checklist.json`.
5. `git worktree remove --force <worktree>`.

For the full first-run comparison (`expected-outcome.json`'s `finalChecklist`/`commitSubjects`): run `/tdd-init` then
`/tdd e2e/spec.md` against a fresh checkout with `e2e/src/calc/__init__.py` reset to empty, and compare the resulting
`.tdd/checklist.json` and `git log -- e2e/` commit subjects against `e2e/expected-outcome.json` by eye — deliberately not
scripted, per the note in that file: an exact `git log` diff would break on any future legitimate commit touching `e2e/`.

## Files changed

- `e2e/smoke.mjs` (new)
- `e2e/lib/checklist-invariants.mjs` (new)
- `e2e/fixtures/checklist-resume-seed.json` (new)
- `e2e/fixtures/prepare-resume-scratch.mjs` (new)
- `e2e/expected-outcome.json` (new)
- `package.json` (added `smoke` script)
- `AGENTS.md` (documented command + live-resume procedure)
- `.tdd/config.json` (local only, gitignored, not committed — added new `e2e/` paths to `globs.ignore`)

## Post-commit fixes (found on independent review)

A second pass (advisor with full transcript access) found two real issues in the first committed version, both fixed in a
follow-up commit before this report's final state:

1. **`prepareResumeScratch()`'s `cleanup()` called `git worktree prune` against the real repository, unconditionally, every
   `npm run smoke` run.** `remove --force` already deregisters the one worktree this script created; `prune` additionally sweeps
   *every* worktree entry whose directory is currently unreachable — including a developer's own unrelated worktree if its
   volume happens to be unmounted at that moment. Every other sandboxed operation in this task runs inside `mkdtemp` or a
   throwaway git-init; this was the one path that reached into the real repo's `.git` beyond what it created. Fixed by dropping
   the `prune` call entirely — `remove --force` is sufficient. Verified by creating an independent second worktree, running
   `npm run smoke`, and confirming `git worktree list` still shows it afterward (see below).
2. **The seeded-regression check's restore lived only in a `finally` block.** That covers a thrown assertion but not a kill
   signal or a crash between mutating `e2e/src/calc/__init__.py` and reaching `finally` — and this is the one check in the
   suite that mutates real tracked source. Added a synchronous restore registered against `process.once('exit', ...)` and
   `SIGINT`/`SIGTERM`, removed again once the `finally` path completes normally.

Also added a comment on `foundPaths()` in `e2e/smoke.mjs` noting its `git status --porcelain` parser only handles the plain
modified/untracked shapes the sandbox produces — not renames or quoted paths — so a future reader does not mistake it for a
general-purpose porcelain parser.

Verification after the fixes:

```
$ OTHER=$(mktemp -d) && git worktree add --detach --quiet "$OTHER" HEAD
$ git worktree list        # 2 entries: main repo + $OTHER
$ node e2e/smoke.mjs        # 11 pass, 0 fail
$ git worktree list        # still 2 entries -- $OTHER survived cleanup() unharmed
$ git -C "$OTHER" status --porcelain && echo "OK, other worktree intact"
OK, other worktree intact
$ git worktree remove --force "$OTHER"   # manual teardown of the verification's own worktree
```

`node --test`: still 307 tests / 306 pass / 0 fail / 1 todo. `npm run smoke`: still 11/11.

## Self-review findings

- **Found and fixed during self-review, before commit:** the first version of `checkResumePreserved` only caught a non-terminal
  item's status regressing backward *indirectly*, via its `testId` being cleared. A reconstruction that happened to preserve
  `testId` while resetting `status` from `red` to `pending` would have slipped through. Added an explicit monotonic status-rank
  check (`pending < red < green < done/redundant/blocked`) and a dedicated bite-check for exactly that case
  (`red -> pending` with `testId` untouched). Verified the fix with the bite-check before moving on.
- **Considered and rejected:** asserting `git log`'s actual commit subjects for `e2e/` against `expected-outcome.json`. Any
  legitimate future commit touching `e2e/` (including this task's own, since it adds files under `e2e/`) would break an
  exact-match assertion for a reason unrelated to a regression. Recorded the subjects as documentation instead, per the advisor's
  and the brief's own caution about over-asserting on things that will legitimately drift.
- **Considered and rejected:** trying to make the live-resume case "automated" by having a subagent simulate what an orchestrator
  would do (hand-editing files and commits to mimic Red/Green output) without ever dispatching `tdd-*` subagents. That would not
  exercise `SKILL.md`'s actual branch logic — it would only prove my own script does what I already know it does. Declined, per
  the task's explicit instruction not to fake the live-dispatch requirement.
- All new files pass `node --test` non-interference (confirmed empirically that `node --test`'s default discovery only matches
  `*.test.mjs`/`*-test.mjs`/`test-*.mjs`/`test.mjs` by filename, not files inside a directory named `test`/`tests` for `.mjs`
  — verified in a scratch sandbox before naming anything, so `e2e/smoke.mjs` and `e2e/lib/checklist-invariants.mjs` were never
  at risk of being swept into the unit suite).
- Every sandboxed git operation in `smoke.mjs` and `prepare-resume-scratch.mjs` runs inside a fresh `mkdtemp` directory or a
  detached worktree, never against this repository's own tracked tree — `git reset --hard` never touches anything outside a
  disposable sandbox.

## Concerns

- The live-resume procedure has not actually been run end to end in a live session (by design — I cannot). The scaffolding is
  verified as internally consistent (produces the right files, right git state, right red/green split) but the real value —
  confirming `SKILL.md`'s `## Decompose` branch resumes correctly — is unverified until someone runs steps 3–4 of the documented
  procedure.
- `e2e/expected-outcome.json`'s `finalChecklist` and `commitSubjects` are transcribed by hand from the real `.tdd/checklist.json`
  on this machine and from `git log`. I did not find an automated way to validate the transcription is byte-exact beyond careful
  reading; a typo there would only mislead a human doing the eyeball comparison, not break `npm run smoke` (which does not read
  that field).
- The resume-seed fixture's `knownRed` entry is synthetic (no matching file exists anywhere). This is intentional — it exists so
  the comparator's `knownRed`-preservation check has something to check with a realistic-shaped calc-project fixture — but it
  means the fixture is not a literal snapshot of a real interrupted run the way `expected-outcome.json`'s `finalChecklist` is.
  Documented in this report and in the file's own header comments.

## Fix round 1 (independent review: "Needs fixes")

Credited by the reviewer as correct before this round: every git-mutating operation in the out-of-glob section is genuinely
sandboxed, the `worktree prune` and finally-only-restore teardown bugs were already fixed, and `checkResumePreserved`'s
structural checks (monotonic status rank, exact terminal-status match, `knownRed` superset, per-item lookup) held up under
independent reproduction of the pathspec bite-check.

Three Important findings, one Minor, all fixed:

### 1. Important — bite-check numbers did not reproduce (corrected above)

The neutering bite-check's reported `8 pass / 2 fail` was wrong; the true, reproduced result is **`8 pass / 3 fail`**. Cause: a
third resume-comparator bite-check (`red -> pending` regression, `checkResumePreserved` call at what is now `e2e/smoke.mjs:319`)
was added *after* the neutering experiment was first run, and the experiment was never re-run following that addition — only
`node --test` and the normal `npm run smoke` pass were re-run, which don't exercise the neutered path. Re-ran the exact
experiment against the current code:

```
$ cp e2e/lib/checklist-invariants.mjs /tmp/checklist-invariants.mjs.bak
$ python3 -c "... replace checkResumePreserved's body with 'return { ok: true, violations: [] };' ..."
$ node e2e/smoke.mjs
ok - ... (7 unrelated checks)
ok - resume comparator: a legitimately advanced checklist (loaded, not rebuilt) reports preserved
FAIL - resume comparator bite-check: an unconditional Decompose rewrite (the pre-Task-6 bug) is caught
FAIL - resume comparator bite-check: mutationRoundsRun regressing backward is caught even when every item field matches
FAIL - resume comparator bite-check: a non-terminal item sliding backward (red -> pending) is caught even with testId untouched
ok - resume scratch prep: ...
# smoke checks: 11
# pass: 8
# fail: 3
$ cp /tmp/checklist-invariants.mjs.bak e2e/lib/checklist-invariants.mjs
$ diff /tmp/checklist-invariants.mjs.bak e2e/lib/checklist-invariants.mjs && echo "restore verified identical"
restore verified identical
```

Exactly the three checks whose assertion is `verdict.ok === false` failed; the one that asserts `verdict.ok === true` (a
legitimate advance) correctly stayed green, since a comparator that always says "ok" also satisfies that check by accident —
which is precisely why the *other* three checks are the ones doing the real work. Corrected the number in "Bite-checks" above
rather than only here, so the report's main body is not left contradicting its own appendix.

### 2. Important — `prepareResumeScratch()` leaked real repo state on any setup failure

`git worktree add` (then at line 50) registers a worktree in the real repository's `.git/worktrees/` — state outside any
sandbox, unlike every other git-mutating path in this task. `cleanup` was constructed *after* all the fallible setup
(`writeFileSync`, `rmSync`, `git add`/`commit`, `mkdirSync`, `copyFileSync`), so a throw anywhere in that stretch propagated out
of `prepareResumeScratch()` before `cleanup` was ever built or returned — and `e2e/smoke.mjs`'s caller destructures `{ cleanup }`
before its own `try`, so on that path nothing runs `cleanup` at all. The leaked worktree entry does not appear in
`git status --short`, only in `git worktree list`, so it would accumulate silently across repeated failed runs.

Fixed by restructuring `prepareResumeScratch()`: `cleanup` is now built immediately after `git worktree add` succeeds, before
any of the fallible mutation steps run, and everything from the source rewrite through the `.tdd/checklist.json` seed is now
inside a `try { ... } catch (err) { cleanup(); throw err; }` — so any failure in that stretch tears down the worktree before
the error propagates.

**Demonstrated, not merely asserted**, per the review's explicit requirement — a temporary `throw` was injected as the first
statement inside the `try` block (same edit-run-revert-diff pattern already used for this task's other bite-checks):

```
$ git worktree list                                    # before
/Users/kbluck/Claude/code/claude-tdd  2a3a566 [feat/03-rewrite-hooks-node]

$ node --input-type=module -e "
    import { prepareResumeScratch } from './e2e/fixtures/prepare-resume-scratch.mjs';
    try { prepareResumeScratch(); console.log('BUG: did not throw'); }
    catch (err) { console.log('caught expected error: ' + err.message); }
  "
caught expected error: DELIBERATE TEST FAILURE -- injected to demonstrate cleanup on setup failure

$ git worktree list                                    # after -- no stray entry
/Users/kbluck/Claude/code/claude-tdd  2a3a566 [feat/03-rewrite-hooks-node]

$ git status --porcelain                                # clean aside from the two files this fix touches
 M e2e/fixtures/prepare-resume-scratch.mjs
 M e2e/smoke.mjs
```

Reverted the injected throw, diffed against the pre-injection backup to confirm an exact restore.

### 3. Important — two checks passed vacuously when the process never ran

`assert.notEqual(result.status, 0, ...)` at the seeded-regression check and the resume-scratch-prep check both meant "the
process ran and exited non-zero", but `spawnSync` returns `status: null` when the executable cannot be spawned at all or was
killed by a signal, and `null !== 0` is true — so a spawn that never happened reported `ok` identically to a real failure.
Today the venv-presence check (`fs.existsSync(PYTEST)`) fails first and masks it in this file's actual execution order, which
is luck, not a guarantee each check verifies what its own name claims.

Added `assertRanAndFailed(result, message)` in `e2e/smoke.mjs`: asserts `result.error` is `undefined`, asserts
`typeof result.status === 'number'`, then asserts `status !== 0`. Both call sites now go through it. Demonstrated the
distinction directly (not through the masking venv check):

```
$ node --input-type=module -e "
    import { spawnSync } from 'node:child_process';
    import assert from 'node:assert/strict';
    const bad = spawnSync('/no/such/executable-xyz', ['--nope'], { encoding: 'utf8' });
    // old pattern
    try { assert.notEqual(bad.status, 0, 'x'); console.log('OLD PATTERN: incorrectly passed for a process that never ran'); }
    catch { console.log('OLD PATTERN: correctly failed (unexpected)'); }
    // new pattern
    function assertRanAndFailed(r, m) {
      assert.equal(r.error, undefined, 'spawn failed: ' + r.error);
      assert.equal(typeof r.status, 'number', 'no numeric exit status');
      assert.notEqual(r.status, 0, m);
    }
    try { assertRanAndFailed(bad, 'y'); console.log('NEW PATTERN: incorrectly passed (BUG)'); }
    catch (err) { console.log('NEW PATTERN: correctly failed -- ' + err.message); }
  "
OLD PATTERN: incorrectly passed (null !== 0) for a process that never ran
NEW PATTERN: correctly failed -- process failed to spawn: Error: spawnSync /no/such/executable-xyz ENOENT
```

### 4. Minor — `git add -A` in the scratch worktree

Replaced with the two explicit paths the setup step actually touches (`e2e/src/calc/__init__.py`,
`e2e/tests/test_divide.py`). Verified separately that `git add <explicit-path>` correctly stages a deletion of a tracked file
(not only additions/modifications) in an isolated sandbox, since the divide-test removal depends on that:

```
$ git status --porcelain   # after `rm a/gone.py; git add a/keep.py a/gone.py`
D  a/gone.py
M  a/keep.py
```

### Verification after all four fixes

```
$ node --test 2>&1 | tail -8
# tests 307
# pass 306
# fail 0
# todo 1
# duration_ms ~1500   (unchanged)

$ node e2e/smoke.mjs
... 11 ok lines ...
# smoke checks: 11
# pass: 11
# fail: 0

$ git status --porcelain
 M e2e/fixtures/prepare-resume-scratch.mjs
 M e2e/smoke.mjs

$ git worktree list
/Users/kbluck/Claude/code/claude-tdd  2a3a566 [feat/03-rewrite-hooks-node]
```

`node --test` stayed at 0 failures with no runtime change. `npm run smoke` stayed green. `git status --short` shows only the
two files this round touched (no stray artifacts). `git worktree list` shows no stray entries, both in normal operation and
after the deliberately-failed-setup demonstration above.
