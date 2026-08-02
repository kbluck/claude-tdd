# Task 7 report: `/tdd-init`

## Files created

- `commands/tdd-init.md` — the slash command, copied verbatim from the brief's Step 1 code block.
- `tests/config-contract.test.sh` — the contract test, copied verbatim from the brief's Step 1b code block.

Both files were verified byte-identical to the brief with `diff` against the
exact line ranges of the brief's fenced code blocks (`sed -n '23,187p'` and
`sed -n '202,237p'` of `task-7-brief.md` respectively, diffed against the
created files) — both diffs were empty (exit 0).

`head -3 commands/tdd-init.md`:

```
---
description: Detect the project's toolchain and write .tdd/config.json for the TDD cycle
---
```

Matches the expected shape (opens with `---`, a `description:` line, then `---`).

## `bash tests/run.sh` — before (97 passed, 0 failed)

Captured with `tests/config-contract.test.sh` temporarily moved out of the
tests directory, to get a true pre-change baseline rather than a `tail`:

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

97 passed, 0 failed
```

## `bash tests/run.sh` — after (119 passed, 0 failed)

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

119 passed, 0 failed
```

Delta: +22 assertions (16 non-null-key checks + 3 "declares key" checks + 3
"is an array" checks = 22), all in `config-contract.test.sh`. 97 + 22 = 119.

## Bite check

Procedure: backed up `tests/fixtures/config.json` to the scratchpad, confirmed
`git diff --stat tests/fixtures/config.json` was empty beforehand, ran
`jq 'del(.globs.source)' tests/fixtures/config.json > tmp && mv tmp
tests/fixtures/config.json` to delete the key in place, ran the suite, then
restored with `git checkout -- tests/fixtures/config.json`.

Result: **103 passed, 16 failed**. Only 2 of the 16 failures originate in
`config-contract.test.sh` itself — the other 14 are collateral in
`guard.test.sh`, because `guard.sh` reads the same fixture at runtime and
`tdd_path_verdict` now sees a malformed config (`globs.source` missing) and
denies every dispatch it's asked to judge. This is exactly the failure mode
Task 7's design notes describe: an unclassified/missing source glob silently
removes read isolation, and here it shows up as the guard failing closed
across the board rather than staying silent. `rules.test.sh` was unaffected
(it doesn't read the fixture).

```

--- config-contract.test.sh ---
  ...
  PASS: config has non-null globs.test
  FAIL: config has non-null globs.source
    expected: yes
    actual:   no
  PASS: config has non-null globs.ignore
  ...
  PASS: globs.test is an array
  FAIL: globs.source is an array
    expected: array
    actual:   null
  PASS: globs.ignore is an array

--- guard.test.sh ---
  ...
  FAIL: red writing a test is permitted
    expected: 0|
    actual:   2|{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"tdd guard: .tdd/config.json is malformed (globs.source)"}
  ...
  (14 guard.test.sh assertions fail the same way, all citing
  "tdd guard: .tdd/config.json is malformed (globs.source)")

103 passed, 16 failed
```

Full failing-run output is preserved at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/bite-check-output.txt`
(scratchpad, not part of the repo).

After restoring:

```
git diff --stat tests/fixtures/config.json
(empty output)
```

Re-running the suite after restore returned to `119 passed, 0 failed`, and a
byte-for-byte `diff` against the pre-bite-check backup copy of the fixture was
empty — the file is restored exactly, not just structurally equivalent (the
in-place `jq` edit reformatted whitespace; `git checkout` undid that too).

## Fixture unmodified

```
$ git diff --stat tests/fixtures/config.json
(no output — clean)
```

Confirmed both immediately after the bite-check restore and again after the
final commit.

## Commit

```
4175db4 feat(plugin): add /tdd-init toolchain detection and config setup
 2 files changed, 201 insertions(+)
 create mode 100644 commands/tdd-init.md
 create mode 100644 tests/config-contract.test.sh
```

Single commit, both files. `git status --short` after the commit: empty (clean
tree). This report lives under `.superpowers/`, which is listed in
`.gitignore` (`git check-ignore -v .superpowers/` confirms the match), so
writing it does not leave the tree dirty.

**Deviation from the brief's literal Step 3 instructions, and why:** the brief's
Step 3 shows `git add commands/tdd-init.md` only, committing the command file
alone under an unscoped message (`"feat: /tdd-init toolchain detection and
config setup"`). I did not follow that literally, for two reasons:

1. AGENTS.md (project instructions, which override default behavior) requires
   a scope on every commit type except `chore`, and requires combining a
   commit's files under "the same type and scope" rather than splitting
   mechanically-related work. Existing history bears this out exactly:
   `4f8d2bd feat(hooks): bash allowlist with delta-scoped metacharacter ban`
   and `34e9095 feat(hooks): implement PreToolUse guard enforcing role
   boundaries` both bundle their `tests/*.test.sh` file into the same `feat`
   commit as the implementation, rather than a separate `test` commit.
2. Committing only `commands/tdd-init.md` would leave
   `tests/config-contract.test.sh` uncommitted/untracked, which is itself a
   dirty-tree condition — the exact failure class the brief warns about
   elsewhere ("`/tdd`'s preflight refuses to start against a dirty tree").

I used scope `plugin` rather than inventing a new `command` scope. AGENTS.md's
scope list (`spec, plan, plugin, hooks, agent`) reads as a closed enumeration,
and `plugin` is the demonstrated catch-all for new top-level additions that
don't fit the other four (`feat(plugin): add plugin manifest`,
`test(plugin): add zero-dependency test harness`). See concerns below —
`command` would also be a defensible, arguably more precise choice by analogy
with `agent`/`agents/` and `hooks`/`hooks/`, and AGENTS.md's scope list may be
due for an update now that `commands/` exists as a component directory.

## Concerns

