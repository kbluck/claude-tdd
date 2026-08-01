## Task 10: Mutation hardening pass end-to-end

Task 9 verified the Red/Green/Refactor loop. This verifies the pass that runs
after it, and the CRAP trigger that targets it.

**Files:**
- Modify: `e2e/tests/test_calc.py`
- Create: `docs/superpowers/spikes/2026-07-30-mutation-findings.md`

**Interfaces:**
- Consumes: everything, plus a completed Task 9 run
- Produces: findings only

- [ ] **Step 1: Plant a test that covers without asserting**

This is the exact defect mutation testing exists to find, and the one coverage
cannot see. In the fixture, replace the `divide` test with one that executes the
happy path but asserts nothing about it:

```python
def test_divide_runs():
    divide(10, 2)          # executes the line, asserts nothing


def test_divide_by_zero():
    with pytest.raises(ValueError):
        divide(1, 0)
```

```bash
python -m pytest -q --cov --cov-report=json:.tdd/coverage.json
jq '.files["src/calc/__init__.py"].summary.percent_covered' .tdd/coverage.json
```

Expected: coverage reports the `return a / b` line as **covered**, because
`test_divide_runs` executes it. Coverage is satisfied; the behavior is
unprotected. Record this number — it is the baseline claim the mutation pass is
about to refute.

- [ ] **Step 2: Confirm CRAP ranks the right method**

```bash
radon cc -j -s src | jq .
```

Cross-reference with per-method coverage and compute
`comp² × (1 − cov)³ + comp` by hand for `divide`. Confirm the orchestrator's
computation matches yours.

**If every method comes back at coverage 1.0**, the line-range mapping is
broken — that is the specific failure this step exists to catch, and it would
otherwise present as "no triggers fired," indistinguishable from healthy code.

- [ ] **Step 3: Run the mutation pass and confirm the survivor**

Run `/tdd spec.md` to completion. When the checklist empties, the mutation pass
should fire.

Expected: mutating `return a / b` to `return a * b` (or similar) **survives** —
`test_divide_runs` calls it and asserts nothing, `test_divide_by_zero` never
reaches that line. The pass reports one survivor with a `missingBehavior` along
the lines of "divide returns the quotient."

- [ ] **Step 4: Verify the revert discipline**

The single most important check in this task. An agent that mutates and fails
to revert corrupts the source tree, and the corruption looks like ordinary
implementation drift.

```bash
git status --porcelain
git diff HEAD --stat
```

Expected: both empty after the pass returns, before any new items are worked.

- [ ] **Step 5: Confirm the survivor becomes a Red item and closes the loop**

Expected: a new checklist item with `"origin": "mutation"`, which then runs a
normal Red→Green cycle. Red writes a test asserting the quotient; Green may need
no change at all, since the code was already correct — so this item plausibly
resolves via `passing-covered`.

That outcome is correct and worth confirming rather than treating as a bug: the
mutant proved the *test* was weak, not the code. The workflow's response to a
weak test is a better test, not new source.

- [ ] **Step 6: Verify termination**

Run the pass again. Expected: no survivors, and the run completes. Confirm the
orchestrator stops rather than looping, and that it respects
`limits.mutationRounds` if survivors persist.

Also confirm it reports how many mutants `mutantsPerPass` skipped. A capped pass
reporting "no survivors" without naming the cap is a clean bill of health it did
not earn.

- [ ] **Step 7: Record findings and commit**

Write `docs/superpowers/spikes/2026-07-30-mutation-findings.md`: whether the
planted weak test was caught, whether CRAP ranked it, whether the tree stayed
clean, wall-clock for the pass, and whether hand-mutation or a tool was used.

Wall-clock matters most for whether this ships enabled by default. If a
three-function fixture takes minutes, the pass needs to be opt-in on real
projects.

```bash
git add e2e docs/superpowers/spikes
git commit -m "test: mutation hardening pass end-to-end"
```

- [ ] **Step 8: Full suite green**

```bash
bash tests/run.sh
```

Expected: all passing, exit 0.

---

## Deferred to v0.2

Named here so they are visible decisions rather than oversights:

- **Parallel cycles.** Now unblocked in principle — dropping the phase marker for `agent_type` removed the shared mutable state that made concurrency unsafe. Still unimplemented: the checklist, the git baseline, and the coverage baselines are all single-valued and would need per-cycle scoping.
- **Resume UX.** `checklist.json` makes resume *possible*; `/tdd` does not yet detect a partial run and offer to continue.
- **Coverage baseline caching.** Coverage now runs several times per cycle — preflight, before and after each Green, before and after each Refactor. On a large suite that dominates wall-clock. Incremental or per-file coverage would fix it.
- **Portable coverage and complexity parsing.** Each toolchain reports uncovered lines, and per-method complexity, in its own JSON shape. v0.1 handles both ad hoc in the orchestrator skill; a small extractor per toolchain, unit-tested against captured fixtures, belongs in `hooks/lib/`. This is the largest single source of silent-failure risk in the design.
- **Mutation pass cost control.** `mutantsPerPass` is a blunt cap. Incremental mutation — only methods whose source changed since the last pass — would make the pass affordable on a real codebase.
- **Mutation operators as config.** v0.1 hardcodes the operator list in the agent prompt. Projects with domain-specific invariants may want their own.
- **Non-git projects.** The audit requires git. No fallback is planned.
