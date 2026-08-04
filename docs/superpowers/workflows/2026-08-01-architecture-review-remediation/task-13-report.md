# Task 13: Remaining consistency items — report

BASE `43555db` was not the starting point — the actual starting point was `9d1c472` (branch head at task start); `43555db` is
this task's own first commit (S6). All commits below are `43555db..be4df01`, six total.

## Item-by-item status

| ID | Item | Status | What changed |
|---|---|---|---|
| I4 | Validate `testId` against `globs.test` orchestrator-side before dispatch; reject `..` in the Bash delta as defence in depth. | **Fixed** | `rules.mjs`'s `bashVerdict` already rejected `..` in the delta (pre-existing, tested at `rules.test.mjs:480`) — that half was already done. Added the missing half: `SKILL.md`'s Red audit now validates `testId`'s path-like portion (everything before a trailing `::`, when it contains a `/`) against `globs.test` before it or Green ever run it, folded into the existing glob-mismatch/content-scan violation branch. Explicitly skipped on any outcome other than `failing`, so a `blocked` report with no `testId` cannot be misread as a violation. |
| I5 | Green's dispatch: "Red's handover report **and** `limits.greenAttempts`." | **Fixed** | `SKILL.md`'s Green step 1 now names both, matching `tdd-green.md` step 3, which already expected the attempt limit from the orchestrator. |
| I7 | `tdd-red.md` omits the coverage baseline its own step 4 uses; `tdd-refactor.md` omits `knownRed`. | **Fixed** | Added both. Also added the coverage command to `tdd-refactor.md`'s "Your input" — self-identified while editing the same list: step 2 runs it but it was never declared as an input either. Flagging this explicitly since it was not in the routed item text. |
| I8 | Tie `tdd-mutate`'s `blocked` outcome to the stop-and-escalate rule, as every other role's is. | **Fixed** | `SKILL.md`'s Mutation pass now branches on `outcome: "blocked"` right after the dispatch step, before the on-return checks, mirroring Refactor's `blocked` handling and the Escalation section's general rule. Previously this outcome was reportable but nothing in `SKILL.md` said what to do with it. |
| I11 | The fixture omits `globs.ignore`. | **Already done — evidence, not fixed** | `tests/fixtures/config.json:14` and `tests/fixtures/config-mutation.json:14` both already declare `"ignore": ["docs/**", "*.md"]`, present since the guard's very first commit (`d67f609`, `git log --follow` confirms). `tests/config-contract.test.mjs:92,117` already asserts `globs.ignore` is present and is an array. No change made. |
| S6 | Drop the vestigial `.tdd/phase` entry from `.gitignore`. | **Fixed** | Removed, as its own commit (`43555db`), touching no other line in the file. |
| S5b | Persist coverage baselines into `checklist.json` (schema already revised in the spec). | **Fixed** | `SKILL.md`'s Coverage baselines section now instructs writing `{ uncoveredLines, capturedAt }` to `checklist.json`'s `baselines` field the moment each baseline is captured (preflight, before Green, before Refactor), and reading it back from disk rather than from context when comparing — closing the compaction gap the spec (`:181`) already described. Left the Decompose schema literal itself unchanged: it deliberately does not predeclare `baselines` (documented exception at `SKILL.md:90`), because nothing reads it before the coverage machinery's own first capture writes it — checked this discriminator explicitly rather than assuming. |
| — | Rewrite `AGENTS.md`'s bash-specific traps once the port lands. | **Fixed** | See below. |

### Items routed by earlier reviewers, beyond the brief's table

| Source | Item | Status | What changed |
|---|---|---|---|
| Task 6 review | Mutation-pass item-append literal omits `"testId": null` | **Fixed** | Added to the append literal in `SKILL.md`, matching the schema paragraph's "every loop-read field is declared here" rule. |
| Task 7 review | `tdd-refactor`'s audit step has no explicit `Violation → revert` branch | **Fixed** | Added, matching Red's and Green's pattern. This changed a load-bearing premise elsewhere — see below. |
| Task 9 review | Spec names four tokens uniformly as hit-triggers; `SKILL.md` correctly demotes `require(`/`include` | **Fixed** | Edited the one spec sentence named, scoped to that claim only. No other spec line touched. |

