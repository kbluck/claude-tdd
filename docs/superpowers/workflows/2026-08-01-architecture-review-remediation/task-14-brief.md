### Task 14: Record the decisions

Three, so they are not relitigated:

- **The plan carries design intent, not implementation** (R18). This document is the first instance.
- **The measurement layer stays** (R19). CRAP, the coverage ratchets and the mutation pass are retained; only found defects are fixed. The mutation pass earned its place by finding a real spec violation; the CRAP pipeline has not yet shown comparable return and is the first thing to reconsider.
- **The substrate is Node 22**, for the reason in the spec: bash failed open on Windows, and a fail-open on the read path is the failure this design exists to prevent.
- **Checked JavaScript, not compiled TypeScript.** `target: ES2023` was measured and does not gate the `node:*` API surface — a file calling `path.matchesGlob` and `fs.globSync` compiled clean under it. The deciding argument is fail direction: a stale build artifact runs and fails open, whereas a missing type-checker merely stops checking. Full rationale in the spec under *Types without a compile step*.

One lesson worth stating in its own right (M2): **"green" from a harness that cannot distinguish "no assertion failed" from "no assertion ran" is not evidence.** A one-character `jq` typo once deleted 46 assertions while the suite reported "122 passed, 0 failed". Carry that requirement into `node:test`, which has its own version of the same trap — a `describe` block that throws during collection can report zero failures.

---

## Ordering

Tier 0 gates everything, and Task 1b is in Tier 0 precisely because Task 3 destroys its comparison target. Within Tier 1 the order is strict: 2 → 3 → 4.

Tier 2 and Tier 3 are independent of the port and of each other, except that Task 12 needs Tasks 6 and 7 landed, since its new cases exercise them.

Tasks 5–10 and 13 modify Markdown, so their real verification is Task 12, not the unit suite. Do not treat reading a prompt as evidence that a workflow branch works — the four `SKILL.md` defects this review found were all invisible to document review, and roughly forty prior rounds passed over them.

## Findings this plan does not close

- **S1's bypass remains open**, detected and documented rather than closed. Closing it needs process-level sandboxing, which the spec rules out explicitly.
- **T4** (deny assertions check the verdict bit, not the branch) and **T5** (degenerate config shapes untested) are folded into Task 2 rather than given their own tasks.
- **T6** — nothing asserts `hooks.json` wiring, `plugin.json` validity, or agent `tools:` frontmatter. The frontmatter is the one with teeth: it is a strict subset of the `PreToolUse` matcher today, and nothing enforces that it stays one.
- **Windows is not verified**, only written for. The spelling matrix asserts separator and case handling as data from a POSIX machine. Nobody has run this on Windows, and the claim should not be made until someone has.