1. **Spec-vs-consumer seam defect in the command file's own Step 7, found
   while cross-checking against the contract test I just added.** The
   `.tdd/config.json` JSON template shown in `commands/tdd-init.md` Step 7
   (which I was instructed to reproduce verbatim, and did) omits six keys
   that `tests/config-contract.test.sh` — added in this same task, same
   commit — requires to be present:
   - `crapMode`
   - `refactorTriggers.maxCrap`
   - `limits.mutationRounds`
   - `limits.mutantsPerPass`
   - `commands.complexity` (must be present, may be null)
   - `commands.mutation` (must be present, may be null)

   `tests/fixtures/config.json` (the reference shape) already includes all
   six, so the contract test itself is correct and passes today. But an
   agent following Step 7 of `commands/tdd-init.md` literally — copying the
   example template's key set rather than reading it as illustrative — would
   write a config missing six keys and fail the contract test shipped in the
   same commit. This is exactly the class of defect the brief calls out
   ("every defect in this project so far has landed at exactly that kind of
   seam"). I did not fix it: both files were required to be reproduced
   verbatim from the brief, and silently editing the Step 7 template would
   violate that instruction. Flagging for whoever owns the brief/plan next.

2. **Scope-list gap.** AGENTS.md's scope enumeration (`spec, plan, plugin,
   hooks, agent`) has no entry for the new `commands/` directory this task
   introduces. I used `plugin` (see Commit section above) but `command` is
   arguably more consistent with the `agent`/`agents/`, `hooks`/`hooks/`
   pattern. Worth a deliberate decision and a CLAUDE.md/AGENTS.md update
   rather than each task guessing.

3. Everything else — the glob-partition-exhaustiveness step, the empty
   `git ls-files` caveat, the empty/whitespace-only static-prefix refusal, the
   degradation-reporting table — was reproduced verbatim per instructions and
   not independently exercised against a real target project in this task
   (Task 7 only authors the command file and its schema contract test; running
   `/tdd-init` against a live project is implicitly Task 8's preflight /
   later integration-test territory, not something this brief asked for).

## Fix round 1

The coordinator confirmed Concern 1 above (six schema keys missing from the
`/tdd-init` config template) and corrected the brief:
`.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md`. Two
changes landed there:

1. Step 7's JSON template now writes every key, including null-valued ones
   (`commands.complexity`, `commands.mutation`), plus a new paragraph
   explaining why an absent key and a `null` value are not interchangeable.
2. `tests/config-contract.test.sh` gained a third loop that asserts every
   schema key name literally appears in `commands/tdd-init.md`'s text, so the
   template and the fixture — two copies of the same schema — cannot drift
   silently again.

### What changed

Re-extracted both files verbatim from the corrected brief:

```
B=.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md
sed -n '23,201p' "$B" > commands/tdd-init.md
sed -n '216,265p' "$B" > tests/config-contract.test.sh
```

Verified byte-identical with `diff` against the same line ranges (both exits
0, both diffs empty — same verification method as the original task).

`head -3 commands/tdd-init.md` / `tail -5 commands/tdd-init.md` confirm the
frontmatter shape is intact and Step 9 ("Confirm") is still the closing
section.

### `bash tests/run.sh` after the fix — 133 passed, 0 failed

(97 baseline + 22 original contract assertions + 14 new
template-names-key assertions = 133; the new loop iterates 14 key names:
`version crapMode complexity mutation maxCrap duplicateThreshold
maxFunctionLines greenAttempts violationRetries mutationRounds
mutantsPerPass greenMaxNewUncovered refactorMaxNewUncovered ignore`.)

```
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
  PASS: tdd-init's config template names version
  PASS: tdd-init's config template names crapMode
  PASS: tdd-init's config template names complexity
  PASS: tdd-init's config template names mutation
  PASS: tdd-init's config template names maxCrap
  PASS: tdd-init's config template names duplicateThreshold
  PASS: tdd-init's config template names maxFunctionLines
  PASS: tdd-init's config template names greenAttempts
  PASS: tdd-init's config template names violationRetries
  PASS: tdd-init's config template names mutationRounds
  PASS: tdd-init's config template names mutantsPerPass
  PASS: tdd-init's config template names greenMaxNewUncovered
  PASS: tdd-init's config template names refactorMaxNewUncovered
  PASS: tdd-init's config template names ignore
  PASS: globs.test is an array
  PASS: globs.source is an array
  PASS: globs.ignore is an array
```

(All other test files' output is unchanged from the original task and is
omitted here for brevity; full output is in the scratchpad at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/bite2-restored.txt`.)

```
133 passed, 0 failed
```

### Bite check — new template assertions

Procedure: backed up `commands/tdd-init.md` to the scratchpad, then
`sed -i '' 's/maxCrap/XXXREMOVEDXXX/g' commands/tdd-init.md` to strip **every**
occurrence of the key name (the template mentions `maxCrap` twice — once in
the JSON example, once in the explanatory prose — so removing only one
occurrence would leave `assert_contains` still finding the string and the
bite check would prove nothing).

Result: **132 passed, 1 failed** — exactly the one new assertion for that key,
nothing else:

```
  PASS: tdd-init's config template names version
  PASS: tdd-init's config template names crapMode
  PASS: tdd-init's config template names complexity
  PASS: tdd-init's config template names mutation
  FAIL: tdd-init's config template names maxCrap
    expected to contain: maxCrap
    actual: --- description: Detect the project's toolchain [... full file
    text, no "maxCrap" remaining after the sed substitution ...]
  PASS: tdd-init's config template names duplicateThreshold
  PASS: tdd-init's config template names maxFunctionLines
  ...
132 passed, 1 failed
```

Restored with a straight copy from the scratchpad backup, verified
byte-identical with `diff` (empty), re-ran the suite:

```
133 passed, 0 failed
```

Full bite-check outputs preserved at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/bite2-fail.txt`
and `.../bite2-restored.txt` (scratchpad, not part of the repo).

### Fixture still untouched

```
$ git diff --stat -- tests/fixtures/config.json
(no output — clean)
```

This fix round never touched `tests/fixtures/config.json` — the drift was
between the template in `commands/tdd-init.md` and the fixture, and the
fixture was already correct (it has always had all six keys; that's why the
original contract test, which only checked the fixture, never caught this).

### Commit

```
89ec68d fix(command): write every schema key in tdd-init's config template
 2 files changed, 31 insertions(+), 3 deletions(-)
```

`git status --short` after commit: empty (clean tree). Scope `command` used
per the coordinator's update to AGENTS.md
(`command — the slash commands`, line 28). Type `fix` because this corrects a
defect in already-committed content, bundling the corresponding test
enhancement into the same commit per the same
combine-same-type-and-scope precedent used in the original commit.

### Concerns after fix round 1

None new. The six-key omission (original Concern 1) is resolved and now has
a regression test that provably bites (verified above). Original Concern 2
(scope-list gap) is resolved by the coordinator's AGENTS.md update; this
commit uses the new `command` scope.

## Fix round 2

The review found that the round-1 regression test ("template names X") only
half-worked: it did `_init_text=$(cat "$_init")` and grepped the *whole
file*. Seven of the fourteen key names (`crapMode`, `complexity`, `mutation`,
plus others) also appear in the prose of §2b/§2c (the detection and
degradation tables), so those assertions passed whether or not the key was
actually in the Step 7 JSON template — the exact copy a model reading the
command would copy from. The coordinator verified this directly: deleting
`"crapMode": "computed",` from the JSON block alone left the suite fully
green. Against the original six-key defect (fix round 1), this test would
have caught `maxCrap`, `mutationRounds`, `mutantsPerPass`, and missed
`crapMode`, `complexity`, `mutation` — a safeguard checking a different copy
than the one that matters.

The corrected brief made three changes:

1. **(Finding 1, Important)** Scope the haystack to the Step 7 block only:
   `_init_text=$(sed -n '/^## 7\. Write the files/,/^Append to/p' "$_init")`,
   plus a new leading assertion (`assert_contains "version" "$_init_text"
   "the Step 7 JSON block was located at all"`) so a heading rename doesn't
   fail silently or in a confusing heap with no explanation.
2. **(Finding 2, Minor)** Step 6 check 2's wording was backwards. It said
   trailing template text "will be treated as agent input and rejected."
   Traced against `tdd_bash_verdict`, the guard only checks the static
   prefix; trailing text like `--cov` in `pytest -q {testId} --cov` is never
   re-examined, so it is **unenforced**, not rejected — the agent may drop it
   silently. The brief now says the opposite of what it said before, and I
   reproduced that corrected text verbatim.
3. **(Finding 3, Minor)** The partition-exhaustiveness check (§4) is
   point-in-time and didn't say so. A new paragraph now states this
   explicitly: a directory added after `/tdd-init` runs matches none of the
   three globs, and since reads are a denylist, it becomes silently readable
   by Red — mitigated by `/tdd`'s preflight re-running the same check every
   run, so the user needs to know to re-run `/tdd-init` after restructuring.

### What changed

Re-extracted both files verbatim from the corrected brief:

```
B=.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md
sed -n '23,209p' "$B" > commands/tdd-init.md
sed -n '224,280p' "$B" > tests/config-contract.test.sh
```

Verified byte-identical with `diff` against the same line ranges immediately
after extraction, and again as a final check before committing (both exits
0, both diffs empty).

`head -3` / `tail -5` on `commands/tdd-init.md` confirm the frontmatter and
closing section are intact.

### `bash tests/run.sh` after the fix — 134 passed, 0 failed

One new assertion versus fix round 1's 133: `the Step 7 JSON block was
located at all`. All 14 "template names X" assertions and the new
block-location assertion:

```
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
  PASS: tdd-init's config template names version
  PASS: tdd-init's config template names crapMode
  PASS: tdd-init's config template names complexity
  PASS: tdd-init's config template names mutation
  PASS: tdd-init's config template names maxCrap
  PASS: tdd-init's config template names duplicateThreshold
  PASS: tdd-init's config template names maxFunctionLines
  PASS: tdd-init's config template names greenAttempts
  PASS: tdd-init's config template names violationRetries
  PASS: tdd-init's config template names mutationRounds
  PASS: tdd-init's config template names mutantsPerPass
  PASS: tdd-init's config template names greenMaxNewUncovered
  PASS: tdd-init's config template names refactorMaxNewUncovered
  PASS: tdd-init's config template names ignore
  PASS: globs.test is an array
  PASS: globs.source is an array
  PASS: globs.ignore is an array