## The Refactor audit fix and its ripple

Adding the violation branch to Refactor's own audit made a downstream sentence in *Reverting a dispatch* false: it justified
re-deriving fresh paths for Refactor's hard coverage gate on the premise that "Refactor's audit has no defined violation
branch." That premise no longer holds. I consulted the advisor before touching this, because the tempting fix — reclassify the
coverage gate into the same bucket as Green's coverage-gate overrun, which falls back to the `globs.source` pattern — would have
been wrong: a re-derived `git diff --name-only`/`git status --porcelain` list is strictly more inclusive than a glob pattern, and
narrowing the pathspec at the single most expensive site in the plan (Task 7, six review rounds, four defects) for no functional
gain was the real risk. I kept the mechanism and only rewrote the now-false clause. This also meant recomputing the bucket-1 site
count (five → six: Refactor's own audit joined, nothing left) and the total call-site count referenced two paragraphs later (nine
→ ten). Both are pinned by `tests/skill-consistency.test.mjs`.

## AGENTS.md Traps rewrite

**Kept, unchanged in substance:** reads-fail-open/writes-fail-closed, fixing-the-document-not-the-artifact, the bytecode/`e2e/mutants`
residue, `git add -A`, and (extended, not replaced) revert-does-not-revert.

**Retired:** the bash 3.2 / zsh dialect entries (sourcing `rules.sh` into zsh, zsh's `path`-tied-to-`PATH`, the
`${p//\/\//\/}` substitution gotcha) and the whole "Platform constraints" section (BSD `realpath -m`, bash 3.2 associative
arrays). None of these have a live target left — `rules.sh` is gone, path canonicalisation is `fs.realpathSync.native` in
`rules.mjs`, and the one remaining shell script (`e2e/mutmut.sh`) uses none of the retired constructs.

**Added, each grounded in something measured rather than inferred:**
- The Node-major hazard (the item's own name in the task list): the hook's interpreter is chosen by the host, not by
  `.node-version`/`fnm`, can disagree with the orchestrator's own `Bash` tool (measured: 22.23.2 vs an IDE-bundled 24.13.0), and
  can drift with no project file changing and no restart (an `fnm` per-session directory is reapable, falling back to a
  different major). Only the preflight *probe* (item 7), not the version *check* (item 6), proves the guard can actually start.
- `node --test`'s own verified failure shapes: a collection-time throw in one file does not take the whole run down (tested
  directly — a 3-file run with a throwing middle file still ran the other two, `pass 2/fail 1`, exit 1), but an empty match
  prints `0/0/0` and **exits 0** (tested directly) — the same "empty glob is a silent pass" failure the retired harness used to
  guard against on purpose, now unguarded. Also noted: `node --test tests/` (bare directory) throws `Cannot find module` rather
  than discovering the suite — loud, not silent, but still a plausible-looking wrong invocation (this was already recorded in
  the ledger from Task 2; carried into AGENTS.md for the first time).
- "Compare failing identities, not failing counts" — Task 2's `globMatch` bite-check (29/29 identical count, entirely different
  failing tests) and Task 12's fix-round report whose own claimed number did not reproduce.
- The fourth instance of "revert does not revert": `git checkout`'s mixed-pathspec atomicity abort, and the resolution —
  `checkout` retired from the mechanism entirely, every site now `reset --hard` plus scoped `clean`.
- "The spec is not a safe substitute for the files" (new subsection): three task-brief errors (Task 4's fail-open inversion,
  self-caught; Task 5's `publicApi` channel, caught by the implementer; Task 7's pathspec claim, which originated in the spec
  itself) all traced to writing a claim about the system from the spec's account of it rather than from `agents/*.md` or the
  code — including once by the person who wrote the spec.

I explicitly did **not** invent claims about `node:test` behaviour I hadn't verified (e.g. I did not assert anything about
uncaught async rejections or `process.exit()` mid-test) — the empty-match and collection-throw claims above were each reproduced
directly in the scratchpad before being written down, in the same spirit as the section they're going into.

