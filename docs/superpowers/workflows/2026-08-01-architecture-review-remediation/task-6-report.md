# Task 6 Report — Fix the resume branch and the mutation round counter

## Status: DONE (round 2 of 2 fix rounds against the round-1 carve-out applied)

All three defects fixed in `skills/run-tdd-cycle/SKILL.md` only: I1 (resume clobbers the checklist), I2 (mutation round
counter ordering), and a third defect the I1 fix made reachable (resume preflight could permanently baseline an
in-progress test as `knownRed`), fixed at the coordinator's direction after review. A second review round found the
round-1 carve-out itself had two defects (unanchored `git log --grep` attribution, and a self-contradicting check
order) plus one narrow adjacent gap (a silent approval-skip window); all three are fixed below. Test suite failing set
is exactly the two known Task-8 `singleTerse` items, unchanged across every edit in both rounds. Two adjacent findings
(concerns 2 and 3 below) remain deliberately deferred to the ledger per the coordinator's round-1 instruction — both
pre-existing and neither made reachable by this task.

## What changed

### 1. Resume branch (I1)

**Before** — `## Decompose` was unconditional:

```
## Decompose

Read the spec once. Write `.tdd/checklist.json`:

    { ... }
...
`status`: `pending` → `red` → `green` → `done`, or terminating at `redundant` or `blocked`. Write the file after every transition.
An interrupted run resumes from this file, not from your context.
```

Nothing checked whether the checklist already existed. A fresh orchestrator re-invoked on an interrupted run would hit this
section first and overwrite the file it was supposedly resuming from — discarding every item's `status`, `knownRed`,
`mutationRoundsRun`, and any recorded `baselines`. The final sentence asserted resume worked while the section above it
guaranteed it didn't.

**After** — added a branch at the top of the section, before the write:

```
**Decompose runs only when the checklist is absent.** Before doing anything else, check whether `.tdd/checklist.json`
exists and has items:

- **Absent, or present with no items** → this is a first run. Continue below.
- **Present with items** → this is a resume, not a first run. Load the file exactly as written — every field, including any this
  section does not itself populate (`baselines`, for instance, is written by the coverage-gate machinery elsewhere in this file, not
  here) — rather than reconstructing only the fields below. Do not write a new checklist: doing so is exactly what discarded every
  item's `status`, `knownRed`, `mutationRoundsRun`, and the baselines before this branch existed. Re-surface every item with status
  `blocked` and ask the user before continuing (see *Completion*), then resume the per-item loop from the first item whose status is
  not terminal — `pending`, `red`, and `green` are not terminal; `done`, `redundant`, and `blocked` are. Skip the approval step below;
  it is for a new decomposition, not a continued one.

Read the spec once. Write `.tdd/checklist.json`:
```

and reworded the closing sentence so it points at the mechanism instead of merely asserting it:

```
An interrupted run resumes from this file, not from your context — the branch at the top of this section is exactly how.
```