```

```
134 passed, 0 failed
```

### Bite check 1 — the scoping fix (the case that passed vacuously before)

Backed up `commands/tdd-init.md`, then deleted line 153
(`      "crapMode": "computed",`) — the one occurrence inside the Step 7 JSON
block — with `sed -i '' '153d' commands/tdd-init.md`, leaving all four prose
occurrences of `crapMode` (§2c's degradation table, §2b's table and "Set
`crapMode`:" line) untouched. Confirmed with `grep -n crapMode
commands/tdd-init.md` that only the JSON-block occurrence was gone.

Result: **133 passed, 1 failed** — exactly the `crapMode` template assertion,
nothing else:

```
  PASS: the Step 7 JSON block was located at all
  PASS: tdd-init's config template names version
  FAIL: tdd-init's config template names crapMode
    expected to contain: crapMode
    actual: ## 7. Write the files

`.tdd/config.json`:

    {
      "version": 1,
      "commands": {
        "test": "...", "single": "...", "coverage": "...",
        "complexity": "...", "mutation": null
      },
      "globs": { "test": [...], "source": [...], "ignore": [...] },
      "refactorTriggers": { "maxCrap": 30, "duplicateThreshold": 3, "maxFunctionLines": 40 },
      "limits": {
        "greenAttempts": 3, "violationRetries": 1,
        "mutationRounds": 2, "mutantsPerPass": 20
      },
      "coverageGates": { "greenMaxNewUncovered": 2, "refactorMaxNewUncovered": 0 }
133 passed, 1 failed
```

This is the exact case that passed vacuously (133/0) under the round-1
whole-file grep, because `crapMode` still appeared four times in prose
outside the JSON block. The scoped haystack now catches it. Restored from
backup, verified byte-identical with `diff` (empty), re-ran the suite:
**134 passed, 0 failed.**

### Bite check 2 — the block-located assertion

First attempt used `## 7. Write the files (renamed)` — this still matched
the anchor regex `^## 7\. Write the files` as a literal prefix, so the suite
stayed at 134/0 and proved nothing. Corrected to a rename that actually
breaks the prefix: `## 7. Save the files`.

Result: **119 passed, 15 failed** — the block-located assertion fails first
(`sed` returns empty), and all 14 "template names X" assertions fail
alongside it in the "confusing heap" the brief anticipated, each showing an
empty `actual`:

```
  PASS: config declares commands.mutation (null is allowed, absent is not)
  FAIL: the Step 7 JSON block was located at all
    expected to contain: version
    actual: 
  FAIL: tdd-init's config template names version
    expected to contain: version
    actual: 
  FAIL: tdd-init's config template names crapMode
    expected to contain: crapMode
    actual: 
  FAIL: tdd-init's config template names complexity
    expected to contain: complexity
    actual: 
  FAIL: tdd-init's config template names mutation
    expected to contain: mutation
    actual: 
  FAIL: tdd-init's config template names maxCrap
    expected to contain: maxCrap
    actual: 
  FAIL: tdd-init's config template names duplicateThreshold
    expected to contain: duplicateThreshold
    actual: 
  ...
119 passed, 15 failed
```

Restored from backup, verified byte-identical with `diff` (empty), re-ran the
suite: **134 passed, 0 failed.**

Full bite-check outputs preserved in the scratchpad at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/`
(`round2-bite-crapmode.txt`, `round2-bite-heading.txt` [the vacuous first
attempt], `round2-bite-heading2.txt` [the real bite], `round2-final.txt`),
not part of the repo.

### Fixture still untouched

```
$ git diff --stat -- tests/fixtures/config.json
(no output — clean)
```

This fix round never touched `tests/fixtures/config.json`; the drift being
fixed was entirely in the contract test's own haystack scoping, not the
config schema itself.

### Commit

```
a426a8d fix(command): scope tdd-init's schema check to the json block
 2 files changed, 20 insertions(+), 5 deletions(-)
```

`git status --short` after commit: empty (clean tree). Scope `command`,
type `fix`, matching the round-1 precedent of bundling the command file and
its contract test under one commit since both changes serve the same defect.

### Concerns after fix round 2

None new. Both bite checks now demonstrate real coverage: the scoping fix
catches the exact case (a key missing from the JSON block but present in
prose) that the round-1 test missed, and the block-location assertion fails
loudly and specifically when the anchor heading changes, rather than
silently matching nothing. Findings 2 and 3 were documentation corrections
reproduced verbatim; I did not independently re-verify the `tdd_bash_verdict`
trace behind Finding 2 against `hooks/lib/rules.sh` (out of scope for this
task — `hooks/lib/rules.sh` is not a file Task 7 may modify or is required to
audit), but the coordinator's message states it was traced directly.

## Fix round 3

The re-review found round 2's scoping fix was real but incomplete: scoping
the haystack to the Step 7 block removed 7 of 14 false-pass risks, but the
remaining bare-word needle was still vacuous for 4 keys that occur a *second
time inside the block itself* — `maxCrap` and `mutantsPerPass` in the "Write
every key..." paragraph right after the JSON, `mutation` as a substring of
`mutationRounds`, and `ignore` as a substring of `.gitignore` on the
`Append to` line the `sed` range's end anchor includes. The coordinator also
found a second, unrelated latent defect (Finding 4): the end anchor
(`^Append to`) is unguarded — if it stops matching, `sed -n '/start/,/end/p'`
runs to EOF instead of returning empty, silently re-widening the haystack
back toward whole-file behavior, and nothing would notice because `version`
and the 14 key names all still occur further down in Steps 8–9's prose... no,
actually they don't (steps 8–9 contain none of the 14 names) — but the
principle holds generally and the coordinator asked for a bounded-block
assertion regardless.

The corrected brief changed only `tests/config-contract.test.sh` (this
round's diff against `commands/tdd-init.md` is empty — confirmed below):

1. **Needle form.** `assert_contains "$_k" ...` became
   `assert_contains "\"${_k}\":" ...` — matching the literal JSON form
   `"key":` instead of the bare word, which is unique within the block for
   all 14 names (verified below, one at a time).
2. **Bounded-block assertion (Finding 4).** After locating the block, a new
   check:
   ```
   case "$_init_text" in
     *"## 8"*) _bounded=no ;;
     *)        _bounded=yes ;;
   esac
   assert_eq "yes" "$_bounded" "the extracted block stops before step 8 (end anchor still matches)"
   ```

### What changed

Re-extracted verbatim from the corrected brief:

```
B=.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md
sed -n '23,209p' "$B" > /tmp/tdd-init-r3.md
sed -n '224,302p' "$B" > /tmp/config-contract-r3.test.sh
diff /tmp/tdd-init-r3.md commands/tdd-init.md   # exit 0 -- unchanged this round
cp /tmp/config-contract-r3.test.sh tests/config-contract.test.sh
```

Confirmed `commands/tdd-init.md` is byte-identical to what was already
committed (this round only touches the test file) and
`tests/config-contract.test.sh` is byte-identical to the brief's new fenced
block, both via `diff` exit 0.

### `bash tests/run.sh` after the fix — 135 passed, 0 failed

One new assertion versus fix round 2's 134: `the extracted block stops
before step 8 (end anchor still matches)`.

```
--- config-contract.test.sh ---
  PASS: config has non-null version
  ...
  PASS: config declares commands.mutation (null is allowed, absent is not)
  PASS: the Step 7 JSON block was located at all
  PASS: the extracted block stops before step 8 (end anchor still matches)
  PASS: tdd-init's config template names version
  PASS: tdd-init's config template names crapMode
  PASS: tdd-init's config template names complexity
  PASS: tdd-init's config template names mutation
  PASS: tdd-init's config template names maxCrap
  PASS: tdd-init's config template names duplicateThreshold
  PASS: tdd-init's config template names maxFunctionLines
  PASS: tdd-init's config template names greenAttempts
  PASS: tdd-init's config template names violationRetries
  PASS: tdd-init's config template names mutationRounds
  PASS: tdd-init's config template names mutantsPerPass
  PASS: tdd-init's config template names greenMaxNewUncovered
  PASS: tdd-init's config template names refactorMaxNewUncovered
  PASS: tdd-init's config template names ignore
  PASS: globs.test is an array
  PASS: globs.source is an array
  PASS: globs.ignore is an array
