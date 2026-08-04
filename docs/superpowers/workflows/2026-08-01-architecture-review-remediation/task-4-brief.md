### Task 4: Preflight and `/tdd-init` learn about the interpreter

**Invariant.** A missing or too-old Node is a loud setup failure, never a silent unenforced run.

**Why.** A missing interpreter fails open exactly as a missing shell did. Preflight item 6 changes from "`jq` is on `PATH`" to a **version** check — an interpreter too old to run the guard fails identically to an absent one.

**Item 7 is the check that actually matters, and Task 1's fifth unknown says why.** Preflight's version check runs through the `Bash` tool and proves node is on *that* `PATH`; the hook is spawned by Claude Code with no shell and may resolve differently. Under a per-shell version manager they routinely disagree. Only the probe — dispatch a subagent, confirm an observed denial — exercises the real spawn path. Report both, and do not let a green version check read as proof the guard can start.

`/tdd-init` reports the same at setup, and gains the `commands.singleTerse` detection from Task 8.

**Done when.** `git show --stat` names `commands/tdd-init.md` and `skills/run-tdd-cycle/SKILL.md`, and pointing the suite at a stubbed too-old interpreter produces a refusal rather than a run.

---

## Tier 2 — findings the port does not touch

These are prompt and orchestration defects. None involves the guard's implementation language.