This matches the spec (`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:223`): "Decompose runs only when
the checklist is absent... If `.tdd/checklist.json` exists and has items, this is a resume: load it, re-surface any
`blocked` items, and continue from the first non-terminal item." I deliberately worded the "load it" instruction as
"load the file exactly as written... rather than reconstructing only the fields below" so the branch does not assume the
schema is closed — `baselines` (Task 13/S5b's field, not yet written by anything in this file) survives a resume for free
because nothing here reconstructs the file field-by-field.

### 2. Mutation round counter (I2)

**Before** — the increment was a step written after both terminal branches:

```
7. Survivors found → report the count and **resume the per-item loop**. The new items run as ordinary Red→Green cycles.
8. No survivors, or `mutationRoundsRun` (read from `checklist.json`) has reached `limits.mutationRounds` → done. Read the count from
   the file, not from memory of this session — on a resumed run your context has no record of passes already spent.

9. Increment `mutationRoundsRun` in `checklist.json` and write the file.

That increment is a numbered step rather than trailing advice because it is the one piece of loop state nothing else reconstructs.
```

Step 7 (survivors found) hands control back to the per-item loop — a fresh Red dispatch for the new mutation-origin
items — before the orchestrator's reading ever reaches step 9. So the increment fired reliably only via step 8's
no-survivor path, which ends the run anyway. `limits.mutationRounds` exists to bound repeated survivor-producing passes,
and that was exactly the path where the counter never advanced.

**After** — increment moved before the branch, and the two old branches merged into one three-way decision that now also
covers "survivors found but budget exhausted" explicitly (the old text left that combination ambiguous between its two
sequential-looking bullets):

```
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
```

Matches the spec (`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:272`): "Increment first, write the
file, then branch on survivors and remaining budget." I trimmed the old trailing-advice justification sentence rather
than keep defending the old placement — the task brief called this out explicitly ("remove the ordering that invites it
rather than adding more prose defending it") — and folded the one clause worth keeping (why it must be a numbered step,
not trailing advice) into the new step 7 for the correct reason: it has to run first, not that it merely deserves its
own line.

## Traces

### Trace A — resume vs. first run, walked from Preflight

Both paths run Preflight items 1–7 identically (clean tree, config present, suite check, spec readable, glob partition,
Node floor, guard probe) — none of that changed and Task 6 does not touch it.

Both paths then reach `## Decompose` and evaluate the new opening check: does `.tdd/checklist.json` exist and have items?

- **First run.** File absent. → "Continue below." The orchestrator reads the spec once, writes a fresh
  `.tdd/checklist.json` with `mutationRoundsRun: 0` and every item `pending`, presents it for approval, and dispatches
  Red for item 1.

- **Resume, hand-authored partial checklist** (e.g. item 1 `done`, item 2 `red` — Red committed a failing test and the
  session was interrupted before Green ran — item 3 `blocked`, `knownRed: ["test_x"]`, `mutationRoundsRun: 1`,
  `baselines: {...}`). File present with items. → "this is a resume... Load the file exactly as written... Do not write
  a new checklist." The orchestrator does **not** execute the "Read the spec once. Write `.tdd/checklist.json`" block at
  all — it is skipped entirely, so `knownRed`, `mutationRoundsRun`, and `baselines` are untouched on disk. It re-surfaces
  item 3 (`blocked`) to the user and asks before continuing, then resumes the per-item loop at the first non-terminal
  item — item 2, status `red` (item 1 is `done`, terminal; item 3 is `blocked`, terminal for loop-traversal purposes
  though re-surfaced). Because item 2 is already `red`, the existing "Per item / Red" branch language ("`failing` →
  commit... continue to Green") means the orchestrator's next action is a Green dispatch for item 2, not a fresh Red
  dispatch — the state machine encoded by `status` values already tells it where to re-enter without any new logic
  needed for that part.

**Divergence point:** exactly at the top of `## Decompose`, on the existence check. Before this fix, both paths fell
through to the same unconditional write and collided. After it, only the first-run path reaches the write; the resume
path branches away from it entirely before any file I/O happens.

### Trace B — mutation survivor path, counter increment

Walking the mutation pass with survivors present, starting from a checklist where `mutationRoundsRun: 2` and
`limits.mutationRounds: 3`:

1–5. (ranking, clean-tree check, dispatch, post-dispatch clean-tree check, full suite re-run) — unchanged, not part of
this fix.
6. Survivors grouped by `missingBehavior`; new `origin: "mutation"` items appended to the in-memory checklist.
7. **(new placement)** Increment `mutationRoundsRun` from `2` to `3` and write `checklist.json` to disk — this happens
   unconditionally, before any branching, so it executes on this pass regardless of what step 8 will decide.
8. Branch: survivors were found (by construction of this trace) and `mutationRoundsRun` is now `3`, which **has** reached
   `limits.mutationRounds: 3` → **done**, reporting the survivors found but not pursued.

Contrast with a pass where `mutationRoundsRun` starts at `0` (budget of `3`): step 7 still fires unconditionally, writing
`1`. Step 8: survivors found, `1 < 3` → report count, **resume the per-item loop**, dispatching Red for the new items.
The next time the checklist empties and this pass runs again, step 7 fires again and writes `2`, and so on — the counter
now advances on every survivor-producing pass, not just the one that happens to find nothing.

**What the old text did on this exact walk:** step "7" (old numbering, survivors found → resume the per-item loop) fired
first and returned control to Red dispatch for the new items — the orchestrator's reading of the file effectively exits
the Mutation pass section at that point, in the same sense that a `return` exits a function before later statements run.
Old step "9" (the increment, written after both branches) was never reached on this walk. The cap only ever advanced via
the sibling no-survivor branch, which ends the run anyway — so `limits.mutationRounds` never actually bounded anything on
repeated survivor passes. The reordering removes that gap by making the increment the earlier, unconditional step.

## Files changed

- `skills/run-tdd-cycle/SKILL.md` — the only file touched, per the task's constraint. `git show --stat` confirms.

## Verification

```
node --test
# tests 297
# pass 294
# fail 2
# cancelled 0
# skipped 0
```

The two failures are exactly:
- `drift check: every key the spec declares also appears in tests/fixtures/config.json` (missing `singleTerse`)
- `drift check: every key the spec declares also appears in the tdd-init.md Step 7 template` (missing `singleTerse`)

Both are the known-red baseline owned by Task 8 (`commands.singleTerse` not yet added anywhere, correctly not added by
this task). No other failures. No test exercises `SKILL.md` prose directly — this file is prompt-only, and per the task
brief, the two traces above are the verification evidence.

## Self-review findings

I ran the changed text past a fresh-eyes advisor pass. Two things came back; I evaluated both against the spec before
deciding whether to act:

1. **Preflight item 3 (`knownRed`) has an unguarded interaction with resume, but it is not this task's defect.**
   Preflight step 3 says: "If red, list the failing test IDs, ask the user whether to proceed, and if so record them in
   `checklist.json` as `knownRed`." Preflight runs before `## Decompose`, on every invocation including a resume. If a
   resumed run's current item has status `red` (a Red dispatch committed a failing test and the session was interrupted
   before Green ran), the suite is *legitimately* red at that exact point — but preflight step 3 has no branch for "this
   red test belongs to an in-progress item, not a baseline to record." Recording it as `knownRed` would permanently
   exclude the in-progress item's own test from every later suite comparison, which is wrong.

   I checked whether this is in scope: it is not. The task brief scopes this task to I1 (resume/Decompose) and I2 (the
   mutation counter) specifically, and the spec (`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:193`)
   has the *identical* gap — "If red, record the failing test IDs in `checklist.json` as `knownRed`" with no resume
   carve-out. Since the spec is my reference and I was told not to edit it, and this isn't one of the two defects I was
   asked to fix, I left preflight untouched rather than inventing behavior the spec doesn't back. Flagging it here as a
   concern for routing — it fits naturally alongside Task 13's "remaining consistency items" list (I4/I5/I7/I8/I11/S6/
   S5b), or the spec should pick it up first since SKILL.md is supposed to track the spec, not lead it.