```

```
135 passed, 0 failed
```

### Bite checks — all five previously-vacuous keys, one at a time

Per the coordinator's warning that four of these are inline within a nested
object on a shared line (a line-oriented deletion would silently not remove
them), each edit used `perl -pi -e 's/\Q<exact substring>\E/<replacement>/'`
against the precise JSON fragment, and each was verified with
`grep -c '"<key>":' commands/tdd-init.md` returning `0` — confirming the
target string was actually gone — before running the suite. Each was
restored from a clean backup and verified byte-identical with `diff` before
moving to the next.

**1. `crapMode`** (its own line — round 2's bite check already covered this
one, repeated here as the baseline "genuinely works" case):

```
$ perl -pi -e 's/\Q      "crapMode": "computed",\E\n//' commands/tdd-init.md
$ grep -c '"crapMode":' commands/tdd-init.md
0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's config template names crapMode
134 passed, 1 failed
```
Restored; diff empty; suite back to `135 passed, 0 failed`.

**2. `maxCrap`** (shares a line with `duplicateThreshold`/`maxFunctionLines`
in `refactorTriggers`; also occurs in the "Omit `refactorTriggers.maxCrap`"
prose sentence within the same block, which is why the bare-word needle was
a FALSE PASS before this round):

```
$ perl -pi -e 's/\Q"refactorTriggers": { "maxCrap": 30, "duplicateThreshold"\E/"refactorTriggers": { "duplicateThreshold"/' commands/tdd-init.md
$ grep -c '"maxCrap":' commands/tdd-init.md
0
$ grep -n 'refactorTriggers' commands/tdd-init.md
155:      "refactorTriggers": { "duplicateThreshold": 3, "maxFunctionLines": 40 },
165:threshold compares as "never exceeded". Omit `refactorTriggers.maxCrap` and the
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's config template names maxCrap
134 passed, 1 failed
```
Restored; diff empty; suite back to `135 passed, 0 failed`.

**3. `mutation`** (shares a line with `complexity`; also a substring of
`mutationRounds` elsewhere in the block, which is why the bare-word needle
was a FALSE PASS before this round):

```
$ perl -pi -e 's/\Q"complexity": "...", "mutation": null\E/"complexity": "..."/' commands/tdd-init.md
$ grep -c '"mutation":' commands/tdd-init.md
0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's config template names mutation
134 passed, 1 failed
```
Restored; diff empty; suite back to `135 passed, 0 failed`.

**4. `mutantsPerPass`** (shares a line with `mutationRounds`; also occurs in
the "omit `limits.mutantsPerPass`" prose sentence within the same block,
which is why the bare-word needle was a FALSE PASS before this round):

```
$ perl -pi -e 's/\Q"mutationRounds": 2, "mutantsPerPass": 20\E/"mutationRounds": 2/' commands/tdd-init.md
$ grep -c '"mutantsPerPass":' commands/tdd-init.md
0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's config template names mutantsPerPass
134 passed, 1 failed
```
Restored; diff empty; suite back to `135 passed, 0 failed`.

**5. `ignore`** (shares a line with `test`/`source` inside the `globs`
object; also a substring of `.gitignore` on the `Append to` end-anchor line
that the inclusive `sed` range covers, which is why the bare-word needle was
a FALSE PASS before this round):

```
$ perl -pi -e 's/\Q"globs": { "test": [...], "source": [...], "ignore": [...] },\E/"globs": { "test": [...], "source": [...] },/' commands/tdd-init.md
$ grep -c '"ignore":' commands/tdd-init.md
0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's config template names ignore
134 passed, 1 failed
```
Restored; diff empty; suite back to `135 passed, 0 failed`.

All five now bite correctly: exactly one failure each, naming the correct
key, no collateral failures.

### Bite check — the new bounded-block (end-anchor) assertion

Broke the end anchor by rewording the `Append to` line so it no longer
starts with `Append to` (the literal string `sed`'s end pattern
`^Append to` matches against):

```
$ perl -pi -e 's/\QAppend to `.gitignore` if not already present:\E/Add to `.gitignore` if not already present:/' commands/tdd-init.md
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: the extracted block stops before step 8 (end anchor still matches)
134 passed, 1 failed
```

Full section, confirming this is exactly the silent-widening Finding 4
describes — the block-located assertion and all 14 key assertions still
pass (the widened `sed` range still contains `version` and every key name,
just now also Steps 8 and 9), and only the new bounded-block assertion
catches the drift:

```
  PASS: the Step 7 JSON block was located at all
  FAIL: the extracted block stops before step 8 (end anchor still matches)
    expected: yes
    actual:   no
  PASS: tdd-init's config template names version
  PASS: tdd-init's config template names crapMode
  ... (all 14 "names X" assertions PASS)
```

Restored from the clean backup, verified byte-identical with `diff` (empty),
re-ran the suite: `135 passed, 0 failed`.

Full bite-check outputs preserved in the scratchpad at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/`
(`round3-bite-crapMode.txt`, `round3-bite-maxCrap.txt`,
`round3-bite-mutation.txt`, `round3-bite-mutantsPerPass.txt`,
`round3-bite-ignore.txt`, `round3-bite-endanchor.txt`), not part of the repo.

### Fixture still untouched

```
$ git diff --stat -- tests/fixtures/config.json
(no output — clean)
```

This fix round only touched `tests/config-contract.test.sh`;
`commands/tdd-init.md` and the fixture were both unchanged (confirmed via
`diff` against the brief and against the pre-round backup respectively).

### Commit

```
93f56d7 test(command): use json-form needles, bound the block end anchor
 tests/config-contract.test.sh | 24 +++++++++++++++++++++++-
 1 file changed, 23 insertions(+), 1 deletion(-)
```

`git status --short` after commit: empty (clean tree). Type `test` (this
change only corrects/strengthens existing test assertions, no source or
command-file content changed), scope `command` (AGENTS.md's enumerated scope
list has no `test` entry; `command` is what round 1's commit used and what
the coordinator's own `fix(plan)` commits for this same round used as the
counterpart).

