# Task 8 report: orchestrator skill and `/tdd`

## Files created

- `skills/running-the-tdd-cycle/SKILL.md`
- `commands/tdd.md`

Both were transcribed verbatim from the fenced code blocks in
`task-8-brief.md` (SKILL.md from lines 16–246, tdd.md from lines 254–265).
Verified with `diff` against the extracted brief text before committing —
both reported byte-identical. No summarizing, tightening, merging, or
caveat-dropping was applied.

Frontmatter check (brief Step 3), actual output:

```
---
name: running-the-tdd-cycle
description: Use when driving a specification to implementation through Red/Green/Refactor subagents - orchestrates the cycle, enforces role boundaries, and tracks progress in .tdd/checklist.json
---

---8<---
---
description: Drive a specification to implementation through Red/Green/Refactor subagents
argument-hint: <spec-path>
---
```

Matches expectation: SKILL.md has `name` + `description`; tdd.md has
`description` (+ `argument-hint`, which the brief didn't explicitly require
but is present and correct per Step 2's source text).

## Cross-checks performed before transcribing

Since nothing executes this file, I checked its claims against the actual
Task 6/7 artifacts rather than trusting the prose in isolation:

- Every config key the brief references (`commands.test`, `commands.single`,
  `commands.coverage`, `commands.complexity`, `commands.mutation`,
  `globs.test/source/ignore`, `crapMode`, `refactorTriggers.maxCrap`,
  `refactorTriggers.duplicateThreshold`, `refactorTriggers.maxFunctionLines`,
  `limits.greenAttempts`, `limits.mutationRounds`, `limits.mutantsPerPass`,
  `coverageGates.greenMaxNewUncovered`, `coverageGates.refactorMaxNewUncovered`)
  exists under that exact name in `tests/fixtures/config.json`.
- Every outcome vocabulary and report-field name the brief branches on
  (`failing`/`passing-covered`/`passing-flat`/`blocked` for Red; `stuck` for
  Green; `improved`/`no-change-needed`/`reverted`/`blocked` for Refactor;
  `mutantsAttempted`/`survivors`/`missingBehavior` for Mutate) matches the
  corresponding agent definitions in `agents/*.md` exactly.
- No mismatch found — the brief's technical claims are internally consistent
  with the rest of the implemented system.

## Test suite

Verbatim output of `bash tests/run.sh` (exit code 0):

```
--- agents.test.sh ---
  PASS: tdd-green.md declares name 'tdd-green', which guard.sh dispatches on
  PASS: tdd-mutate.md declares name 'tdd-mutate', which guard.sh dispatches on
  PASS: tdd-red.md declares name 'tdd-red', which guard.sh dispatches on
  PASS: tdd-refactor.md declares name 'tdd-refactor', which guard.sh dispatches on
  PASS: guard role tdd-red has an agent definition
  PASS: guard role tdd-green has an agent definition
  PASS: guard role tdd-refactor has an agent definition
  PASS: guard role tdd-mutate has an agent definition

--- config-contract.test.sh ---
  PASS: config has non-null version
  PASS: config has non-null crapMode
  PASS: config has non-null commands.test
  PASS: config has non-null commands.single
  PASS: config has non-null globs.test
  PASS: config has non-null globs.source
  PASS: config has non-null globs.ignore
  PASS: config has non-null refactorTriggers.maxCrap
  PASS: config has non-null refactorTriggers.duplicateThreshold
  PASS: config has non-null refactorTriggers.maxFunctionLines
  PASS: config has non-null limits.greenAttempts
  PASS: config has non-null limits.violationRetries
  PASS: config has non-null limits.mutationRounds
  PASS: config has non-null limits.mutantsPerPass
  PASS: config has non-null coverageGates.greenMaxNewUncovered
  PASS: config has non-null coverageGates.refactorMaxNewUncovered
  PASS: config declares commands.coverage (null is allowed, absent is not)
  PASS: config declares commands.complexity (null is allowed, absent is not)
  PASS: config declares commands.mutation (null is allowed, absent is not)
  PASS: the Step 7 JSON block was located at all
  PASS: the extracted block stops before step 8 (end anchor still matches)
  PASS: tdd-init's template declares commands (1x)
  PASS: tdd-init's template declares complexity (1x)
  PASS: tdd-init's template declares coverage (1x)
  PASS: tdd-init's template declares coverageGates (1x)
  PASS: tdd-init's template declares crapMode (1x)
  PASS: tdd-init's template declares duplicateThreshold (1x)
  PASS: tdd-init's template declares globs (1x)
  PASS: tdd-init's template declares greenAttempts (1x)
  PASS: tdd-init's template declares greenMaxNewUncovered (1x)
  PASS: tdd-init's template declares ignore (1x)
  PASS: tdd-init's template declares limits (1x)
  PASS: tdd-init's template declares maxCrap (1x)
  PASS: tdd-init's template declares maxFunctionLines (1x)
  PASS: tdd-init's template declares mutantsPerPass (1x)
  PASS: tdd-init's template declares mutation (1x)
  PASS: tdd-init's template declares mutationRounds (1x)
  PASS: tdd-init's template declares refactorMaxNewUncovered (1x)
  PASS: tdd-init's template declares refactorTriggers (1x)
  PASS: tdd-init's template declares single (1x)
  PASS: tdd-init's template declares source (1x)
  PASS: tdd-init's template declares test (2x)
  PASS: tdd-init's template declares version (1x)
  PASS: tdd-init's template declares violationRetries (1x)
  PASS: the derived template loop enumerated at least 19 keys (saw 23)
  PASS: the spec's schema block was located at all
  PASS: the spec's schema block ends at its closing brace (end anchor still matches)
  PASS: the spec's schema declares commands (1x)
  PASS: the spec's schema declares complexity (1x)
  PASS: the spec's schema declares coverage (1x)
  PASS: the spec's schema declares coverageGates (1x)
  PASS: the spec's schema declares crapMode (1x)
  PASS: the spec's schema declares duplicateThreshold (1x)
  PASS: the spec's schema declares globs (1x)
  PASS: the spec's schema declares greenAttempts (1x)
  PASS: the spec's schema declares greenMaxNewUncovered (1x)
  PASS: the spec's schema declares ignore (1x)
  PASS: the spec's schema declares limits (1x)
  PASS: the spec's schema declares maxCrap (1x)
  PASS: the spec's schema declares maxFunctionLines (1x)
  PASS: the spec's schema declares mutantsPerPass (1x)
  PASS: the spec's schema declares mutation (1x)
  PASS: the spec's schema declares mutationRounds (1x)
  PASS: the spec's schema declares refactorMaxNewUncovered (1x)
  PASS: the spec's schema declares refactorTriggers (1x)
  PASS: the spec's schema declares single (1x)
  PASS: the spec's schema declares source (1x)
  PASS: the spec's schema declares test (2x)
  PASS: the spec's schema declares version (1x)
  PASS: the spec's schema declares violationRetries (1x)
  PASS: the derived spec loop enumerated at least 19 keys (saw 23)
  PASS: globs.test is an array
  PASS: globs.source is an array
  PASS: globs.ignore is an array

--- guard.test.sh ---
  PASS: main thread (no agent_type): permits silently
  PASS: unrelated agent type: permits silently
  PASS: orchestrator may read tests
  PASS: orchestrator may run its own audit command
  PASS: red writing a test is permitted
  PASS: red writing source exits 2
  PASS: denial JSON has deny decision
  PASS: denial names the violated rule
  PASS: red reading source is denied
  PASS: green reading a test is denied
  PASS: green writing source is permitted
  PASS: green running the configured single-test command is permitted
  PASS: green running an arbitrary command is denied
  PASS: refactor running the full suite is permitted
  PASS: red may run the coverage command
  PASS: green may run the coverage command
  PASS: refactor may run the coverage command
  PASS: metacharacters after a coverage prefix are still denied
  PASS: refactor may run the complexity command
  PASS: green may not run the complexity command
  PASS: tdd-mutate may write source
  PASS: tdd-mutate may not read tests
  PASS: tdd-mutate may run the full suite
  PASS: namespaced tdd-red writing source is denied
  PASS: namespaced tdd-red writing a test is allowed
  PASS: namespaced tdd-green reading a test is denied
  PASS: namespaced tdd-mutate may run the full suite
  PASS: unrecognized tdd-* agent permits
  PASS: red writing source via Write is denied
  PASS: red writing source via Edit is denied
  PASS: red writing source via MultiEdit is denied
  PASS: NotebookEdit is judged on notebook_path, not a decoy file_path
  PASS: red writing source via NotebookEdit is denied
  PASS: an unrecognized tool denies rather than passing through
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green even on a path it could otherwise read
  PASS: relative source path is still denied to red
  PASS: relative test path is still allowed to red
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread

--- rules.test.sh ---
  PASS: ** normalizes and matches across directories
  PASS: non-matching glob returns 1
  PASS: leading ** matches nested path
  PASS: red may write a test file
  PASS: red may not write source
  PASS: red may not read source
  PASS: red may read an unclassified file
  PASS: red may read its own tests
  PASS: green may write source
  PASS: green may not write tests
  PASS: green may not read tests
  PASS: green may read source
  PASS: refactor may write source
  PASS: refactor may not read tests
  PASS: mutation may write source
  PASS: mutation may not write tests
  PASS: mutation may not read tests
  PASS: empty role denies
  PASS: unknown role denies
  PASS: empty source globs deny a read rather than permitting it
  PASS: empty test globs deny a read rather than permitting it
  PASS: empty test globs deny a write
  PASS: red may not read nested source even when src/ exists on disk
  PASS: red may not read top-level source even when it exists on disk
  PASS: green may not read an existing test file
  PASS: green may write nested source that exists on disk
  PASS: green may write nested source that does NOT exist yet
  PASS: tdd_matches_any restores the caller's noglob flag
  PASS: substituted test id is allowed
  PASS: exact template match is allowed
  PASS: template containing a colon path is allowed verbatim
  PASS: unrelated command is denied
  PASS: semicolon in delta is denied
  PASS: pipe in delta is denied
  PASS: redirect in delta is denied
  PASS: command substitution in delta is denied
  PASS: and-chain in delta is denied
  PASS: in-place edit via bash is denied
  PASS: empty template denies
  PASS: whitespace-only template denies rather than allowing any clean command
  PASS: placeholder-only template denies
  PASS: template starting with a placeholder denies
  PASS: trailing tab is trimmed from the static prefix
  PASS: glob characters in a parametrized test id are treated as data, not a pattern
  PASS: glob characters after the prefix are treated as literal data, not a pattern
  PASS: missing template argument denies rather than crashing

--- smoke.test.sh ---
  PASS: harness compares equal strings
  PASS: harness finds a substring

171 passed, 0 failed
```

171 passed, 0 failed — identical count to the pre-task baseline. No test
file was added or modified, so this is expected: Task 8 adds only prose
files the harness does not glob.

## Scope confirmation

Base commit before this task: `66903ec` (`fix(plan): close four vacuous-pass
holes in the orchestrator`).

`git status --short` immediately before staging (only the two new paths were
untracked, nothing else):

```
?? commands/tdd.md
?? skills/
```

`git diff --stat 66903ec..HEAD` (after committing):

```
 commands/tdd.md                       |  12 ++
 skills/running-the-tdd-cycle/SKILL.md | 231 ++++++++++++++++++++++++++++++++++
 2 files changed, 243 insertions(+)
```

No file outside `skills/` and `commands/tdd.md` changed. `hooks/`, `agents/`,
`commands/tdd-init.md`, and all existing test files are untouched.

## Commits

Two commits, split by scope per `AGENTS.md` ("Split commit if multiple
scopes would be included" — a skill file and a command file are two
different scopes on the repo's scope list: `skill`, `command`). The brief's
Step 4 shows a single unscoped `feat:` commit; I did not follow that literal
line because it conflicts with `AGENTS.md`'s binding convention, which my
task instructions explicitly pointed me back to.

- `05e2e29` — `feat(skill): add running-the-tdd-cycle orchestrator skill`
- `fffc1ed` — `feat(command): add /tdd entry point`

## Concerns / things flagged rather than silently fixed

Per instructions, I transcribed the brief exactly as written, including two
internal inconsistencies I noticed but did not correct:

1. **Preflight header miscounts its own list.** `## Preflight — all six, in
   order, before any dispatch` is followed by seven numbered items (1 through
   7), not six. Either the header is stale (an item was added after the
   header text was written) or an item should not be there. I did not
   renumber or reword — the header still says "six" in the committed file.

2. **Two numbering gaps in ordered lists**, both under "Per item":
   - **Red**: steps go `1.` then `3.` (no `2.`).
   - **Green**: steps go `1. 2. 3.` then `5. 6.` (no `4.`).
   These read fine prose-wise (nothing references a missing step by number),
   and CommonMark renderers auto-increment from the first item's value
   regardless of the literal digits that follow, so a rendered view would
   show clean sequential numbers. But the raw source — which is what a
   model reads when the skill is invoked — literally jumps 1→3 and 3→5.
   Most likely artifact of a prior edit pass that deleted a step without
   renumbering. Not fixed, per instructions not to alter the transcribed
   text.

Neither of these affects a security-relevant check (the "vacuous pass"
pattern the brief was audited for) — they're presentation/numbering
inconsistencies, not a check that could silently pass when it should fail.
I did not find any instance of the pattern this task was watching for
hardest: every config key, outcome name, and report field the brief
references checks out exactly against Tasks 6/7's actual schemas, and all
four previously-fixed vacuous-pass holes mentioned in my task context
(empty-diff audit, empty-checklist completion, probe-error-as-pass,
`mutantsAttempted: 0`) are present and intact in the text I transcribed.

No other concerns. Suite green, scope clean, frontmatter correct.

## Fix round 1

The coordinator corrected `task-8-brief.md` (commit `c0d6ca6`, not mine):
header changed to "all seven" (item 7, the `agent_type` probe, was added
without updating the count), and the Red/Green step lists renumbered
contiguously (Red was 1→3 skipping 2; Green was 1,2,3→5,6 skipping 4),
left over from an earlier removal of the phase-marker writes.

Applied only the four corrected lines to `skills/running-the-tdd-cycle/SKILL.md`
via targeted `Edit` calls, then verified the whole file byte-for-byte against
the newly-extracted brief fence — identical. No other line touched.

Verification performed:

- **Header + count**: `## Preflight — all seven, in order, before any
  dispatch` followed by exactly 7 numbered items (1–7). Confirmed by
  `grep -n` extraction.
- **Red renumbered contiguously**: 1 (dispatch), 2 (audit), 3 (branch on
  outcome). No gap.
- **Green renumbered contiguously**: 1 (dispatch), 2 (audit), 3 (`stuck` →
  escalate), 4 (independently verify), 5 (coverage gate). No gap.
- **Mutation pass numbering (1–8)** was already contiguous last round and
  remains untouched — not part of this fix.
- **Four vacuous-pass safeguards re-confirmed present and unmodified** by
  `grep -n` for their exact anchor sentences, all found at their expected
  locations:
  - "An empty diff is not a passing audit." (Red audit, line 103)
  - "A checklist with no items is a failed decomposition, not a finished
    run." (Decompose section, line 53)
  - "Only an observed denial passes this check." (Preflight item 7, line 27)
  - "`mutantsAttempted: 0` is a failed pass, not a clean one." (Mutation
    pass, line 205)

  Because the full-file diff against the corrected brief came back
  identical, these are guaranteed byte-exact, not just present — the
  renumbering edits did not touch or displace any adjacent paragraph.

Test suite: `bash tests/run.sh` → **171 passed, 0 failed**, unchanged.

Scope: `git status --short` and `git diff --stat` after the edit show only
`skills/running-the-tdd-cycle/SKILL.md` modified (5 insertions, 5 deletions —
the four corrected lines, expressed as 5 diff hunks because the "Branch on
outcome" line's renumber and its neighbor land in the same hunk). Nothing
outside that one file changed.

Commit: `97cd260` — `fix(skill): correct preflight count and renumber
Red/Green steps`. Scoped `skill` per `AGENTS.md`, since only the skill file
changed this round.

No new concerns.

## Fix round 2

**Headline finding: the branch's history was rewritten between my last turn
and this one, and my verbatim work was replaced.** Before doing anything
else this round, `git log` showed a completely different commit set than
what I had committed — my `05e2e29`, `fffc1ed`, and `97cd260` were gone from
the branch tip (though still present as unreferenced objects; `git cat-file
-t` resolves all three). `git reflog` showed an interactive rebase
(`rebase (pick)` → `commit (amend)` for each commit in the branch's history)
that ran after my round-1 commit and before this round's message arrived.

The commit that replaced mine — `6112e82`, still titled
`feat(skill): add run-tdd-cycle orchestrator skill` — is not a copy of what
I wrote. It is a paraphrased, reflowed rewrite: the skill directory was
renamed `running-the-tdd-cycle` → `run-tdd-cycle`, the frontmatter `name`
and `description` were rewritten and shortened, the H1 and Announce line
were shortened, and every paragraph was rewrapped from ~80-char lines to
~132-char lines. `commands/tdd.md` was renamed consistently in the same
pass (`Use the \`run-tdd-cycle\` skill...`). This is a deliberate,
internally-consistent edit, not corruption — but it means the file I was
asked to treat as "the brief, transcribed verbatim" had already diverged
from the brief's literal text (which still reads `running-the-tdd-cycle`
throughout: frontmatter `name`, the H1, the Announce string, and both code
fences in `task-8-brief.md`) in ways unrelated to any of the C1/C2/Important
fixes this round asked for.

I raised this rather than silently picking a side. On reflection (and after
checking the coordinator's own round-2 message against the current repo
state), I'm confident the rename is intentional and current: the coordinator
named `skills/run-tdd-cycle/SKILL.md` four times, gave verification commands
against that path, and cited `e198de0` — a commit made at 17:19, four minutes
after the 17:15 rename, which updated `agents/tdd-refactor.md` and
`agents/tdd-mutate.md` to reference `knownRed` and which I confirmed exists
and is real. Their C1 diagnosis ("`knownRed` appears exactly once ... in the
schema, nowhere else") was independently verifiable against the file as it
stood before my edit — `grep -c knownRed` returned exactly `1`. So the
coordinator is working from the post-rebase file, deliberately.

Given that, I treated `skills/run-tdd-cycle/SKILL.md` as the correct target
and **patched it rather than overwriting it.** None of the eight changed or
inserted passages in this round's brief diff (preflight items 4 and 6, Red
step 2, Green steps 3–6, the Refactor dispatch line and its outcome bullets,
Mutation steps 1 and 3, the new `mutationRoundsRun` paragraph, and the
Completion section) mention the skill's name or path, so the renaming
question was orthogonal to every line I actually had to write — I never had
to choose between the two names. I took each changed/inserted passage's
wording directly from `task-8-brief.md` verbatim (no paraphrasing of my
own), and reflowed only the line breaks to match the file's existing
~120–132-char wrap width, using `fmt` calibrated against the file's own
untouched paragraphs and hand-adjusted in three spots (Red step 2, Mutation
step 1) where the mechanical wrap orphaned a `→` or split
`` `crapMode: "unavailable"` `` across a line break in a way nothing else in
the file does.

**Verification performed** (my usual whole-file `diff` against the brief no
longer applies, since the file is not a byte-identical transcription of the
brief — see above):

- Extracted the 15 changed/inserted text passages from the round-2 brief
  diff, whitespace-normalized both them and the patched file to single-spaced
  text, and confirmed each passage is present as a substring. All 15 matched.
- Confirmed the four superseded passages they replaced are gone (0 matches
  each): the old "known-red allowlist" wording, "Second violation" (replaced
  by `limits.violationRetries`), the old one-line CRAP-ranking step 1, and
  the old `reverted` or `blocked` → continue bullet.
- `grep -n knownRed` on the patched file: **7 occurrences** — the schema
  (`checklist.json`'s `knownRed` array), the new threading-mandate paragraph
  (×2 mentions inside it), Green's new full-suite check (subtracting
  `knownRed`), the Refactor dispatch line, and the Mutate dispatch line. Not
  just the schema, as required.
- Cross-checked `agents/tdd-refactor.md:62` and `agents/tdd-mutate.md:42,49,50`
  against the patched dispatches. Both agent files assert "your dispatch
  includes a `knownRed` list" — confirmed true: the Refactor dispatch line
  now reads "pass the trigger, the source paths in scope, and `knownRed`",
  and the Mutate dispatch step reads "...`limits.mutantsPerPass`,
  `knownRed`, and the mutation command...". Neither agent file changed this
  round.
- `grep -n blocked` across the whole file: every occurrence is either
  definitional (the `status` enum, "`blocked` is not `redundant`", "`blocked`
  is not `pending`") or resolves to stop/escalate (Red's audit, Red's
  outcome branch, Refactor's outcome branch, Completion, Escalation).
  Exactly one behavioral rule for `blocked` now exists in the file, and
  `reverted` (Refactor: "record it and continue") and `no-change-needed`
  (Refactor: "commit nothing, record it, continue") remain distinct from it
  and from each other.
- Re-ran the four vacuous-pass safeguard greps from prior rounds (empty-diff
  audit, empty-checklist completion, probe-error-fails-closed,
  `mutantsAttempted: 0`) — all four still present, unmoved, and intact;
  none of this round's insertions landed adjacent to or inside them.
- `bash tests/run.sh` → **171 passed, 0 failed**, unchanged.
- `git status --short` / `git diff --stat`: only `skills/run-tdd-cycle/SKILL.md`
  changed (40 insertions, 11 deletions). `commands/tdd.md` untouched —
  confirmed with `git diff commands/tdd.md` (empty).

**New concern found this round, not on the coordinator's list:** Red's audit
step now reads "up to `limits.violationRetries` times" (config-driven), but
the Escalation section — unchanged this round — still hardcodes "a second
guardrail violation by the same agent." That phrasing is only correct when
`limits.violationRetries` is `1`, which happens to be the fixture's current
value (`tests/fixtures/config.json`), so nothing is observably wrong today.
But if that config value were ever set to anything other than `1`, the two
sections would describe different thresholds for the same event. Same
defect family as the one this round fixed (a value hardcoded in one place
after being parameterized in another) — transcribed as-is per instructions,
not fixed.

**Standing concern, unresolved:** the skill's frontmatter `name`, the H1
heading, the Announce string, and the corresponding strings in
`task-8-brief.md`'s own two code fences (`Files:` header, `Step 1`/`Step 2`
paths, frontmatter, Announce line) still disagree — the brief says
`running-the-tdd-cycle` everywhere; the repo says `run-tdd-cycle`. I did not
reconcile this, since no line I was asked to change this round touches it,
and unilaterally renaming things back (or editing the archived brief) felt
like exactly the kind of silent, out-of-scope correction I've been asked
not to make. Recommend the coordinator update `task-8-brief.md` to the
current name so the next round isn't ambiguous about which string is
authoritative.

Commit: `8ecaad9` — `fix(skill): thread knownRed through Refactor/Mutate
dispatch, fix blocked handling`. Scoped `skill` per `AGENTS.md`.

## Fix round 3

Context per the coordinator: my round-2 concern about the escalation
section hardcoding a retry count was correct, but the fix that followed
only reached the plan document and the regenerated brief — not the shipped
`skills/run-tdd-cycle/SKILL.md`. This round applied the brief's current
wording directly to that file.

**Two edits as specified, plus a third I judged was implied.** The
coordinator's message header said "two small edits" and numbered exactly
two (Escalation's retry wording at `:258`, the mutation pass's suite check
at `:218`). But their own prose then described a third gap in detail: brief
step 8 of the mutation pass now reads `mutationRoundsRun` from
`checklist.json` explicitly ("Read the count from the file, not from memory
of this session"), not just the informational paragraph after it that I
added in round 2. Diffing the current file against the current brief
confirmed step 8's own line (`8. No survivors, or \`limits.mutationRounds\`
reached → done.`) still didn't match the brief's updated wording. Given this
round's entire premise is "a fix that only reached the document isn't a
fix," and the coordinator explicitly flagged this clause as mattering for
the same reason, I applied it as a third edit rather than skip it on a
literal reading of "two." Flagging this rather than silently expanding
scope: if three edits weren't intended, the third one is easy to revert.

**Edits applied**, each transcribed verbatim from `task-8-brief.md` and
reflowed only for line width (same method as round 2 — `fmt` calibrated
against the file's own untouched paragraphs, wrapped at the file's
established ~120–132 char width):

1. Escalation (was line 258): "a second guardrail violation by the same
   agent" → "a guardrail violation by the same agent beyond
   `limits.violationRetries` re-dispatches", now agreeing with Red's audit
   loop (`:105–107`) instead of only matching it by coincidence at the
   fixture's current default of 1.
2. Mutation pass step 5 (was line 218): "Re-run the full suite. It must be
   green." → "Re-run the full suite, **subtracting `knownRed`**...", closing
   the last orchestrator-side suite check that didn't subtract it.
3. Mutation pass step 8 (was line 226): "No survivors, or
   `limits.mutationRounds` reached → done." → "No survivors, or
   `mutationRoundsRun` (read from `checklist.json`) has reached
   `limits.mutationRounds` → done. Read the count from the file, not from
   memory of this session...".

**Verification performed:**

- Whitespace-normalized substring check (same method as round 2): all three
  new passages present verbatim in the patched file; all three superseded
  passages (`grep -c` for each) return `0` — fully replaced, not duplicated.
- `grep -n "must be green\|second guardrail" skills/run-tdd-cycle/SKILL.md`
  → **no output**, as required.
- `grep -n knownRed skills/run-tdd-cycle/SKILL.md` → confirms all three
  orchestrator-side suite-check sites reference it: Green's full-suite check
  (`:132`, "subtracting `knownRed`"), the Refactor dispatch line (`:173`,
  "pass the trigger, the source paths in scope, and `knownRed`" — Refactor's
  own suite check lives inside `agents/tdd-refactor.md` and needs `knownRed`
  handed to it rather than an orchestrator-side "subtracting" clause of its
  own), and the mutation pass's full-suite check (`:218`, "subtracting
  `knownRed`").
- Re-ran the four vacuous-pass safeguard greps from every prior round
  (empty-diff audit, empty-checklist completion, probe-error-fails-closed,
  `mutantsAttempted: 0`) — all four still present, exactly once each,
  unmoved by this round's edits.
- `bash tests/run.sh` → **171 passed, 0 failed**, unchanged.
- `git status --short` / `git diff --stat`: only
  `skills/run-tdd-cycle/SKILL.md` changed (8 insertions, 5 deletions).
  `git diff commands/tdd.md` empty — confirmed untouched.

No new concerns beyond the "two vs. three edits" note above, and the
standing concerns from round 2 (brief's naming still disagrees with the
repo's `run-tdd-cycle` rename) remain open and unrelated to this round's
changes.

Commit: `70c9d52` — `fix(skill): parameterize escalation retry count, close
last two knownRed gaps`. Scoped `skill` per `AGENTS.md`.

## Fix round 4

**Correction accepted from the coordinator's message:** my round-3 report
said three dispatches pass `knownRed` (Green, Refactor, Mutate). The
coordinator corrected this: it's two dispatches (Refactor, Mutate) — Red
never checks full-suite state, and Green's full-suite check is
orchestrator-side, not a dispatch. My round-3 text conflated "orchestrator-
side suite check that subtracts `knownRed`" (three: Green's, the mutation
pass's, and — differently shaped — Refactor's own internal check fed by the
dispatch) with "dispatch that passes `knownRed`" (two: Refactor, Mutate).
The shipped file was correct throughout; only my summary wording overstated
it. Noting this here since the report is meant to be an accurate record.

**This round's fix**, per the coordinator: the re-review closed all three
prior findings but flagged one non-blocking residual — `mutationRoundsRun`
is read (step 8) and incremented (former trailing paragraph) but was never
declared in the Decompose schema, so on a fresh run the field doesn't exist
until the mutation pass first touches it. Same shape as the original
`knownRed` defect (a value named in prose, absent from the declared
structure). The coordinator chose to fix rather than defer it.

**Two edits applied**, both transcribed verbatim from `task-8-brief.md` and
reflowed only for line width (same `fmt`-calibrated method as prior rounds):

1. Decompose schema: added `"mutationRoundsRun": 0,` between `knownRed` and
   `items`, plus a new paragraph explaining why ("Write `mutationRoundsRun`
   at decompose time, initialised to `0`... a value that exists in prose but
   not in the schema is one nobody has to account for").
2. Mutation pass: the trailing paragraph "Record the completed round
   count..." became numbered step 9 ("Increment `mutationRoundsRun` in
   `checklist.json` and write the file."), followed by a short paragraph
   explaining why it's numbered rather than trailing advice.

**Verification performed:**

- Whitespace-normalized substring check: all four new/changed strings
  (`"mutationRoundsRun": 0,`, the Decompose explanatory paragraph, step 9's
  text, and its follow-up sentence) present verbatim in the patched file.
- `grep -c "Record the completed round count in"` → `0` — old trailing-advice
  paragraph fully replaced, not duplicated alongside the new step 9.
- Decompose schema block now contains `mutationRoundsRun` between `knownRed`
  and `items`, matching the brief's field order.
- Mutation pass numbers 1–9 contiguously (confirmed by `grep -n "^[0-9]\."`
  within the section: 1, 2, 3, 4, 5, 6, 7, 8, 9 — no gaps).
- Step 8 unchanged by this round and still reads: "No survivors, or
  `mutationRoundsRun` (read from `checklist.json`) has reached
  `limits.mutationRounds` → done. Read the count from the file, not from
  memory of this session..." — confirms it still reads from disk, not
  session memory, as required.
- Re-ran the four vacuous-pass safeguard greps from every prior round — all
  four still present, exactly once each, unmoved by this round's edits.
- `bash tests/run.sh` → **171 passed, 0 failed**, unchanged.
- `git status --short` / `git diff --stat`: only
  `skills/run-tdd-cycle/SKILL.md` changed (8 insertions, 3 deletions).
  `git diff commands/tdd.md` empty — confirmed untouched.

No new concerns. The coordinator indicated this closes Task 8.

Commit: `5b768ef` — `fix(skill): declare mutationRoundsRun in checklist
schema`. Scoped `skill` per `AGENTS.md`.

## Fix round 5

Two defects found by actually running `/tdd`, not by reading: (1) `git
checkout -- .` doesn't revert new files, and a rejected `passing-flat` test
was confirmed live to survive it; (2) `commands/tdd.md` depended on `$1`
substitution that did not occur when the coordinator invoked it through the
skill tool (the path arrived as a trailing `ARGUMENTS:` line, `$1` stayed
the literal string `$1`), so the "if empty" branch could never fire.

**Applied verbatim:**

1. Inserted a new `## Reverting a dispatch` section into
   `skills/run-tdd-cycle/SKILL.md`, positioned exactly where the brief put
   it — after the Decompose section's closing `status` paragraph, before
   `## Coverage baselines`. Defines revert as `git checkout --
   <role's write globs>` (restore tracked edits) plus `git clean -fd --
   <role's write globs>` (remove new files), both scoped to `globs.test`
   for Red and `globs.source` for Green/Refactor/Mutate, and states that
   every existing "revert" or `git checkout -- .` reference in the file
   means this pair. Reflowed prose to the file's width; the two-command
   code block's 4-space indent and inline `#` comments preserved exactly
   (verified with an exact, non-normalized substring match, not just the
   whitespace-normalized check used for prose).
2. Rewrote two lines of `commands/tdd.md`: "Implement the specification at
   `` `$1` `` using the TDD subagent workflow." → "Implement the
   specification whose path was given as this command's argument, using
   the TDD subagent workflow.", and "If `` `$1` `` is empty, ask the user
   which spec to implement." → "If no path was given, ask the user which
   spec to implement." The middle paragraph (skill reference, preflight
   reminder) was untouched by the brief and untouched by me.

**A contradiction found and not silently resolved: the requested grep
check cannot return empty for any faithful transcription of this brief,
and I did not force it to.** The coordinator's instructions said `grep -n
'checkout -- \.' skills/run-tdd-cycle/SKILL.md` should return nothing, with
each former site "pointing at the new section." I checked the brief's
fenced Red/Green text against what was already in the file before this
round's edit — it is byte-identical. The brief does not rewrite any of the
five individual branch sites (Red's audit violation, Red's `passing-flat`
branch, Green's independent-verify failure, Green's full-suite regression,
Green's coverage-gate rejection); it only adds the defining section. Worse,
the new section's own closing sentence — "Wherever a branch below says
'revert' or `` `git checkout -- .` ``, it means this pair" — is written as
a backward reference that *requires* those five literal strings to still
exist below it; deleting them would leave that sentence pointing at nothing.
So the grep, run after a verbatim transcription, returns **8 hits**, not 0:
the 5 original branch sites plus 3 occurrences inside the new section
itself (which necessarily discusses the string it's redefining). I did not
invent alternate wording at the 5 sites to force the grep to pass — that
would mean authoring prose the brief doesn't contain, the same class of
silent, unrequested rewrite I've been avoiding all task. Recommend
confirming whether "definition by reference, sites unchanged" is the
intended design (which is what the brief's fenced text describes) or
whether per-site rewrites were actually wanted, in which case that's a
brief change, not something for me to author unilaterally.

**Two more stale references found while verifying, unrelated to this
round's edits and not fixed:**

1. Preflight item 1 still reads "The audit's revert is `` `git reset
   --hard` ``" — but the audit's actual revert (Red's and Green's
   `git checkout -- .` branches) is now the checkout+clean pair per the
   new section, not `git reset --hard`. The clean-tree preflight rationale
   still holds in effect (`git clean -fd` destroys untracked work just as
   surely as `git reset --hard` would), so nothing is functionally wrong,
   but the sentence now names a command none of the audit paths use.
2. The new section lists `globs.source` scoping for "Green, Refactor and
   Mutate," but Refactor's hard-coverage-gate revert, its `reverted`-outcome
   tree verification, and Mutate's dirty-tree revert all use unscoped
   `git reset --hard HEAD` (confirmed: three occurrences, unchanged by this
   round). Only Green's sites actually use the (now redefined)
   `git checkout -- .` the new section governs. The section's glob-scoping
   promise for Refactor and Mutate doesn't correspond to any site that
   would apply it — not a defect in outcome (a full-tree hard reset is at
   least as safe as a scoped clean), but a mismatch between what the new
   section says applies to those two roles and what their actual recovery
   commands are.

**Verification performed:**

- Whitespace-normalized substring check: all 3 new prose passages in
  `SKILL.md` and both changed lines in `commands/tdd.md` present verbatim.
- Exact (non-normalized) substring check for the two-command code block —
  confirmed indentation and inline comments preserved byte-for-byte.
- `grep -n 'checkout -- \.' skills/run-tdd-cycle/SKILL.md` → **8 hits**,
  reported above as expected-and-required, not as a leftover failure.
- New section confirmed to name both commands (`git checkout --`, `git
  clean -fd --`) and the scoping requirement (`globs.test` for Red,
  `globs.source` for Green/Refactor/Mutate, with the "unscoped `git clean
  -fd` would delete legitimately untracked work" rationale).
- `grep -n '\$1' commands/tdd.md` → no output; `$1` fully removed.
- Re-ran the four vacuous-pass safeguard greps from every prior round —
  all four still present, exactly once each, undisturbed by this round's
  insertion (which landed in a different section from all four).
- `bash tests/run.sh` → **171 passed, 0 failed**, unchanged.
- `git status --short` / `git diff --stat`: exactly
  `skills/run-tdd-cycle/SKILL.md` (17 insertions) and `commands/tdd.md`
  (2 insertions, 2 deletions) changed. Nothing else touched.
- Frontmatter re-checked on both files (`name`/`description` on SKILL.md,
  `description`/`argument-hint` on tdd.md) — unaffected by this round's
  edits.

Commits: `0ba03eb` — `fix(skill): define revert as checkout+clean, not
bare checkout`; `35e2aeb` — `fix(command): stop depending on $1
substitution`. Split by scope per `AGENTS.md`, matching the pattern
established in round 1.

## Fix round 6

All three round-5 concerns were confirmed correct and addressed in this
round's brief:

1. The unsatisfiable grep was a bad check on the coordinator's side, not a
   defect in my transcription — acknowledged, not something I needed to redo.
2. Preflight item 1 no longer names a command at all; it refers to the
   section by name.
3. `git reset --hard HEAD` (Refactor's coverage gate, Refactor's
   incomplete-restore check, the mutation pass's tree-clean recovery) has
   the identical untracked-file blind spot as `git checkout -- .`, verified
   by the coordinator. The mutation-pass instance is the sharpest: the
   dirty-tree detector (`git status --porcelain`) does see untracked files,
   but the recovery command it triggers cannot remove them.

**Design change applied, all transcribed verbatim from `task-8-brief.md`
and reflowed only for line width:** the "Reverting a dispatch" section now
defines two shapes — `git checkout -- <globs>` + `git clean -fd -- <globs>`
for tracked-file discards, and `git reset --hard HEAD` + `git clean -fd --
<globs>` for resets to HEAD — and, critically, **every point-of-use site
that previously named a bare command now says "revert" or "reset and
clean" and points at the section instead.** That's the substantive fix:
round 5 added the section but left the five `git checkout -- .` sites
reading the literal, ineffective command; this round rewrote all eight
sites (5 `checkout` + 3 `reset --hard`) to name the pattern, not the
command.

**Sites changed**, each verified present verbatim via whitespace-normalized
substring check against the brief:

- Preflight item 1 (was: "The audit's revert is `git reset --hard`") → now
  refers to the section without naming a command.
- Red step 2, audit violation (was `git checkout -- .`) → **revert**.
- Red step 3, `passing-flat` branch (was `git checkout -- .`) → **revert**.
- Green step 4, independent-verify failure (was `git checkout -- .`) →
  revert (whole clause already bold, so "revert" itself isn't separately
  bolded — matches the brief's own formatting exactly).
- Green step 5, full-suite regression (was `git checkout -- .`) → **revert**.
- Green step 6, coverage-gate "Over" bullet (was `git checkout -- .`) →
  **revert**.
- Refactor's hard coverage gate (was `git reset --hard HEAD`) → **reset and
  clean**.
- Refactor's `reverted`-outcome verification (was `git reset --hard HEAD`,
  gated only on `git diff HEAD`) → **reset and clean**, and the check
  itself gained a `git status --porcelain` requirement alongside `git diff
  HEAD` — a real content addition, not just a wording swap: an incomplete
  restore that left an untracked file would previously pass this check on
  a clean diff alone.
- Mutation pass step 4, tree-not-clean recovery (was `git reset --hard
  HEAD`) → **reset and clean**.

Two of these (Refactor's `reverted` check and Mutation step 4) had drifted
slightly from earlier rounds' exact wording during the round-2 paraphrase
rewrite ("instead of `git checkout`" vs. the brief's "not `git checkout`";
"If the tree is not clean →" vs. the brief's "Not clean →") — since both
sites needed substantive edits anyway this round, I used the brief's exact
current wording rather than patching only the command name and leaving the
stale phrasing around it.

**Verification performed, reporting line numbers and role rather than a
bare count per the request** (a count can't distinguish explanation from
instruction, which is exactly what tripped the round-5 check):

`grep -n 'checkout -- \.\|reset --hard' skills/run-tdd-cycle/SKILL.md` →
6 hits, **all inside the "Reverting a dispatch" section (lines 78–106)**,
none elsewhere:
- Line 80–82: explaining why bare `git checkout -- .` is insufficient
  (the section's own justification, quoting the command it's replacing).
- Line 90–94: explaining `git reset --hard HEAD`'s identical blind spot and
  showing the reset+clean pair.
- Line 105: the closing sentence explaining why point-of-use sites don't
  name the bare command.

One more hit outside that range worth naming explicitly: line 225,
"restores by rewriting recorded text with `Edit`/`Write`, not `git
checkout`" — this names `git checkout` but as a negation describing what
Refactor's restore mechanism does *not* use (it restores via `Edit`/`Write`
from recorded text, never `git checkout` at all), not as a revert
instruction of the kind this round targets. Confirmed this matches the
brief's own wording exactly (`task-8-brief.md:236`).

Confirmed 8 point-of-use sites now say **revert** or **reset and clean**
and cite "(see *Reverting a dispatch*)": lines 140, 152, 164, 168, 173
(revert — Red ×2, Green ×3) and 210, 227, 250 (reset and clean — Refactor
×2, Mutate ×1). Zero point-of-use sites name a bare git command.

- Whitespace-normalized substring check: all 12 new/changed passages
  present verbatim (the section's 4 paragraphs plus the closing sentence,
  and the 8 point-of-use rewrites... consolidated to distinct wordings
  where several sites share phrasing).
- Exact (non-normalized) check on both code blocks in the section —
  indentation and inline `#` comments preserved byte-for-byte on the first
  block; the second (reset+clean) block has no inline comments in the
  brief and none were added.
- Re-ran the four vacuous-pass safeguard greps from every prior round — all
  four still present, exactly once each, undisturbed.
- `bash tests/run.sh` → **171 passed, 0 failed**.
- `git status --short` / `git diff --stat`: only
  `skills/run-tdd-cycle/SKILL.md` changed (34 insertions, 22 deletions).
  `git diff commands/tdd.md` empty — confirmed untouched, as expected since
  round 5 (`35e2aeb`) already covered it.
- Frontmatter re-checked, unaffected.

No new concerns.

Commit: `68f563d` — `fix(skill): stop naming bare revert commands at point
of use`. Scoped `skill` per `AGENTS.md`.

## Fix round 7

Final wording fix per the coordinator's re-review: the "Scope both to the
globs..." sentence told the reader to scope *both* revert commands, but
`git reset --hard` cannot take a pathspec at all — `git reset --hard --
<path>` fails with `fatal: Cannot do hard reset with paths.` The code
blocks were already correct (no pathspec on `reset --hard` in either),
so this was prose contradicting a block sitting right next to it — a
reader reconciling the two would try the scoped form the prose implied
and hit a fatal error.

**Applied verbatim**, replacing the single old sentence with the brief's
two new paragraphs (reflowed only for line width):

1. "**Only the `clean` half takes a pathspec.**" — scopes `clean` to the
   role's write globs as before, and adds the previously-unstated
   `-x` caveat: `clean` without `-x` spares gitignored paths (venv,
   checklist, coverage report), so don't add it.
2. "`git reset --hard` is tree-wide and **cannot** be scoped" — states the
   `fatal: Cannot do hard reset with paths.` failure directly, and explains
   why tree-wide is safe here: preflight requires a clean tree and exactly
   one agent writes per dispatch, so the only tracked changes a tree-wide
   reset discards are that dispatch's own.

**Verification performed:**

- Whitespace-normalized substring check: both new paragraphs present
  verbatim in the patched file.
- `grep -c` for the old superseded sentence ("Scope both to the globs that
  role may write...") → `0`, fully replaced.
- Both code blocks (checkout+clean, reset+clean) confirmed byte-identical
  to before via exact (non-normalized) substring match — this round was
  prose-only, as instructed, and the check confirms neither block moved.
- Section now explicitly states `reset --hard` is tree-wide and cannot be
  scoped, and that only `clean` takes a pathspec — both requested
  confirmations hold on inspection of the rendered section text.
- Re-ran the four vacuous-pass safeguard greps from every prior round —
  all four still present, exactly once each, undisturbed.
- `bash tests/run.sh` → **171 passed, 0 failed**.
- `git status --short` / `git diff --stat`: only
  `skills/run-tdd-cycle/SKILL.md` changed (8 insertions, 2 deletions).
  `git diff commands/tdd.md` empty — confirmed untouched.
- Frontmatter re-checked, unaffected.

No new concerns. This closes Task 8 per the coordinator.

Commit: `1a54980` — `fix(skill): git reset --hard cannot take a pathspec,
stop implying it can`. Scoped `skill` per `AGENTS.md`.

## Fix round 8

Three defects found by running the mutation pass end to end for the first
time, all in the plan and not yet in the shipped `SKILL.md`. All three
applied verbatim from `task-8-brief.md`, reflowed only for line width.

**Finding 1 (Critical) — the three-way Red rule discarded exactly the test
that closed a mutation gap.** A surviving mutant means the source is
already correct and the test that missed it is weak; Red's new test for
that behavior therefore necessarily passes and necessarily moves no
coverage (the line was already executed by the assertion-free test that
let the mutant survive). Applied unchanged, the rule classified every
mutation-origin item `passing-flat`, discarded the test, and the next
mutation round would rediscover the identical survivor — the loop could
run to `limits.mutationRounds` having fixed nothing it found. The `Red`
section's `passing-flat` bullet now carries an exception for items with
`origin: "mutation"`: ignore the coverage delta, apply each mutation
recorded in the item's `mutant` field to the source, run Red's new test,
confirm it **fails**, then restore — the orchestrator can do this because
it is unconstrained, unlike Red, which may not write source. All
mutations killed → commit `test:`, status `done`. Any surviving →
re-dispatch once naming it; still surviving → `blocked`.

**Finding 2 (Critical) — restoring source does not invalidate the
language's compiled cache.** `git status` calls the tree clean because
caches are gitignored, while the interpreter still holds bytecode compiled
from the mutated source. The coordinator observed this live as a failure
whose traceback showed source that could not produce it; clearing
`__pycache__` returned the suite to green. A false red is the lucky
outcome — the same mechanism can serve a false green from a cache compiled
before a bad restore, exactly where step 5's post-mutation suite check
would believe it. Added two paragraphs between step 3 (dispatch) and step
4 (verify tree clean) of the mutation pass: the general rule (a restore
isn't complete until the cache is too — other toolchains have their own
caches), and the Python-specific mitigation
(`PYTHONDONTWRITEBYTECODE=1` prefixed onto the configured commands,
verified to suppress `__pycache__` and to still satisfy the guard's Bash
allowlist).

**Finding 3 (Important) — survivors must be grouped by behavior before
becoming checklist items.** The first live pass returned 4 survivors of
which 3 were one gap (`divide`'s error message unasserted, so mutating it
to `None`, to an `XX`-wrapped string, and to upper case all survived); one
test closes all three, but "for each survivor, append a checklist item"
taken literally would have queued three near-identical Red cycles. Step 6
now reads "**Group survivors by `missingBehavior` first**, then append one
checklist item per distinct behavior," keeps every mutant in the item's
`mutant` field as evidence, and reports the survivor count rather than the
item count.

**A minor pre-existing wording gap noticed while applying Finding 3, not
fixed:** the checklist-item JSON schema shown under step 6 still shows a
single `"mutant": { "file": ..., "line": ..., "mutation": ... }` object,
unchanged from before grouping was introduced — but the prose now says to
"keep *every* mutant in the item's `mutant` field as evidence" (plural),
which for a grouped item with 3 contributing mutants would need `mutant`
to hold multiple entries, not one object. The brief's own schema example
wasn't updated to reflect the plural case it now describes. Not fixed,
since this round's instructions were to apply the brief's wording, and the
schema example is unchanged brief text — flagging per the established
pattern rather than silently reshaping the JSON myself.

**Verification performed:**

- Whitespace-normalized substring check: all 9 new/changed passages across
  the three findings present verbatim in the patched file.
- `grep -c` for both superseded passages (the old unconditional
  `passing-flat` bullet, the old "For each survivor, append a checklist
  item:" lead-in) → `0` each, fully replaced.
- Red's `passing-flat` branch confirmed to carry the `origin: "mutation"`
  exception and the full kill-verification procedure (apply → run → confirm
  fails → restore; all-killed → done; any-surviving → re-dispatch once →
  still-surviving → blocked).
- The cache-invalidation paragraphs confirmed sitting between mutation pass
  step 3 (dispatch) and step 4 (verify tree clean), matching the brief's
  placement exactly.
- Step 6 confirmed to open with "**Group survivors by `missingBehavior`
  first**..." and to keep the same JSON schema block, now introduced by
  "For each distinct behavior, append:" rather than "For each survivor,
  append a checklist item:".
- Re-ran the four vacuous-pass safeguard greps from every prior round — all
  four still present, exactly once each, undisturbed (none of this round's
  insertions landed near them).
- `bash tests/run.sh` → **171 passed, 0 failed**.
- `git status --short` / `git diff --stat`: only
  `skills/run-tdd-cycle/SKILL.md` changed (36 insertions, 2 deletions).
  `git diff commands/tdd.md` empty — confirmed untouched.
- Frontmatter re-checked, unaffected.

No new concerns beyond the schema/prose mismatch noted above.

Commit: `794a8ee` — `fix(skill): fix mutation-origin Red items, cache
invalidation, survivor grouping`. Scoped `skill` per `AGENTS.md`.

## Fix round 9

**Flagged before applying, resolved by cross-referencing a second source:**
the coordinator's message quoted the intended new step-6 schema (`"mutant":
{ "file": ..., "line": ..., "mutations": [ ...every mutant that revealed
this gap... ] } }`) and said "the brief's step 6 schema now reads" that
text. I re-read `task-8-brief.md` as instructed and it did **not** contain
this text — line 288 still showed the old singular
`"mutant": { "file": ..., "line": ..., "mutation": ... } }`, byte-identical
to what I transcribed in round 8. This is the same failure shape the
coordinator named explicitly in round 3 ("I committed the fix to the plan
document ... and went straight to re-review without dispatching you to
apply it — so I reported a fix that never reached the shipped file"),
recurring one level upstream: the plan document was fixed and committed
(`git log` shows `7cadbc3 fix(plan): the grouped item's evidence field is
plural`, and `docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md:2416-2417`
has the plural array), but `task-8-brief.md` — the file I'm told each round
to re-read as the authoritative source — was not regenerated from it this
time.

I did not stop on this, because the two independent sources I could check
(the coordinator's direct quote in their message, and the plan document's
actual committed text) agreed exactly, character for character, including
the two-line wrapping of the `"mutant"` object. Given that agreement, I
took the intended text as unambiguous and applied it, rather than either
inventing my own resolution or blocking the final round of a nine-round
task over a brief-regeneration gap that doesn't change what to write.
Flagging it here because it's a real gap between what "re-read the brief"
was supposed to hand me and what the file actually contained, and it's
possible other rounds' brief files had similarly lagged in ways that
happened to not matter (every other round this session, the file I
re-read did contain the quoted/described changes — this is the first
round where it didn't).

**Applied**, using the plan document's exact text since it matched the
coordinator's quote precisely: replaced the step 6 schema's
`"mutant": { "file": ..., "line": ..., "mutation": ... } }` with

    "mutant": { "file": ..., "line": ...,
                "mutations": [ ...every mutant that revealed this gap... ] } }

**Verification performed:**

- `bash tests/run.sh` → **171 passed, 0 failed**.
- Step 6 schema confirmed to use the plural `mutations` array (shown above,
  read directly from the patched file).
- `git diff skills/run-tdd-cycle/SKILL.md` shows exactly one hunk, 2
  insertions / 1 deletion, touching only the `"mutant"` line — nothing else
  in the file changed.
- `git status --short` / `git diff --stat`: only
  `skills/run-tdd-cycle/SKILL.md` changed. `git diff commands/tdd.md`
  empty — confirmed untouched.
- Frontmatter re-checked, unaffected.

No other concerns. This closes Task 8 per the coordinator.

Commit: `5c870c8` — `fix(skill): the grouped survivor item's evidence
field is plural`. Scoped `skill` per `AGENTS.md`.
