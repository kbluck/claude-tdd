### Task 12: Promote `e2e/` to an automated smoke test

**Invariant.** A change that breaks the live workflow fails something.

**Why** (T7). `e2e/` is a recorded artifact, not a regression test: not wired into the suite, nothing re-runs it, nothing diffs it against an expectation, and one test carries a comment marking it "PLANTED for Task 10".

The ledger records **8 of 20 defects found only by running the system**, including the two most consequential — and this review found four more of that kind. The only mechanism that finds that class is currently manual.

**Approach.** Record an expected outcome (final checklist state, commit subjects, test count) and diff against it. Add the two cases this review found broken and nothing exercises: **resume** (Task 6) and an **out-of-glob violation** (Task 7).

**Done when.** A documented command runs the workflow and fails on a seeded regression.