**Note on commit SHA stability:** while this fix round was in progress, the
branch was rebased by an external process running concurrently (visible in
`git reflog` as repeated `rebase (pick)` / `commit (amend)` / `rebase
(finish)` cycles, most likely other agents' commits to
`docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` being
interleaved onto the same branch). This changed the SHAs of all of this
task's earlier commits without changing their content or order — I verified
`git log --oneline` still shows the same five Task 7 commits in the same
sequence with the same messages, just under new hashes, and the final
commit above (`93f56d7`) is the current `HEAD` after that rebase settled.
No content was lost; `git status`, the test suite, and the fixture diff were
all re-verified clean against the current `HEAD` before writing this
section.

### Concerns after fix round 3

None new. All three open items are now closed: the five previously-vacuous
key checks (`crapMode`, `maxCrap`, `mutation`, `mutantsPerPass`, `ignore`)
individually bite with exactly one targeted failure each, and the end-anchor
is now guarded with its own assertion that fails specifically (not as part
of a confusing heap) when the block silently widens. The one process note
worth flagging is the concurrent-rebase behavior above — not a defect in
this task's deliverable, but worth the coordinator's awareness if other
in-flight work is relying on specific commit SHAs rather than commit
content/messages.

## Fix round 4

The reviewer confirmed rounds 1–3 closed (all 14 keys bite individually, the
end-anchor guard fires independently) and found one more instance of the
same defect class, present since round 1: the template-side loop only ever
pinned **14** keys, but the fixture requires **19** distinct key names (23
counting `commands.test`/`globs.test` as separate occurrences). Five keys
were never pinned on the template side at all: `commands.test`,
`commands.single`, `commands.coverage`, `globs.test`, `globs.source`. The
reviewer verified this directly — renaming `"coverage":` to
`"coverage-DELETED":` in the Step 7 JSON block left the suite fully green —
and noted `commands.coverage` is, by the command file's own §2c table, the
single key whose loss cascades into all three coverage gates.

Root cause called out explicitly in the brief: two hand-maintained lists of
the same schema, one a silent subset of the other. Fourth time this shape of
bug has appeared in this task, so round 4 removes the hand-maintenance
instead of extending the list again.

Two changes in the brief, both confined to `tests/config-contract.test.sh`
(`commands/tdd-init.md` is unchanged this round — confirmed below):

1. **Derive, don't hand-maintain.** The template-key loop now iterates over
   `jq -r 'paths | .[-1] | select(type=="string")' "$_cfg" | sort -u` —
   every string key name anywhere in the fixture — instead of a hardcoded
   list, and compares **multiplicity**, not presence:
   ```
   for _k in $(jq -r 'paths | .[-1] | select(type=="string")' "$_cfg" | sort -u); do
     _want=$(jq -r --arg k "$_k" '[paths | .[-1] | select(. == $k)] | length' "$_cfg")
     _have=$(printf '%s' "$_init_text" | grep -o "\"${_k}\":" | wc -l | tr -d ' ')
     assert_eq "$_want" "$_have" "tdd-init's template declares ${_k} (${_want}x)"
   done
   ```
   Multiplicity matters because `"test"` legitimately occurs twice in the
   schema (`commands.test` and `globs.test`); a presence check proves only
   that the string appears somewhere, not that both occurrences are there.
2. **A third copy, in the spec, gets the same treatment.** A new block reads
   `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md`'s own
   JSON schema (`sed -n '/"version": 1,/,/^}/p'`), asserts the block was
   located (using `crapMode` as the located-marker, since that text is
   unique to the schema block within the spec), and runs the identical
   derived-multiplicity loop against it.

Because the expected counts are now derived from the fixture at test time
rather than hardcoded, a future key added to the fixture makes both the
template and spec assertions grow automatically — the coordinator's stated
intent.

### What changed

Re-extracted verbatim from the corrected brief:

```
B=.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md
sed -n '23,209p' "$B" > /tmp/tdd-init-r4.md
sed -n '224,318p' "$B" > /tmp/config-contract-r4.test.sh
diff /tmp/tdd-init-r4.md commands/tdd-init.md   # exit 0 -- unchanged this round
cp /tmp/config-contract-r4.test.sh tests/config-contract.test.sh
```

Confirmed both files byte-identical to the brief with `diff` (exit 0 on
both) immediately after extraction and again as a final check before
committing.

### `bash tests/run.sh` after the fix — 168 passed, 0 failed

33 new assertions versus fix round 3's 135: the old hardcoded 14-key
"template names X" loop (removed) is replaced by a derived 23-entry
"template declares X (Nx)" loop, plus a new "spec's schema block was located
at all" assertion and a matching derived 23-entry "spec's schema declares X
(Nx)" loop. 135 − 14 + 23 + 1 + 23 = 168.

```
--- config-contract.test.sh ---
  PASS: config has non-null version
  ...(unchanged fixture-side assertions from earlier rounds)...
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
  PASS: the spec's schema block was located at all
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
```

```
168 passed, 0 failed
```

### Bite checks — the four keys the old hardcoded list never pinned

Each edit targeted the exact substring inside the Step 7 JSON block (backed
up first, restored from that backup after), verified via `grep -o ... | wc
-l` scoped to the extracted block before trusting the run, per the same
discipline round 3 established.

**1. `coverage`** (the key the reviewer flagged as cascading into all three
coverage gates if lost):

```
$ perl -pi -e 's/\Q"test": "...", "single": "...", "coverage": "...",\E/"test": "...", "single": "...", "coverage-X": "...",/' commands/tdd-init.md
$ sed -n '/^## 7\. Write the files/,/^Append to/p' commands/tdd-init.md | grep -o '"coverage":' | wc -l
       0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's template declares coverage (1x)
167 passed, 1 failed
```
Restored; diff empty; suite back to `168 passed, 0 failed`.

**2. `single`**:

```
$ perl -pi -e 's/\Q"test": "...", "single": "...", "coverage": "...",\E/"test": "...", "single-X": "...", "coverage": "...",/' commands/tdd-init.md
$ sed -n '/^## 7\. Write the files/,/^Append to/p' commands/tdd-init.md | grep -o '"single":' | wc -l
       0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's template declares single (1x)
167 passed, 1 failed
```
Restored; diff empty; suite back to `168 passed, 0 failed`.

**3. `source`**:

```
$ perl -pi -e 's/\Q"globs": { "test": [...], "source": [...], "ignore": [...] },\E/"globs": { "test": [...], "source-X": [...], "ignore": [...] },/' commands/tdd-init.md
$ sed -n '/^## 7\. Write the files/,/^Append to/p' commands/tdd-init.md | grep -o '"source":' | wc -l
       0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's template declares source (1x)
167 passed, 1 failed
```
Restored; diff empty; suite back to `168 passed, 0 failed`.

**4. `test` — one of its two occurrences, proving the multiplicity check**
(this is the case a presence-only check would have missed: `test` is still
*present*, just once instead of twice):

```
$ perl -pi -e 's/\Q"test": "...", "single": "...", "coverage": "...",\E/"test-X": "...", "single": "...", "coverage": "...",/' commands/tdd-init.md
$ sed -n '/^## 7\. Write the files/,/^Append to/p' commands/tdd-init.md | grep -o '"test":' | wc -l
       1
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: tdd-init's template declares test (2x)
    expected: 2
    actual:   1
167 passed, 1 failed
```
Restored; diff empty; suite back to `168 passed, 0 failed`.

All four bite correctly: exactly one targeted failure each, and the fourth
demonstrates the count-mismatch case specifically (2 expected, 1 found)
rather than a presence check's blind spot.

### Bite check — the spec's schema block

**Delete a key (`crapMode`) from the spec's JSON block:**

