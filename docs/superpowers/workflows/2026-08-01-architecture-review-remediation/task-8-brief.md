### Task 8: Truncate `observedFailure`

**Invariant.** The mandated handover channel carries no more test content than the runner incidentally prints.

**Why** (S5a, Critical). `observedFailure` is specified as verbatim runner output and is mandatory; a default pytest traceback reproduces the failing test function's entire body. For most tests, `observedFailure` *is* the test — so Green is denied `Read` on the test file and then handed its contents as required input, on the normal path, by design.

**Approach.** Add `commands.singleTerse` (pytest: `--tb=line`), have Red use it for the report, and make `intent`/`expected` the primary contract. Degrade explicitly when null.

**The spec is deliberately the outlier.** The iteration-2 revision added `commands.singleTerse` and a `baselines` field to the spec's schema blocks and to neither of the other two copies. The contract test derives its expected keys from the fixture and asserts presence, so an extra spec key does not fail it — the suite is green and the drift is unasserted, which is the shape of the defect that test exists to catch. Reconcile all three copies here.

**Done when.** `git show --stat` names `agents/tdd-red.md`, `commands/tdd-init.md` and the fixture; removing the key from any one of the three copies turns the suite red.

