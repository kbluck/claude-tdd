### Task 6: Fix the resume branch and the mutation round counter

**Invariant.** Re-invoking `/tdd <spec>` on an interrupted run continues it. The round cap bounds repeated survivor-producing passes.

**Why it fails today** (I1 + I2, Critical). `SKILL.md` asserts "an interrupted run resumes from this file, not from your context", and `## Decompose` is unconditional. The section claiming resume works is the section that destroys the state it depends on — item statuses, `knownRed`, `mutationRoundsRun`, the baselines. Separately, `mutationRoundsRun` increments in a step written after both terminal branches, and the survivor branch returns to the per-item loop before reaching it, so the cap is inert on the only path needing it.

**Approach.** Branch on the checklist's existence before Decompose; re-surface `blocked` items and continue from the first non-terminal one. Increment and write the counter **first**, then branch on survivors and remaining budget.

**Constraints.** Neither defect is exercised by any test, which is why both survived every review round. Task 12 adds the cases; inspection is not verification.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and a resume against a hand-authored partial checklist preserves every field.