```
$ SPEC=docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md
$ git diff --stat -- "$SPEC"        # empty, confirming a clean baseline first
$ perl -pi -e 's/\Q  "crapMode": "computed",\E\n//' "$SPEC"
$ grep -c '"crapMode":' "$SPEC"
0
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: the spec's schema block was located at all
  FAIL: the spec's schema declares crapMode (1x)
166 passed, 2 failed
```

Two assertions fail, not one: the spec's block-located check uses
`crapMode` itself as its located-marker (the template's equivalent check
uses `version` instead, since `version` alone isn't unique enough as a
marker in the spec's surrounding prose — the brief's choice, reproduced
verbatim), so deleting `crapMode` trips both the marker check and its own
"declares" assertion simultaneously. Full detail:

```
  FAIL: the spec's schema block was located at all
    expected to contain: crapMode
    actual:   "version": 1,
  "commands": {
--
  FAIL: the spec's schema declares crapMode (1x)
    expected: 1
    actual:   0
```

Restored from the clean backup; `diff` empty; `git diff --stat -- "$SPEC"`
empty; suite back to `168 passed, 0 failed`.

**Break the spec block's start anchor** (`/"version": 1,/`), confirming the
"block was located at all" assertion fires and drags down all 23 dependent
assertions in the same "confusing heap" shape established for the
template's own start-anchor break in round 3:

```
$ perl -pi -e 's/\Q  "version": 1,\E/  "schemaVersion": 1,/' "$SPEC"
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: the spec's schema block was located at all
  FAIL: the spec's schema declares commands (1x)
  FAIL: the spec's schema declares complexity (1x)
  FAIL: the spec's schema declares coverage (1x)
  FAIL: the spec's schema declares coverageGates (1x)
  FAIL: the spec's schema declares crapMode (1x)
  FAIL: the spec's schema declares duplicateThreshold (1x)
  FAIL: the spec's schema declares globs (1x)
  FAIL: the spec's schema declares greenAttempts (1x)
  FAIL: the spec's schema declares greenMaxNewUncovered (1x)
  FAIL: the spec's schema declares ignore (1x)
  FAIL: the spec's schema declares limits (1x)
  FAIL: the spec's schema declares maxCrap (1x)
  FAIL: the spec's schema declares maxFunctionLines (1x)
  FAIL: the spec's schema declares mutantsPerPass (1x)
  FAIL: the spec's schema declares mutation (1x)
  FAIL: the spec's schema declares mutationRounds (1x)
  FAIL: the spec's schema declares refactorMaxNewUncovered (1x)
  FAIL: the spec's schema declares refactorTriggers (1x)
  FAIL: the spec's schema declares single (1x)
  FAIL: the spec's schema declares source (1x)
  FAIL: the spec's schema declares test (2x)
  FAIL: the spec's schema declares version (1x)
  FAIL: the spec's schema declares violationRetries (1x)
144 passed, 24 failed
```

Restored from the clean backup; `diff` empty; `git diff --stat -- "$SPEC"`
empty; suite back to `168 passed, 0 failed`.

Full bite-check outputs preserved in the scratchpad at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/`
(`round4-bite-coverage.txt`, `round4-bite-single.txt`,
`round4-bite-source.txt`, `round4-bite-test-count.txt`,
`round4-bite-spec-key.txt`, `round4-bite-spec-anchor.txt`), not part of the
repo.

### Fixture and spec still untouched

```
$ git diff --stat -- tests/fixtures/config.json
(no output — clean)
$ git diff --stat -- docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md
(no output — clean)
```

Both checked immediately after each relevant bite check's restore step and
again as a final sweep before committing.

### Commit

```
7e6597c test(test): derive schema checks from fixture, pin the spec too
 1 file changed, 28 insertions(+), 12 deletions(-)
```

`git status --short` after commit: empty (clean tree). Only
`tests/config-contract.test.sh` changed this round — `commands/tdd-init.md`
was already correct (confirmed unchanged via `diff` against the brief) and
the spec file needed no edits (the coordinator verified it was already
correct across all 23 keys; this round only adds assertions that pin it,
without modifying its content). Scope `test` and type `test` per the
coordinator's explicit instruction this round.

As in round 3, the branch continued to be rebased by a concurrent external
process while this round was in progress (visible again in `git reflog`);
the commit SHA above is the current `HEAD` after that settled, verified
immediately before finishing.

### Concerns after fix round 4

None new. The reviewer's four target bite checks (`coverage`, `single`,
`source`, and the `test` multiplicity case) and both spec-side bite checks
(missing key, broken start anchor) all behave exactly as predicted: precise
single-assertion failures for the four template keys and the spec's missing
key, and full down-stream heaps for both start-anchor breaks. The
derivation approach (`jq -r 'paths | .[-1] | select(type=="string")'`)
means this specific defect class — a hand-maintained list silently falling
behind the fixture it's supposed to mirror — cannot recur for these two
files without the fixture itself changing, which is the coordinator's
stated goal.

## Fix round 5

The review confirmed round 4's derived-list fix closed the open finding, but
found two more instances of the same defect class — a safeguard whose
absence is invisible — one of them introduced by round 4 itself.

**Finding 5 (blocking): the spec extraction had no end-anchor guard.**
Round 4 copied the template's `sed -n '/start/,/end/p'` pattern to the spec
block but not the end-anchor guard round 3 added for the template. The
reviewer verified that re-indenting the spec block's closing `}` (so `^}`
stops matching) makes `sed` sweep in roughly 53 lines of trailing prose,
and the suite stayed fully green — invisible only because that prose
happens to contain no `"word":` substrings today, a coincidence of current
wording rather than something the test enforced.

**Finding 6 (blocking, most serious in the task): a broken `jq` filter
silently deletes checks, and nothing notices.** The reviewer typoed `string`
as `strnig` in the derived loops' `select(type==...)` filter and the two
loops enumerated zero keys each — 46 assertions gone — while
`tests/run.sh` reported `122 passed, 0 failed`. This isn't unique to this
test: the harness counts assertions that ran, with no notion of how many
*should* have run, so a file that fails to load or a loop that iterates
zero times reads as a clean pass. Recorded as a deferred minor back in
Task 2; round 5 fixes it rather than deferring it again, since it just
caused a real miss.

Two changes, per the brief:

1. **`tests/run.sh`** (Task 2's file — the brief explicitly authorizes this
   specific change): snapshot `PASS + FAIL` before sourcing each
   `*.test.sh` file, and if the total didn't move afterward, record a new
   `FAIL: <file> contributed no assertions` and increment `FAIL`. Separately,
   track whether the glob matched anything at all and fail the run if it
   didn't. The brief describes this behaviorally rather than as a literal
   code block (unlike `commands/tdd-init.md` and
   `tests/config-contract.test.sh`, which are given as fenced code and
   copied verbatim), so I wrote it myself, matching the file's existing
   Bash-3.2-safe style (plain `[ ]` tests, `$(( ))` arithmetic, no
   bashisms). Full diff below.
2. **`tests/config-contract.test.sh`** — both derived loops (template and
   spec) now count their own iterations (`_tpl_seen`, `_spec_seen`) and
   assert at least 19 were enumerated (the fixture has 19 distinct key
   names; `test` counted twice brings the raw iteration count to the same
   19 unique names, so `-ge 19` is the right floor). The spec loop also
   gained the end-anchor guard Finding 5 called for: `assert_eq "}"
   "$(printf '%s' "$_spec_text" | tail -1)"` — asserting the extracted
   block's last line is exactly the closing brace, which the brief notes is
   stronger than a content marker like `## 8` because it doesn't depend on
   what happens to follow the block.

### What changed

`commands/tdd-init.md` is unchanged this round (confirmed via `diff`, exit
0, against the brief). `tests/config-contract.test.sh` was re-extracted
verbatim:

