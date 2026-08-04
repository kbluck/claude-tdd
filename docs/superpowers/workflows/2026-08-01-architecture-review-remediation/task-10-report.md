# Task 10 report: config-committed contradiction and the missing-config test

## Headline finding: part 2 was already done, ahead of schedule, by Task 3

Before writing anything, I read `tests/guard.test.mjs` to follow the existing sandbox pattern the
brief pointed at (item 4), and found the exact test already present and passing:

```
guard: an EMPTY sandbox (.tdd/config.json absent entirely) produces exit 2 with a message
naming /tdd-init, for a constrained role
```

`git log -p --follow -- tests/guard.test.mjs` traces this back to commit `932e07a`
("feat(hook): port the guard and decision rules to node", Task 3). That commit promoted **all
20** `test.todo()` placeholders in the file to real tests in one pass — including one whose
placeholder title was literally:

```
test.todo('guard: config-contract Task 10 — an EMPTY sandbox (.tdd/config.json absent entirely,
not just malformed) produces exit 2 with a message naming /tdd-init, for a constrained role');
```

i.e. a todo explicitly reserved for this task. Task 3's own report (`task-3-report.md:7`)
confirms the blanket promotion: "Promoted all 20 `test.todo()` entries in `tests/guard.test.mjs`
to real subprocess tests." This was scope creep relative to Task 3's brief, and it landed the
Task 10 assertion three tasks early with no corresponding update to the plan's task ledger — the
plan still listed it as outstanding.

**I verified the pre-existing test is genuinely load-bearing, not vacuous**, with two bite-checks
against `hooks/guard.mjs`'s config-load `catch` block (both reverted after; `git status` clean
before and after):

- **Bite-check A** — stripped `/tdd-init` from the deny message text, kept the deny/exit-2
  behaviour. Ran `node --test tests/guard.test.mjs`. Exactly one failure:
  `not ok 15 - guard: an EMPTY sandbox (.tdd/config.json absent entirely) produces exit 2 with a
  message naming /tdd-init, for a constrained role`. All 22 other guard tests stayed green. This
  confirms the test discriminates on message content (task item 5: "assert which rule fired"),
  not just exit code — no other deny path in the guard contains the string `/tdd-init`.
- **Bite-check B** — made the whole `catch` block fail open (`return;` instead of `deny(...)`).
  Ran the same file. Three failures: `not ok 14` (missing-config-file test), `not ok 15` (the
  empty-sandbox test), `not ok 16` (degenerate on-disk shapes test). Confirms the exit-2
  assertion is real and not satisfied by coincidence.

Given this, I did **not** add a second assertion of the same property — per the advisor, a
duplicate assertion here would dilute what a future failure of either one means, and would not
close any actual gap. I instead put the new test-file change where a gap genuinely existed: part
1.

## What I changed

### 1. `commands/tdd-init.md` — Step 8 self-verification (commit `21fdd4d`, `fix(command)`)

Added a paragraph after the existing commit instructions. After `git commit`, the step now
instructs the agent to run `git ls-files .tdd/config.json` and treat empty output as a failure:
`git add` on a gitignored path is a silent no-op without `-f`, so the commit's exit code alone
does not prove the file is tracked. The added prose tells the agent to investigate with
`git check-ignore -v .tdd/config.json` and ask the user before forcing the add — consistent with
the rest of the document's "stop and ask, don't decide for the user" pattern (e.g. the
partition-check and glob-overlap sections above it).

### 2. `tests/config-contract.test.mjs` — pin the Step 8 verification (commit `0e352b9`, `test(command)`)

Added three tests, following the file's existing `extractLineRange`-scoped pattern used for the
Step 7 JSON block (so the assertion checks the Step 8 block specifically, not the whole file —
"git" and "commit" both appear elsewhere in the document's prose, e.g. step 1's git-repo
prerequisite and step 9's closing summary, so an unscoped match would pass even with the
verification missing):

- `tdd-init.md: the Step 8 (Commit) block was located at all (start anchor holds)` — start-anchor
  sanity check.
- `tdd-init.md: the extracted Step 8 block stops before step 9 (end anchor still matches)` —
  end-anchor sanity check (guards against the range silently running to EOF and sweeping in step
  9's prose).
- `tdd-init.md: Step 8 verifies its own commit landed via \`git ls-files .tdd/config.json\`` — the
  actual assertion: the Step 8 block must contain the literal string
  `git ls-files .tdd/config.json`.

## Bite-check on the new assertion

Reverted only the Step 8 prose addition (kept the test file as committed), ran
`node --test tests/config-contract.test.mjs`, captured failing-test identity, then restored and
re-ran to confirm green.

**Before (verification prose reverted):**
```
not ok 53 - tdd-init.md: Step 8 verifies its own commit landed via `git ls-files .tdd/config.json`
```
Exactly one failure, out of 85 tests in that file. The two anchor-sanity tests (51, 52) stayed
green, confirming the failure is specifically the content assertion and not a scoping collapse.

**After (restored):**
```
# tests 304
# pass 303
# fail 0
# todo 1
```
Full suite green.

## Files changed

- `commands/tdd-init.md` (commit `21fdd4d`)
- `tests/config-contract.test.mjs` (commit `0e352b9`)

No other files touched. Confirmed with `git status --porcelain` before/after each commit and
`git diff --stat` on each commit individually (shown above).

## Self-review

- Re-read both diffs in full (`git show` on both commits) with fresh eyes after committing.
- Confirmed the spec's already-committed text (line 588) names the exact same check
  (`git ls-files .tdd/config.json`) I anchored the new test on, so the test pins something the
  spec already promises rather than inventing a new contract.
- Confirmed I did not touch the spec, `AGENTS.md`, `hooks/guard.mjs`, or `hooks/lib/rules.mjs` —
  all were already correct for this task per the brief, and I left them alone.
- Confirmed the working tree returned to exactly this task's two commits after every bite-check
  mutation (`git status --porcelain` empty, `git diff --stat` empty before each commit).
- Did not run `tests/run.sh` — it no longer exists; the suite runner is `node --test` (or
  `npm test`) since the Task 3 bash-to-node port. `npm run typecheck` could not run
  (`tsc: command not found` — `node_modules` is not installed in this environment); I did not
  touch any `.mjs` source under `hooks/`, only a `.md` prompt file and a `.test.mjs` file using
  patterns already established elsewhere in the same file, so I judge the risk of a type
  regression from this change to be very low, but I could not mechanically confirm it.

## Concerns

- **Ledger drift, not a defect in this task's own work.** The plan's task list treated Task 10's
  test half as outstanding when it had already landed three tasks earlier. This is worth flagging
  for whoever tracks the plan: if one task's implementer over-delivers relative to its own brief,
  later tasks in the ledger can silently already be partly (or, as here, almost entirely)
  satisfied, and nothing catches that except reading the actual test file before writing a new
  one. It is plausible other pending tasks (11-14) have similar partial overlap with work already
  done; I did not check those, since it was out of scope for this task.
- `npm run typecheck` did not run in this environment (missing `node_modules`). Recommend running
  it in CI or a fuller dev environment before merging, though my changes do not touch typed
  source.
