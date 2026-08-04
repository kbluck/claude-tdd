### Task 9: Add the orchestrator-side test-file scan

**Invariant.** A committed test that reads a `globs.source` path is caught at commit time.

**Why.** Prevention is impossible; detection is cheap and uses the prevent-and-verify split the design already relies on. Scan Red's committed tests for `open(`, `require(`, `include`, `File.read` targeting a source path; treat a hit as a guardrail violation.

**Constraints.** **Document it as a detector, not a control.** It is a substring heuristic against an LLM-authored file: it raises the cost and catches the obvious spelling, and it does not close the channel.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and the text describing the scan contains "detector".