```
B=.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md
sed -n '23,209p' "$B" > /tmp/tdd-init-r5.md
sed -n '224,338p' "$B" > /tmp/config-contract-r5.test.sh
diff /tmp/tdd-init-r5.md commands/tdd-init.md          # exit 0 -- unchanged
cp /tmp/config-contract-r5.test.sh tests/config-contract.test.sh
diff <(sed -n '224,338p' "$B") tests/config-contract.test.sh   # exit 0
```

`tests/run.sh` was hand-written (no fenced block in the brief to diff
against) as:

```diff
 TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
 export REPO_ROOT="$(cd "$TESTS_DIR/.." && pwd)"

-for t in "$TESTS_DIR"/*.test.sh; do
-  [ -e "$t" ] || continue
+FOUND=0
+for t in "$TESTS_DIR"/*.test.sh; do
+  [ -e "$t" ] || continue
+  FOUND=1
   printf '\n--- %s ---\n' "$(basename "$t")"
+  BEFORE=$((PASS + FAIL))
   # shellcheck disable=SC1090
   . "$t"
+  if [ "$((PASS + FAIL))" -eq "$BEFORE" ]; then
+    printf '  FAIL: %s contributed no assertions\n' "$(basename "$t")"
+    FAIL=$((FAIL + 1))
+  fi
 done

+if [ "$FOUND" -eq 0 ]; then
+  printf '\n  FAIL: no *.test.sh files found in %s\n' "$TESTS_DIR"
+  FAIL=$((FAIL + 1))
+fi
+
 printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
 [ "$FAIL" -eq 0 ]
```

### Assertion total: 168 before, 171 after (+3, as predicted)

The coordinator predicted the total would rise by exactly 3 and that the
per-file guard would not change any existing count (since it only adds a
`FAIL` when a file contributes *zero* assertions, and every current file
contributes at least one). Both held:

```
$ bash tests/run.sh 2>&1 | tail -3
  PASS: harness finds a substring

171 passed, 0 failed
```

The three new assertions:
```
  PASS: the derived template loop enumerated at least 19 keys (saw 23)
  PASS: the spec's schema block ends at its closing brace (end anchor still matches)
  PASS: the derived spec loop enumerated at least 19 keys (saw 23)
```

168 + 3 = 171, confirmed.

### Bite check 1 — typo `string` → `strnig` in both derived loops

```
$ perl -pi -e 's/type=="string"/type=="strnig"/g' tests/config-contract.test.sh
$ grep -n 'select(type==' tests/config-contract.test.sh
78:for _k in $(jq -r 'paths | .[-1] | select(type=="strnig")' "$_cfg" | sort -u); do
100:for _k in $(jq -r 'paths | .[-1] | select(type=="strnig")' "$_cfg" | sort -u); do
$ bash tests/run.sh 2>&1 | tail -3
  PASS: harness finds a substring

123 passed, 2 failed
```

Full `config-contract.test.sh` section:

```
  PASS: the Step 7 JSON block was located at all
  PASS: the extracted block stops before step 8 (end anchor still matches)
  FAIL: the derived template loop enumerated at least 19 keys (saw 0)
    expected: yes
    actual:   no
  PASS: the spec's schema block was located at all
  PASS: the spec's schema block ends at its closing brace (end anchor still matches)
  FAIL: the derived spec loop enumerated at least 19 keys (saw 0)
    expected: yes
    actual:   no
  PASS: globs.test is an array
  PASS: globs.source is an array
  PASS: globs.ignore is an array
```

Reasoning about which guard caught it, per the coordinator's ask:
`config-contract.test.sh` still contributed 44 PASS + 2 FAIL (46 fewer than
its normal 46 — matching the coordinator's own repro of "dropped 46
assertions" exactly), so the **harness-level "contributed no assertions"
guard did not fire** (it only fires on a strict zero, and this file was far
from zero). It was the **in-file cardinality guards** — the two new
"enumerated at least 19 keys" assertions, each independently reporting `saw
0` — that caught it. This is exactly the intended division of labor: the
harness guard catches a file that's *entirely* dead (fails to load, or
every one of its checks vanishes), while the in-file guard catches a
*partial* failure where the file still runs and still asserts things, but
one particular loop silently iterates zero times.

Restored from backup, verified byte-identical with `diff` (empty), re-ran
the suite: `171 passed, 0 failed`.

### Bite check 2 — empty a test file entirely

Used `tests/smoke.test.sh` (smallest, most self-contained):

```
$ cp tests/smoke.test.sh /path/scratchpad/smoke.test.sh.orig
$ : > tests/smoke.test.sh
$ wc -l tests/smoke.test.sh
       0 tests/smoke.test.sh
$ bash tests/run.sh 2>&1 | tail -8
  PASS: glob characters in a parametrized test id are treated as data, not a pattern
  PASS: glob characters after the prefix are treated as literal data, not a pattern
  PASS: missing template argument denies rather than crashing

--- smoke.test.sh ---
  FAIL: smoke.test.sh contributed no assertions

169 passed, 1 failed
```

This is the harness-level guard firing in isolation: 171 − 2 (smoke's own
two now-missing PASS assertions) + 1 (the new FAIL) = 169 passed, 1 failed.
No other file's counts moved.

Restored from backup, verified byte-identical with `diff` (empty), re-ran
the suite: `171 passed, 0 failed`.

### Bite check 3 — re-indent the spec block's closing `}`

```
$ SPEC=docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md
$ git diff --stat -- "$SPEC"        # empty, confirming a clean baseline first
$ sed -i '' '341s/^}/  }/' "$SPEC"
$ awk 'NR==339,NR==342{print NR": "$0}' "$SPEC"
339:   },
340:   "coverageGates": { "greenMaxNewUncovered": 2, "refactorMaxNewUncovered": 0 }
341:   }
342: ```
$ bash tests/run.sh 2>&1 | grep -E "FAIL|passed,"
  FAIL: the spec's schema block ends at its closing brace (end anchor still matches)
170 passed, 1 failed
```

```
  PASS: the spec's schema block was located at all
  FAIL: the spec's schema block ends at its closing brace (end anchor still matches)
    expected: }
    actual:   The plugin is built the way it preaches: tests first.
  PASS: the spec's schema declares commands (1x)
```

The `actual` value shows the re-indented `}` no longer anchors the `sed`
range, which swept forward until it matched some other line starting with
`}` further down in the spec document, sweeping in unrelated prose — a live
demonstration of exactly the widening Finding 5 describes. All 23 "declares"
assertions still passed (the swept-in text happens not to contain any
`"word":` substrings, which is the coincidence the brief warned is not
something the test enforces) — only the new dedicated end-anchor assertion
caught the widening.

Restored from the clean backup, verified byte-identical with `diff` (empty),
`git diff --stat -- "$SPEC"` empty, re-ran the suite: `171 passed, 0
failed`.

Full bite-check outputs preserved in the scratchpad at
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/`
(`round5-bite-typo.txt`, `round5-bite-empty.txt`,
`round5-bite-spec-brace.txt`), not part of the repo.

### Fixture and spec still untouched, tree clean

```
$ git diff --stat -- tests/fixtures/config.json
(no output — clean)
$ git diff --stat -- docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md
(no output — clean)
$ git status --short
(clean after commit)
```

### Commit

```
dbe3619 test(test): guard against silently-vanishing assertions
 2 files changed, 32 insertions(+)
```

Two files changed: `tests/config-contract.test.sh` (copied verbatim from
the brief) and `tests/run.sh` (hand-written to the brief's behavioral spec,
since no literal code was given for it). Scope `test` and type `test` per
the coordinator's explicit instruction. `commands/tdd-init.md` and the spec
file were untouched — confirmed via `diff`/`git diff --stat` throughout.

