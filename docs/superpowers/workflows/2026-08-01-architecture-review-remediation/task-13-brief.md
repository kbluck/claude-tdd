### Task 13: Remaining consistency items

| ID | Item |
|---|---|
| I4 | Validate `testId` against `globs.test` orchestrator-side before dispatch; reject `..` in the Bash delta as defence in depth. The two halves of the guard currently disagree about whether traversal matters. |
| I5 | Green's dispatch: "Red's handover report **and** `limits.greenAttempts`." The current "only the report" contradicts `tdd-green.md`. |
| I7 | `tdd-red.md` omits the coverage baseline its own step 4 uses; `tdd-refactor.md` omits `knownRed`. |
| I8 | Tie `tdd-mutate`'s `blocked` outcome to the stop-and-escalate rule, as every other role's is. |
| I11 | The fixture omits `globs.ignore`; it is the schema's only executable specimen and should be faithful. |
| S6 | Drop the vestigial `.tdd/phase` entry from `.gitignore`. |
| S5b | Persist coverage baselines into `checklist.json` (schema already revised in the spec). |
| — | Rewrite `AGENTS.md`'s bash-specific traps once the port lands. The fail-open asymmetry, doc-versus-artifact, revert, `git add -A` and bytecode entries all survive; the shell-dialect ones become history and the Node-major hazard replaces them. |

---

## Tier 4 — process

