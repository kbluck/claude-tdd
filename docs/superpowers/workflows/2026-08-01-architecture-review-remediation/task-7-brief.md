### Task 7: Scope the revert to the offending paths

**Invariant.** The revert can remove the file a guardrail violation created.

**Why it fails today** (I3). The revert is scoped to the globs the role may write. A violation is *by definition* a write outside those globs — so in the backstop scenario the audit exists for, the rogue file is unreachable by a glob-scoped `git clean`.

**Approach.** Scope to the offending paths the audit reported; fall back to the role's globs only when the audit named none.

**Constraints.** Third instance of revert-does-not-revert; the first two were command choice, this is scoping. Do not add `-x` to `git clean` — the venv, checklist and coverage report must survive.

**Done when.** `git show --stat` names `skills/run-tdd-cycle/SKILL.md`, and the out-of-glob case in Task 12 cleans.