### Concerns after fix round 5

None new. One judgment call worth flagging: `tests/run.sh`'s new logic was
not handed to me as verbatim brief text (unlike every other file this task
has touched across five rounds), so I designed it myself against the
brief's behavioral description ("snapshot PASS + FAIL before sourcing each
file and fail if it did not move, plus fail if the glob matched no files at
all"). I kept it minimal and matched the file's existing idioms, and both
new behaviors are directly bite-checked above (empty-file case and,
indirectly, the no-files-matched case is structurally identical logic not
separately exercised since doing so would require removing every test file
from the directory — I judged that riskier to stage/restore correctly than
valuable to prove, given the empty-single-file case already exercises the
same counting mechanism). Flagging in case the coordinator wants that edge
case exercised explicitly in a future round.

## Fix round 6

(The coordinator's message for this round called itself "Fix round 5" —
that label collides with the section already above, so this section is
numbered sequentially as round 6 to keep the report unambiguous. Same
task, same file, next fix in sequence.)

Found by running `/tdd-init` and `/tdd` for real rather than by
review-of-text: `/tdd-init` invalidates its own partition check. Step 4
verifies every tracked file matches exactly one glob list; Step 8 then
commits `.tdd/config.json`, making it a tracked file the just-verified
partition never classified. `/tdd`'s preflight re-runs the same partition
check on every run and fails on drift — so it failed immediately after a
successful init, every time, observed live as:

```
preflight step 5: tracked=48 unclassified=1
  UNCLASSIFIED  .tdd/config.json
```

Same shape as the round-1 defect (init's own side effect breaking the next
command's precondition) one layer deeper: round 1 was the dirty tree left
behind; this is the file that gets committed into it.

Two changes in the brief, both in `commands/tdd-init.md`:

1. **Step 3** gained a new paragraph: `ignore` must include `.tdd/**`,
   because Step 8 commits `.tdd/config.json` and a partition that doesn't
   already classify it is invalidated by the command's own commit.
2. **Step 4** gained a new sentence: check the files the command is *about
   to add*, not only `git ls-files` — `.tdd/config.json` doesn't exist yet
   on a first run and never appears in that listing.

### An unscoped discrepancy, and how I resolved it

The coordinator's round instructions said "Confirm only `commands/tdd-init.md`
changed." Diffing the brief's Step 1b fenced block against the currently
committed `tests/config-contract.test.sh` showed that assumption didn't
hold: the brief's `_tpl_seen` loop had also gained a five-line comment
("Floor, not an exact count: the fixture currently has 23 distinct key
names...") that was not present in what round 5 committed. Every round of
this task has been "implement the brief verbatim, prove it with `diff`,"
and dropping five lines to satisfy a stale scope prediction would have made
the standing byte-identity check fail on the very next round. I applied the
comment addition — it documents a real design decision (why the floor is
19 when the loop currently sees 23, and why the expected count must not be
derived from the same `jq` filter the loop uses) that round 5 made but
never wrote down, which reads as deliberate authorship, not brief-generation
noise. Consulted the advisor on this specific ambiguity before proceeding;
its reasoning matched and is reflected above. Flagged as a concern below.

### What changed

```
B=.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-7-brief.md
sed -n '23,219p'  "$B" > commands/tdd-init.md
sed -n '234,353p' "$B" > tests/config-contract.test.sh
sed -n '23,219p'  "$B" | diff - commands/tdd-init.md          # exit 0
sed -n '234,353p' "$B" | diff - tests/config-contract.test.sh # exit 0
```

`git diff --stat` before staging showed exactly these two files:
```
 commands/tdd-init.md          | 10 ++++++++++
 tests/config-contract.test.sh |  5 +++++
 2 files changed, 15 insertions(+)
```

### `bash tests/run.sh` — 171 passed, 0 failed (unchanged)

```
$ bash tests/run.sh 2>&1 | tail -3
  PASS: harness finds a substring

171 passed, 0 failed
```

Matches the prediction exactly: a comment-only test-file change and two
new prose paragraphs in the command file (both outside anything the
contract test reads as executable content or extracts as a haystack) move
nothing.

### Confirming the two new passages landed

```
$ grep -n '\.tdd/\*\*' commands/tdd-init.md
83:**`ignore` must include `.tdd/**`.** Step 8 commits `.tdd/config.json`, which

$ grep -n 'about to add' commands/tdd-init.md
98:Check the files this command is about to add, not only `git ls-files` as it
```

### Verifying, not assuming, the contract test is unaffected

The coordinator specifically asked to verify this rather than infer it from
the total staying at 171. The Step 7 extraction the contract test uses is
`sed -n '/^## 7\. Write the files/,/^Append to/p'`; both new passages live
in §3 (line 83) and §4 (line 98), well before that start anchor at line
153. Directly confirmed the new text is outside the extracted block, not
merely coincidentally harmless:

```
$ grep -n '^## 7\. Write the files\|^Append to' commands/tdd-init.md
153:## 7. Write the files
180:Append to `.gitignore` if not already present:

$ sed -n '/^## 7\. Write the files/,/^Append to/p' commands/tdd-init.md | grep -c 'tdd/\*\*'
0
```

Zero occurrences of the new `.tdd/**` text inside the extracted Step 7
block — proves the change is structurally outside the contract test's
haystack, not just currently non-matching by luck.

### Fixture and spec still untouched

```
$ git diff --stat -- tests/fixtures/config.json docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md
(no output — clean)
```

### Well-formedness

```
$ head -3 commands/tdd-init.md
---
description: Detect the project's toolchain and write .tdd/config.json for the TDD cycle
---
```

### Commit

```
f6f6551 fix(command): partition the config /tdd-init is about to commit
 2 files changed, 15 insertions(+)
```

`git status --short` after commit: empty (clean tree). Type `fix` (this
corrects a real defect: init invalidating its own precondition for the very
next command), scope `command` per the coordinator's explicit instruction.
Both files in one commit — the test-file delta is comment-only and
documents the same design lineage as the command-file fix, so splitting it
into a second commit would be noise for a five-line comment.

As in rounds 3–5, the branch continued to be modified by concurrent work
from other parallel agents on this same branch while this round was in
progress (visible in `git log` immediately after committing, showing
unrelated commits like `fix(plan): stop depending on $1 substitution in
/tdd` and a `green:` commit from a different task's TDD cycle interleaved
around this commit). Re-verified `git status`, the test suite, and the
fixture/spec diffs against the current `HEAD` (`f6f6551`) after the dust
settled; all clean.

### Concerns after fix round 6

**New:** the brief's Step 1b fenced block carried a five-line comment
("Floor, not an exact count…") that was not part of what round 5 actually
committed, so this round's stated verification item — "Confirm only
`commands/tdd-init.md` changed" — did not hold. I applied the comment
(judged deliberate authorship documenting a real round-5 decision, not
brief-generation drift) and included it in this round's commit alongside
the `commands/tdd-init.md` fix. Effect is comment-only: suite stayed at
171/0, and the new text sits outside every extraction window the contract
test uses, confirmed directly above rather than inferred. Flagging in case
the comment addition was unintended on the coordinator's side — a one-line
revert (deleting those five comment lines from
`tests/config-contract.test.sh`) would undo it cleanly if so.

No other concerns. The live-run discovery process (actually running
`/tdd-init` and `/tdd` rather than only reviewing the command file's text)
caught a defect that five rounds of static verbatim-copying and bite-testing
did not and structurally could not — the contract test pins the *content*
of the config schema, not whether the partition the command itself computes
stays exhaustive after the command's own write. That's a different property
and outside this task's existing test's reach; worth keeping in mind if
further live-run findings surface for this command.