2. **What happens after "ask the user" on a re-surfaced `blocked` item is unspecified — but this is pre-existing, not
   introduced by this change.** My resume bullet says "re-surface every item with status `blocked` and ask the user
   before continuing," pointing at *Completion*. The existing *Completion* section (untouched by this task, present
   before my edit) has the same level of detail: "On resume, re-surface every `blocked` item and ask the user before
   continuing" — neither the existing text nor the spec (`...design.md:223`, same phrasing: "re-surface any `blocked`
   items, and continue from the first non-terminal item") specifies whether a "continue anyway" answer flips the item
   back to `pending` for a retry or the run proceeds around it some other way. I matched the spec's precision level
   rather than inventing a resolution it doesn't state. Worth closing in whichever task handles blocked-item semantics
   more broadly (not identified as one of I1/I2, and not clearly Task 13's either — may need a note in Task 14's
   decision log or a new item).

3. **Minor, not acted on:** the increment is now unconditional, so a pass with `mutantsAttempted: 0` (called out two
   paragraphs below step 8 as "unable to run") still consumes one unit of `mutationRoundsRun`. It self-terminates via the
   no-survivors branch on the same pass, so it doesn't loop or hide anything — advisor input was explicitly not to
   restructure for this, and I agree it's out of scope for I1/I2.

## Concerns

- No automated test exercises any of these three fixes (expected — Task 12 owns the e2e resume case). The traces in this
  report are the only verification available for this task, as instructed.
