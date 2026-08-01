---
description: Drive a specification to implementation through Red/Green/Refactor subagents
argument-hint: <spec-path>
---

Implement the specification whose path was given as this command's argument, using the TDD subagent workflow.

Use the `run-tdd-cycle` skill and follow it exactly. Do not skip preflight. Do not implement any code yourself — every line of test
and source must come from a dispatched `tdd-red`, `tdd-green`, or `tdd-refactor` agent.

If no path was given, ask the user which spec to implement.