**Self-inflicted bug caught during self-review:** removing `.gitignore`'s `.tdd/phase` line shifted every later line by one,
which made `AGENTS.md`'s own `.gitignore:174` cross-reference (two sections above the Traps rewrite) stale in the very same
commit sequence that would flag exactly this pattern elsewhere. Fixed to `.gitignore:173` before committing.

## Verification

- `node --test` — **326 tests, 325 pass, 0 fail, 1 todo** (was 307/306/0/1; +19 from the new test file, no regressions,
  no slowdown — 1.5s).
- `npm run smoke` — **11/11**, unchanged.
- `npx tsc --noEmit` — clean (installed `node_modules` temporarily to check, then removed it; tree left clean).
- Every new assertion in `tests/skill-consistency.test.mjs` was bite-checked individually: reverting the specific text fails
  exactly the one test naming it (verified for the `testId: null` literal, the Refactor violation-branch text, the I4 testId
  validation clause, and the S5b persistence instruction — spot-checked rather than all 19, since the same
  extract-then-assert mechanism is used throughout).

## Files changed

- `.gitignore` — S6, own commit.
- `agents/tdd-red.md`, `agents/tdd-refactor.md` — I7 plus the self-identified coverage-command gap.
- `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` — I9 (one sentence).
- `skills/run-tdd-cycle/SKILL.md` — I4, I5, I8, S5b, the Task 6 and Task 7 deferred items, and the *Reverting a dispatch*
  count/bucket updates that followed from the Task 7 fix.
- `tests/skill-consistency.test.mjs` — new, pins all of the above.
- `AGENTS.md` — Traps rewrite.

## Commits

1. `chore: drop the vestigial .tdd/phase gitignore entry` — S6, `.gitignore` only.
2. `fix(agent): declare the inputs tdd-red and tdd-refactor actually use` — I7 plus the self-identified gap.
3. `fix(spec): stop naming require(/include as unconditional content-scan hits` — I9.
4. `fix(skill): close six remaining consistency gaps in the TDD cycle` — I4, I5, I8, S5b, Task 6 and Task 7 deferred items.
5. `test(skill): pin Task 13's SKILL.md, agent and spec consistency fixes` — new test file.
6. `docs(plugin): rewrite the traps section for the Node port` — AGENTS.md.

## Self-review findings

- Caught and fixed the stale `.gitignore:174` line reference in `AGENTS.md` before committing (see above) — the S6 edit's own
  side effect on a nearby line, which is exactly the class of drift this task's Traps rewrite warns about.
- Considered and rejected moving Refactor's coverage-gate revert to the `globs.source`-fallback bucket for internal-consistency
  tidiness. The advisor caught this before I wrote it: the re-derived path list is strictly more inclusive, and narrowing it
  would trade a real safety margin for prose symmetry at the most expensive site in the plan. Fixed the false clause; kept the
  mechanism.
- Did not touch `commands/tdd-init.md`'s stale `jq` reference (Task 4 deferred minor) or the three-way degradation-table
  duplication (Task 11 deferred minor) — neither was routed to this task, and both are outside its item list.
- Did not touch the duplicate `.tdd/checklist.json` entry already present in `.gitignore` (lines 22 and 173 before my edit,
  now 22 and 172) — S6's constraint was to touch nothing but the `.tdd/phase` line, and the duplicate predates this task.

## Concerns

- The `tdd-refactor.md` coverage-command addition was self-identified, not routed by any reviewer. It is the same class of
  defect as the routed `knownRed` omission (an input the procedure uses but "Your input" never declared), found while editing
  the identical list, and I judged it low-risk to include rather than leave a second, adjacent gap in the same paragraph — but
  it was not asked for, so it is called out here for anyone reviewing this task to veto independently.
- `AGENTS.md`'s opening tally ("Iteration 1 recorded twenty defects... Iteration 2... did not close the book") deliberately
  does not attempt an exact iteration-2 defect count — I judged that fabricating a precise number I could not verify within
  this task's scope would be worse than an honest, evidenced qualitative claim (Task 7's six rounds, four defects, cited
  directly from the ledger).