- Concerns 2 (unspecified "continue anyway" resolution for a re-surfaced `blocked` item) and 3 (`mutantsAttempted: 0`
  consuming a round) remain open per the coordinator's explicit instruction to defer them to the ledger — both are
  genuinely pre-existing and neither was made reachable by this task's changes.

## Addendum — concern 1 fixed (coordinator-directed)

The coordinator reviewed this report and determined concern 1 (`knownRed` vs. resume) was in scope after all:
**my own resume branch is what made the interaction reachable.** Before this task's change, `## Decompose` ran
unconditionally, so no resume path existed for Preflight step 3 to interact with — the latent defect in step 3's
unconditional `knownRed` recording had no way to fire. Once the resume branch exists, a resumed run with a
currently-`red` item hits step 3 first, finds the suite legitimately red (Red's own committed-but-unfixed test), and
had no carve-out — it would ask the user and record that in-progress test as `knownRed`, permanently excluding it from
every later comparison without anything ever verifying it went green. A latent defect a change turns live belongs to
that change, so I fixed it in the same file.

### Before → after (Preflight step 3)

**Before:**

```
3. **The full suite passes.** Run the configured test command. Green's stop condition is "this test now passes" and Refactor's is
   "all tests still pass" — both are meaningless against an already-red suite. If red, list the failing test IDs, ask the user whether
   to proceed, and if so record them in `checklist.json` as `knownRed`.
```

**After:**

```
3. **The full suite passes.** Run the configured test command. Green's stop condition is "this test now passes" and Refactor's is
   "all tests still pass" — both are meaningless against an already-red suite.

   **`knownRed` is captured once, at first-run preflight, and never re-derived.** It means "failing before this run began" — a
   property of the starting tree, not of whatever this check happens to see. Before treating a red suite as a candidate baseline,
   determine first run vs. resume the same way `## Decompose` does: does `.tdd/checklist.json` exist and have items?

   - **First run** (checklist absent or empty). If red, list the failing test IDs, ask the user whether to proceed, and if so record
     them in `checklist.json` as `knownRed`.
   - **Resume** (checklist present with items). Read the checklist's existing `knownRed` — this step does not ask for it again and
     does not overwrite it. If the suite is red, attribute every failure before deciding anything: the item currently at status
     `red` has a committed `red: <behavior>` commit for it (`git log --grep`, exact match on that item's `behavior` text) — a
     failure in a test file that commit touched is the expected mid-cycle state, Red's own test with Green not yet run, not a
     baseline, and must not be added to `knownRed`. **A red suite is not automatically a baseline just because this is a resume.**
     Any failure that is not in that commit's test files is a genuinely new red suite, not a resume artifact: treat it exactly like
     the first-run case above — list it, ask the user, and if they agree to proceed, append it to the existing recorded `knownRed`
     rather than overwriting the list. If no item is currently at status `red`, there is nothing to attribute to and every failure
     falls into this branch.
```

The three settlement points the coordinator required are each covered:

1. **`knownRed` is captured at first-run preflight only.** Stated directly in the new lead sentence; the resume bullet
   never writes to it, only reads.
2. **A red suite on resume is not automatically a baseline.** Stated as its own bolded sentence, plus the mechanism:
   failures are attributed to the current `red`-status item's own commit before anything is decided.
3. **Failures not attributable to a non-terminal item are a genuinely new red suite, handled explicitly, not left to
   inference.** The "any failure that is not in that commit's test files" clause routes them through the same
   ask-the-user flow as first-run, with an explicit append-not-overwrite instruction — closing the ambiguity the
   coordinator raised about append vs. overwrite.

**Precision note:** the coordinator's phrasing used "an item whose status is non-terminal" for the exempted case. I
scoped the mechanism specifically to the item at status `red`, not the broader non-terminal set (`pending`, `red`,
`green`). Reasoning: by construction only one item can be `red` at a time (items are processed strictly in order), a
`pending` item has no test yet so can never explain a failure, and a `green` item's test was independently verified to
pass before that status was ever committed (Green step 4's independent verification plus step 5's full-suite check) — so
a failure mapping to a `green` item on resume is a genuine regression, not expected mid-cycle state, and exempting it
would silently mask exactly the kind of regression this workflow exists to catch. The two phrasings produce identical
exemption sets in practice (non-`red` non-terminal items never have attributable failures to begin with), so this is a
precision tightening, not a deviation from what was asked.

**Attribution mechanism note:** there is no persisted `testId` field on a checklist item, so I used the existing git
audit trail instead of inventing new schema — the same approach the spec and this file already rely on elsewhere
(`git log --grep '^red:'` is named directly in the spec as "a usable audit trail"). This avoids a schema change while
still making the attribution mechanical rather than left to judgment.

### Trace C — resume with a legitimately red suite (the concern-1 scenario)

Checklist on disk: item 1 `done`, item 2 `red` (Red committed `red: rejects empty input` and the session was
interrupted before Green ran), item 3 `pending`, `knownRed: ["test_legacy_flaky"]`.

Preflight step 3 runs the full suite. Suppose it reports two failures: `test_legacy_flaky` and
`test_rejects_empty_input` (the test Red just wrote for item 2).

1. Determine first-run vs. resume: `.tdd/checklist.json` exists and has items → resume.
2. Read the existing `knownRed`: `["test_legacy_flaky"]`. Do not ask the user for it again, do not overwrite it.
3. Attribute each of the two current failures:
   - `test_legacy_flaky` — not in the `red: rejects empty input` commit's touched files (that commit only touched the
     test file for item 2). Falls to the "genuinely new red suite" branch... but it is already in the recorded
     `knownRed`, so it is already accounted for and not re-flagged.
   - `test_rejects_empty_input` — **is** in the `red: rejects empty input` commit's touched files (item 2, currently at
     status `red`). Expected mid-cycle state → **left out of `knownRed` entirely.**
4. No unattributed, previously-unrecorded failures remain, so preflight step 3 passes with no new prompt to the user.
   The run proceeds; the per-item loop resumes at item 2 (first non-terminal item), dispatching Green next — and Green's
   own step 5 full-suite check (subtracting `knownRed`, which still correctly excludes only `test_legacy_flaky`) is what
   will actually verify `test_rejects_empty_input` goes green. `test_rejects_empty_input` was never added to `knownRed`,
   so nothing downstream ever treats it as permanently exempt.

**Contrast with the unfixed text:** step 3 would have seen two failures, asked the user "suite is red, proceed?", and
on yes recorded *both* `test_legacy_flaky` and `test_rejects_empty_input` as `knownRed` (or, depending on reading,
overwritten the list to just these two, losing the original entry — the ambiguity the coordinator flagged). Either
reading permanently exempts `test_rejects_empty_input` from every later suite comparison, so the item could reach
`done` without Green's fix ever being verified to actually turn it green.

### Verification (post-addendum)

```
node --test
# tests 297
# pass 294
# fail 2
```

Failing set unchanged: the same two Task-8 `singleTerse` drift-check items. No regression from the preflight edit.

### Files changed (final)

- `skills/run-tdd-cycle/SKILL.md` — only file touched across both commits.

### Commits (round 1)

- `2dae17f` — `fix(skill): stop decompose from clobbering a resume, fix mutation counter order` (I1 + I2)
- `a7de8c5` — `fix(skill): stop resume preflight from baselining an in-progress red test` (coordinator-directed
  follow-up on concern 1)

## Round 2 — fixing the round-1 carve-out

The coordinator's second review confirmed I1 and I2 (commit `2dae17f`) are correct and match the spec. Both round-2
findings are against the carve-out added in commit `a7de8c5`, and both trace to one root cause: the checklist item
schema had no `testId`, so the round-1 text reached for `git log --grep` on behavior text (unanchored BRE — a shorter
behavior string matches a longer sibling that starts with it, and regex metacharacters in a behavior string change the
match) and file-granularity attribution (excludes *every* failure in a touched test file, not just the in-progress
one — silently masking a genuine regression in a co-located test, which would then surface later at Green's suite
check and read as caused by Green's current dispatch, triggering a revert of correct work).

### Change 1 — persist `testId` on the checklist item

Red's handover already reports `testId` and the orchestrator already uses it one step later ("Independently verify:
run the configured single-test command against `testId` yourself" — Green step 4, `SKILL.md:230` before this edit,
unchanged by it). It simply never survived the dispatch that produced it, so a resume had nothing to compare against
except the behavior text.

**Before** (Red section, outcome branch):
```
   - `failing` → commit `red: <behavior>`, status `red`, continue to Green.
```

**After:**
```
   - `failing` → record the handover's `testId` on the item, commit `red: <behavior>`, status `red`, continue to Green.
```

**Before** (Decompose schema block and its explanatory paragraph):
```
      "items": [
        { "id": 1, "behavior": "<one testable behavior>", "status": "pending" }
      ]
    }

Write `mutationRoundsRun` at decompose time, initialised to `0`. Every other field the loop reads is declared here; leaving this one
to be created later by the mutation pass is the shape `knownRed` had before it turned out nothing read it — a value that exists in
prose but not in the schema is one nobody has to account for.
```

**After:**
```
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
```

This directly answers the coordinator's instruction to state the field is declared "where every other loop-read field
is declared — the same argument the file already makes for `mutationRoundsRun`": the new paragraph makes that
argument by name.

### Change 2 — order the preflight-step-3 checks explicitly, and Change 3 — drop `git log --grep`

**Before:**
```
   - **Resume** (checklist present with items). Read the checklist's existing `knownRed` — this step does not ask for it again and
     does not overwrite it. If the suite is red, attribute every failure before deciding anything: the item currently at status
     `red` has a committed `red: <behavior>` commit for it (`git log --grep`, exact match on that item's `behavior` text) — a
     failure in a test file that commit touched is the expected mid-cycle state, Red's own test with Green not yet run, not a
     baseline, and must not be added to `knownRed`. **A red suite is not automatically a baseline just because this is a resume.**
     Any failure that is not in that commit's test files is a genuinely new red suite, not a resume artifact: treat it exactly like
     the first-run case above — list it, ask the user, and if they agree to proceed, append it to the existing recorded `knownRed`
     rather than overwriting the list. If no item is currently at status `red`, there is nothing to attribute to and every failure
     falls into this branch.
```

**After:**
```
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
```

`git log --grep` and file-granularity attribution are both gone — bucket 2 is a plain string comparison against the
`testId` field. The contradiction the coordinator identified (this step says "does not ask for it again" for
`knownRed`, then the old text's next sentence routed every failure not matching the git-log heuristic into the ask,
including ones already in the recorded list) is fixed by checking bucket 1 before any attribution logic runs at all.

### One more, cheap — the approval-skip window

**Before** (end of the Decompose resume bullet):
```
  not terminal — `pending`, `red`, and `green` are not terminal; `done`, `redundant`, and `blocked` are. Skip the approval step below;
  it is for a new decomposition, not a continued one.
```

**After:**
```
  not terminal — `pending`, `red`, and `green` are not terminal; `done`, `redundant`, and `blocked` are.

  **Unless every item is still `pending`, skip the approval step below** — it is for a new decomposition, not a continued one. If
  every item is still `pending`, nothing has been dispatched yet, so this state is indistinguishable from a first run interrupted
  between writing the checklist and showing it for approval: `.tdd/checklist.json` is gitignored, so that write never dirties the
  tree for Preflight's clean-tree check to catch. Show it for approval as if this were a first run — cheap, since no work exists yet
  to lose by asking again.
```

No new field: the carve-out uses only the existing `status` values already on every item, per the coordinator's
explicit instruction not to build an approval-tracking field. Confirmed `.tdd/checklist.json` is in `.gitignore`
(`grep -n '\.tdd' .gitignore` shows it at lines 23 and 170) before writing the "gitignored, so that write never
dirties the tree" claim — this is not an assumption.

### Re-traces — the three resume-with-red-suite buckets

Per the coordinator's note on Trace C: every step below quotes the exact sentence in the current file text that makes
it happen. Where I cannot quote a sentence, I say so rather than asserting the conclusion.

**Setup common to all three traces.** Checklist on disk: item 1 `done`; item 2 `status: "red"`, `testId:
"test_rejects_empty_input"` — written per the Red-section quote below; item 3 `pending`; `knownRed:
["test_legacy_flaky"]`.

> Red section, outcome branch: "`failing` → record the handover's `testId` on the item, commit `red: <behavior>`,
> status `red`, continue to Green." — this is why item 2 has `testId: "test_rejects_empty_input"` on disk: it was
> written the turn Red's outcome was `failing`, before the interruption that this resume is recovering from.

Preflight step 3, resume branch, opening sentence (applies to all three traces): "Read the checklist's existing
`knownRed` — this step does not ask for it again and does not overwrite it. If the suite is red, classify every
failing test ID against three buckets, checked in this order."

**Trace D — bucket 1 (already recorded).** Suite reports exactly one failure: `test_legacy_flaky`.

- Bucket 1 check: "**Already in the recorded `knownRed`.** Expected by definition — accepted before this run began.
  Do not re-ask, do not re-record." `test_legacy_flaky` is literally the one element of the `knownRed` array read in
  the opening sentence above, so this bucket matches.
- Result: no prompt to the user, no write to `checklist.json`. Preflight step 3 passes. This is the case the
  coordinator's critique of Trace C actually needed: the old text's contradiction (asserting "does not ask again"
  while routing this exact case into the ask) is what bucket-1-first closes.

**Trace E — bucket 2 (matches the in-progress item's `testId`).** Suite reports two failures: `test_legacy_flaky`,
`test_rejects_empty_input`.

- `test_legacy_flaky` → bucket 1, as in Trace D → exempt, not re-recorded.
- `test_rejects_empty_input` → not in the `knownRed` array, so bucket 1 does not match; bucket 2 check: "**Matches the
  `testId` recorded on the item currently at status `red`**, if any. Expected mid-cycle state — Red wrote this test,
  Green has not run yet — and must not be added to `knownRed`." Item 2's `testId` field, quoted above as written by
  the Red-section sentence, is exactly `test_rejects_empty_input` — an exact string match, not an inference about
  which file it lives in.
- Result: neither failure prompts the user or gets written to `knownRed`. Preflight step 3 passes; the per-item loop
  (Decompose resume bullet: "resume the per-item loop from the first item whose status is not terminal") resumes at
  item 2, whose next step per the existing Red outcome-branch text ("`failing` → ... continue to Green") is a Green
  dispatch — and Green's own step 5 full-suite check is what will actually verify `test_rejects_empty_input` goes
  green, using a `knownRed` that correctly still excludes only `test_legacy_flaky`.

**Trace F — bucket 3 (genuinely new).** Suite reports three failures: `test_legacy_flaky`, `test_rejects_empty_input`,
and `test_unrelated_regression` (a previously-passing test with no connection to item 2's work).

- `test_legacy_flaky` → bucket 1 → exempt, as in Trace D.
- `test_rejects_empty_input` → bucket 2 → exempt, as in Trace E.
- `test_unrelated_regression` → fails bucket 1 (not in the recorded array) and fails bucket 2 (does not match item 2's
  `testId`) → bucket 3: "**Neither of the above.** A genuinely new red suite, not a resume artifact: treat it exactly
  like the first-run case above — list it, ask the user, and if they agree to proceed, append it to the existing
  recorded `knownRed` rather than overwriting the list."
- Result: the orchestrator lists `test_unrelated_regression` and asks the user whether to proceed. If they agree,
  `knownRed` becomes `["test_legacy_flaky", "test_unrelated_regression"]` — appended, not overwritten, and
  `test_rejects_empty_input` is correctly absent since bucket 2 never records it. If the user declines, the same
  implicit "if not, stop" convention applies as in the first-run case one bullet up — the file does not spell out a
  separate "declined" behavior for either branch, so I did not invent one here either, matching the file's existing
  precision.

### Verification (round 2)

```
node --test
# tests 297
# pass 294
# fail 2
```

Failing set unchanged: `drift check: every key the spec declares also appears in tests/fixtures/config.json` and the
matching `tdd-init.md` check, both `singleTerse` (Task 8's known baseline). Confirmed the drift checks read
`.tdd/config.json`'s schema, not the checklist item schema `testId` was added to, so they could not have been affected
either way — checked this rather than assuming it from an unchanged pass count.

### Files changed (final, both rounds)

- `skills/run-tdd-cycle/SKILL.md` — only file touched across all three commits.

### Commits (round 2)

- `0a7edd6` — `fix(skill): persist testId and fix resume knownRed check ordering`
