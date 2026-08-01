# Task 5 Report: The guard hook

## What was created

- `hooks/guard.sh` — the `PreToolUse` guard, implemented verbatim from the brief. Mode `100755` (verified via `git ls-files -s`, and confirmed to survive `git add`/`git commit`).
- `hooks/hooks.json` — plugin-wrapper-shaped hook registration (`{"hooks": {"PreToolUse": [...]}}`), verbatim from the brief.
- `tests/guard.test.sh` — 31 assertions, sourced by `tests/run.sh` (no shebang, no `set -e`, no `exit`), verbatim from the brief.
- `tests/fixtures/config.json` — fixture config used by the sandboxed test project, verbatim from the brief.

No changes were made to `hooks/lib/rules.sh` (only read, as instructed).

## Step 2: failing run (before guard.sh existed)

Ran `bash tests/run.sh` with the test files in place but no `hooks/guard.sh`. Result: 48 passed, 31 failed — all 31 failures in `guard.test.sh`, every one caused by the same root cause:

```
--- guard.test.sh ---
  FAIL: main thread (no agent_type): permits silently
    expected: 0|
    actual:   127|bash: /Users/kbluck/Claude/code/claude-tdd/hooks/guard.sh: No such file or directory
  FAIL: unrelated agent type: permits silently
    expected: 0|
    actual:   127|bash: /Users/kbluck/Claude/code/claude-tdd/hooks/guard.sh: No such file or directory
  [... 29 more FAILs, all "127|bash: .../hooks/guard.sh: No such file or directory" ...]

--- rules.test.sh ---
  [48 PASS, unchanged]

--- smoke.test.sh ---
  [2 PASS, unchanged]

48 passed, 31 failed
```

This matches the brief's Step 2 expectation exactly (`hooks/guard.sh: No such file or directory`).

## Step 4: final passing run

After writing `hooks/guard.sh` and `hooks/hooks.json` verbatim from the brief:

```
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
  PASS: unrecognized tdd-* agent permits
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green too
  PASS: relative source path is still denied to red
  PASS: relative test path is still allowed to red
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread

--- rules.test.sh ---
  [48 PASS, unchanged]

--- smoke.test.sh ---
  [2 PASS, unchanged]

79 passed, 0 failed
```

48 (pre-existing) + 31 (new) = 79, zero failures.

Step 6 (`jq -e '.hooks.PreToolUse[0].hooks[0].command' hooks/hooks.json`) returned exactly `"${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh"` as expected.

## Step 5: mutation checks

The brief's prose ("every deny assertion reporting `0|`") does not match what actually happens with the exact `sed` command given, because the target line `[ "$verdict" = "allow" ] && exit 0` appears **twice** in `guard.sh`: once inside the `if [ "$mode" = "bash" ]` block (indented two spaces, line 92) and once at the end of the path-verdict branch (column 0, line 117). The brief's anchor `^\[` only matches an unindented line, so it mutates only the path-branch copy. I ran it exactly as specified first, verified/reported that result, then ran a second, broader mutation to confirm the bash-branch check is separately live. Both are reported below, plus the traversal-guard-deletion check.

### Mutation 1a — exactly the brief's sed (path-verdict branch only)

```
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' 's/^\[ "\$verdict" = "allow" \] && exit 0$/exit 0/' hooks/guard.sh
```

Diff (only the unindented, path-branch occurrence changed — the indented bash-branch occurrence at line 92 is untouched):

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -114,5 +114,5 @@ case "$path" in
 esac
 
 verdict=$(tdd_path_verdict "$role" "$mode" "$rel" "$test_globs" "$source_globs")
-[ "$verdict" = "allow" ] && exit 0
+exit 0
 deny "$verdict"
```

`bash tests/run.sh`:

```
--- guard.test.sh ---
  PASS: main thread (no agent_type): permits silently
  PASS: unrelated agent type: permits silently
  PASS: orchestrator may read tests
  PASS: orchestrator may run its own audit command
  PASS: red writing a test is permitted
  FAIL: red writing source exits 2
    expected to contain: 2|
    actual: 0|
  FAIL: denial JSON has deny decision
    expected to contain: "permissionDecision":"deny"
    actual: 0|
  FAIL: denial names the violated rule
    expected to contain: only write test files
    actual: 0|
  FAIL: red reading source is denied
    expected to contain: 2|
    actual: 0|
  FAIL: green reading a test is denied
    expected to contain: 2|
    actual: 0|
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
  FAIL: tdd-mutate may not read tests
    expected to contain: 2|
    actual: 0|
  PASS: tdd-mutate may run the full suite
  PASS: unrecognized tdd-* agent permits
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green too
  FAIL: relative source path is still denied to red
    expected to contain: 2|
    actual: 0|
  PASS: relative test path is still allowed to red
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread

72 passed, 7 failed
exit=1
```

Result: 7 failures (not "every deny assertion"), confined to the path-verdict assertions (red writes source, deny JSON, deny message, red reads source, green reads test, mutate reads test, relative source path). The three bash-branch deny assertions ("green running an arbitrary command is denied", "metacharacters after a coverage prefix are still denied", "green may not run the complexity command") still correctly denied, because that code path wasn't touched by this exact sed. Failures are non-zero (`exit=1`) as expected, just narrower in scope than the brief's prose states.

### Mutation 1b — both occurrences (extra check beyond the brief, to confirm the bash-branch verdict check is also load-bearing)

Restored from `.bak`, then re-mutated with a pattern matching both the indented and unindented copies:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' 's/^[[:space:]]*\[ "\$verdict" = "allow" \] && exit 0$/exit 0/' hooks/guard.sh
```

Diff (both occurrences now mutated):

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -89,7 +89,7 @@ if [ "$mode" = "bash" ]; then
     v=$(tdd_bash_verdict "$cmd" "$template")
     if [ "$v" = "allow" ]; then verdict="allow"; break; fi
   done
-  [ "$verdict" = "allow" ] && exit 0
+exit 0
   deny "$verdict"
 fi
 
@@ -114,5 +114,5 @@ case "$path" in
 esac
 
 verdict=$(tdd_path_verdict "$role" "$mode" "$rel" "$test_globs" "$source_globs")
-[ "$verdict" = "allow" ] && exit 0
+exit 0
 deny "$verdict"
```

`bash tests/run.sh`:

```
72 passed, 7 failed   [same 7 path-branch FAILs as Mutation 1a, PLUS:]
  FAIL: green running an arbitrary command is denied
    expected to contain: 2|
    actual: 0|
  FAIL: metacharacters after a coverage prefix are still denied
    expected to contain: 2|
    actual: 0|
  FAIL: green may not run the complexity command
    expected to contain: 2|
    actual: 0|

69 passed, 10 failed
exit=1
```

Result: 10 failures total — the 7 path-branch assertions from Mutation 1a plus the 3 bash-branch deny assertions. The assertions that still passed under this fully-inert guard are exactly the ones that deny *before* reaching either verdict check: empty `file_path`, both `..`-traversal assertions, and missing-config — which is correct, since those are separate `deny` calls earlier in the script, not gated by `$verdict`.

Restored (`mv hooks/guard.sh.bak hooks/guard.sh`); reran suite: **79 passed, 0 failed**.

### Mutation 2 — delete the traversal guard

```
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' '/\*\/\.\.\/\*) deny/d' hooks/guard.sh
```

Diff:

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -105,7 +105,6 @@ path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
 # would survive as an absolute path, match no glob, and be permitted on a
 # read -- the same silent fail-open shape as the Task 3 defect.
 case "/$path/" in
-  */../*) deny "tdd guard: path contains a '..' segment and cannot be classified safely: $path" ;;
 esac
 
 case "$path" in
```

`bash tests/run.sh`:

```
--- guard.test.sh ---
  [... all PASS ...]
  FAIL: a .. segment denies rather than escaping classification
    expected to contain: 2|
    actual: 0|
  PASS: a .. segment denies for green too
  [... remaining PASS ...]

78 passed, 1 failed
exit=1
```

Result: only 1 failure, not 2. The `tdd-red` traversal assertion ("a .. segment denies rather than escaping classification") correctly fails once the guard is removed — this confirms that assertion is genuinely live.

**The `tdd-green` traversal assertion ("a .. segment denies for green too") does NOT fail when the traversal guard is deleted.** I investigated why: with the guard removed, the traversal path `$SANDBOX/../<basename>/tests/test_a.py` does not literally start with `"$root/"` (because of the `../` in the middle), so it falls through to the unstripped/pass-through branch (`rel="$path"`, the full path unchanged). That raw path still ends in `tests/test_a.py`, which matches the test glob `**/test_*.py` (normalized to `*/test_*.py`, and inside `[[ ]]` a bare `*` crosses `/`). So `tdd_path_verdict green:read` denies it anyway — correctly, but for the *ordinary* "green may not read test files" rule, not because of traversal protection. This assertion is not actually exercising the traversal guard for the green role; it happens to pass for an unrelated reason. See Concerns below — I did not modify the test file to fix this, per the brief's "verbatim" requirement, but I am flagging it because Step 5 said "if the suite still passes [under mutation], the assertions are not testing what they claim and must be fixed before proceeding" — here the suite does NOT still pass (the red assertion catches the regression), so the mutation-detection goal of Step 5 as a whole is met, but this one specific assertion within it is not doing the job its name implies.

Restored (`mv hooks/guard.sh.bak hooks/guard.sh`); reran suite: **79 passed, 0 failed**. Confirmed `git status --porcelain` showed no `.bak` file left behind before staging (the only untracked entries were the four new files).

## Commit

```
3e1433b feat: PreToolUse guard enforcing role boundaries
 4 files changed, 289 insertions(+)
 create mode 100755 hooks/guard.sh
 create mode 100644 hooks/hooks.json
 create mode 100644 tests/fixtures/config.json
 create mode 100644 tests/guard.test.sh
```

Staged and committed exactly the four files named in the brief's Step 7 (`hooks/guard.sh hooks/hooks.json tests/guard.test.sh tests/fixtures/config.json`). Verified `hooks/guard.sh` is mode `100755` in the git index (`git ls-files -s`) before committing, so the executable bit is preserved for the real hook invocation (the test suite invokes it via `bash "$GUARD"`, which would not have caught a missing exec bit). The pre-existing `.claude/settings.json` modification noted in the session's initial git status was not present in `git diff`/`git status` by the time I staged, and was not touched or included in this commit regardless.

## Concerns

1. **Step 5's exact `sed` command under-mutates.** As shown above, the brief's literal `sed -i '' 's/^\[ "\$verdict" = "allow" \] && exit 0$/exit 0/'` only touches the unindented (path-branch) occurrence of the verdict check, because `^\[` anchors at column 0 and the bash-branch copy is indented two spaces. Run as specified, it produces 7 failures, not "every deny assertion" as the brief's prose claims. I additionally ran a broader mutation (matching both occurrences, Mutation 1b above) to confirm the bash-branch deny path is separately covered (3 more failures, 10 total) — that one behaves as the brief's prose describes. No code change was needed; this is purely a discrepancy between the brief's example command and its own description, worth knowing if this brief/technique is reused elsewhere.

2. **"a .. segment denies for green too" does not test what its name claims.** When the traversal guard is deleted, this assertion still passes, but for the unrelated reason that the un-stripped traversal path happens to match the test glob and gets denied by the ordinary green-may-not-read-tests rule. Only the paired `tdd-red` assertion actually detects the traversal-guard regression. The guard's behavior is correct; the test coverage for green's traversal case specifically is not what it appears to be. I did not alter the test file (the brief specifies it verbatim and Task 5's instructions say not to modify it beyond what's given), but a follow-up could strengthen this by using a green *source*-path traversal case (which would not coincidentally match the test glob) if tighter mutation coverage of the green role's traversal handling is wanted.

3. **Design-level items already called out in the brief itself, not defects in this implementation:** the `*) exit 0` fallback for unrecognized `tool` values (a third "exit without a verdict" past role identification — deliberate, since the brief says "Any other tool → permit (the matcher should not deliver them; defensive)"); the no-`jq` fallback's `*'"agent_type":"tdd-'*` grep assumes compact JSON with no space after the `:` (matches Claude Code's actual payload shape per the Task 1 spike, but is fragile to formatting changes); and the `mutation` role's bash `extra="test mutation"` omits `coverage` even though the adjacent comment says "every role is measured on coverage, so every role may measure itself" — per the brief's own fixture, `commands.mutation` is `null`, so in practice `tdd-mutate` cannot run the coverage command through this path either way, but the comment and the `mutation` case are inconsistent with each other. These are all present in the brief's own verbatim code; I implemented them as given rather than second-guessing the specification, per instructions to use the brief's exact code, and record them here rather than fixing.

4. No functional bugs were found in the implementation as specified — all three "traps" called out in the task instructions (early `exit 0`s, quoting on `case` expansions, and the `jq`/missing-config/missing-`file_path` edge cases) were implemented per the brief and are covered by passing assertions, and both mutation-check families above confirm the deny paths are genuinely load-bearing (except for item 2, which is a test-coverage gap for one specific role/assertion pairing, not a guard defect).

---

## Fix round 1

The coordinator confirmed all three concerns above were real defects and corrected the brief:

- **Finding 1 (critical, fail-open):** confirmed empirically against the round-0 guard — `tdd-red` + `NotebookEdit`/`MultiEdit` writing to `src/a.py` returned `exit 0` (permitted), while `tdd-red` + `Write` correctly returned `exit 2`. Root cause: Claude Code hook matchers are unanchored regex, so `Edit` in `Read|Write|Edit|Bash` also delivers `MultiEdit` and `NotebookEdit`, and both fell through the tool `case` to `*) exit 0`.
- **Finding 2 (important, no-jq fallback):** the compact-JSON-anchored pattern `*'"agent_type":"tdd-'*` would slip past (and permit) if the payload ever had `"agent_type": "tdd-red"` with a space after the colon.
- **Finding 3 (minor, comment only):** the `tdd-mutate` bash-allowlist comment claimed "every role is measured on coverage" when mutate's `extra="test mutation"` never included `coverage` — code was right, comment was wrong.

The corrected brief also fixed the two things I flagged from my own mutation-check notes: the Step 5 `sed` pattern is now unanchored so it hits both occurrences of the verdict-check line, and the green traversal assertion now uses a *source* path instead of a *test* path so it can't pass by coincidentally matching the test glob.

I re-read the corrected brief in full and implemented it verbatim (no interpretation needed — the corrected code, tests, and hooks.json were given exactly).

### Files changed

- `hooks/guard.sh` — tool `case` now maps `Write|Edit|MultiEdit` and `NotebookEdit` to `write` explicitly, and its `*)` branch calls `deny` instead of `exit 0`; path extraction reads `.tool_input.file_path // .tool_input.notebook_path // empty`; no-jq fallback matches `*tdd-red*|*tdd-green*|*tdd-refactor*|*tdd-mutate*`; mutate's bash-allowlist comment corrected.
- `hooks/hooks.json` — matcher widened to `"Read|Write|Edit|MultiEdit|NotebookEdit|Bash"`.
- `tests/guard.test.sh` — added assertions for `Write`/`Edit`/`MultiEdit` (loop), `NotebookEdit` (via `notebook_path`), and an unrecognized tool name; the green traversal assertion switched from a test-path target to a source-path target.

### Pre-check: confirm the new assertions fail against the round-0 guard

Before touching `guard.sh`, I updated `tests/guard.test.sh` to the corrected version and ran the suite against the still-unpatched `guard.sh`, to see the vulnerability caught by the new tests before fixing it:

```
$ bash tests/run.sh
...
  PASS: red writing source via Write is denied
  PASS: red writing source via Edit is denied
  FAIL: red writing source via MultiEdit is denied
    expected to contain: 2
    actual: |0
  FAIL: red writing source via NotebookEdit is denied
    expected to contain: 2
    actual: |0
  FAIL: an unrecognized tool denies rather than passing through
    expected to contain: 2
    actual: |0
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green even on a path it could otherwise read
  ...

81 passed, 3 failed
exit=1
```

This reproduces the coordinator's finding exactly: `MultiEdit` and `NotebookEdit` writes, and an unrecognized tool name, all fell through to `exit 0` (permit) under the round-0 guard. Note the new green traversal assertion (now using a source path) already passed here — it wasn't broken, it just wasn't proving anything under the old test until the mutation check below.

### Implementation and full pass

Updated `hooks/guard.sh` and `hooks/hooks.json` to the corrected brief verbatim, then:

```
$ bash tests/run.sh
...
  PASS: red writing source via Write is denied
  PASS: red writing source via Edit is denied
  PASS: red writing source via MultiEdit is denied
  PASS: red writing source via NotebookEdit is denied
  PASS: an unrecognized tool denies rather than passing through
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green even on a path it could otherwise read
  ...

84 passed, 0 failed
exit=0
```

48 (baseline) + 36 (guard.test.sh, up from 31) = 84, zero failures.

### Step 5 mutation checks, re-run with the corrected (unanchored) sed

`grep -n` first, to show the verdict-check line's two locations before mutating:

```
$ grep -n '\[ "\$verdict" = "allow" \] && exit 0' hooks/guard.sh
104:  [ "$verdict" = "allow" ] && exit 0
130:[ "$verdict" = "allow" ] && exit 0
```

Applied the corrected, unanchored sed:

```
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' 's/\[ "\$verdict" = "allow" \] && exit 0/exit 0/' hooks/guard.sh
$ grep -c 'exit 0' hooks/guard.sh
6
```

Diff — both occurrences mutated this time:

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -101,7 +101,7 @@ if [ "$mode" = "bash" ]; then
     v=$(tdd_bash_verdict "$cmd" "$template")
     if [ "$v" = "allow" ]; then verdict="allow"; break; fi
   done
-  [ "$verdict" = "allow" ] && exit 0
+  exit 0
   deny "$verdict"
 fi
 
@@ -127,5 +127,5 @@ case "$path" in
 esac
 
 verdict=$(tdd_path_verdict "$role" "$mode" "$rel" "$test_globs" "$source_globs")
-[ "$verdict" = "allow" ] && exit 0
+exit 0
 deny "$verdict"
```

`bash tests/run.sh`:

```
--- guard.test.sh ---
  PASS: main thread (no agent_type): permits silently
  PASS: unrelated agent type: permits silently
  PASS: orchestrator may read tests
  PASS: orchestrator may run its own audit command
  PASS: red writing a test is permitted
  FAIL: red writing source exits 2
    expected to contain: 2|
    actual: 0|
  FAIL: denial JSON has deny decision
    expected to contain: "permissionDecision":"deny"
    actual: 0|
  FAIL: denial names the violated rule
    expected to contain: only write test files
    actual: 0|
  FAIL: red reading source is denied
    expected to contain: 2|
    actual: 0|
  FAIL: green reading a test is denied
    expected to contain: 2|
    actual: 0|
  PASS: green writing source is permitted
  PASS: green running the configured single-test command is permitted
  FAIL: green running an arbitrary command is denied
    expected to contain: 2|
    actual: 0|
  PASS: refactor running the full suite is permitted
  PASS: red may run the coverage command
  PASS: green may run the coverage command
  PASS: refactor may run the coverage command
  FAIL: metacharacters after a coverage prefix are still denied
    expected to contain: 2|
    actual: 0|
  PASS: refactor may run the complexity command
  FAIL: green may not run the complexity command
    expected to contain: 2|
    actual: 0|
  PASS: tdd-mutate may write source
  FAIL: tdd-mutate may not read tests
    expected to contain: 2|
    actual: 0|
  PASS: tdd-mutate may run the full suite
  PASS: unrecognized tdd-* agent permits
  FAIL: red writing source via Write is denied
    expected to contain: 2
    actual: |0
  FAIL: red writing source via Edit is denied
    expected to contain: 2
    actual: |0
  FAIL: red writing source via MultiEdit is denied
    expected to contain: 2
    actual: |0
  FAIL: red writing source via NotebookEdit is denied
    expected to contain: 2
    actual: |0
  PASS: an unrecognized tool denies rather than passing through
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green even on a path it could otherwise read
  FAIL: relative source path is still denied to red
    expected to contain: 2|
    actual: 0|
  PASS: relative test path is still allowed to red
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread

--- rules.test.sh ---

70 passed, 14 failed
exit=1
```

This now matches the brief's Step 5 expectation ("every deny assertion reporting `0|` instead of `2|`, and a non-zero exit"): both the bash-branch and path-branch verdict checks are disabled, so every assertion that depends on reaching either `$verdict` check fails (14 total), including the four new writing-tool assertions, which now correctly route through the (disabled) path-verdict check. The assertions that still pass are exactly the ones that `deny` *before* reaching a verdict check (empty `file_path`, both `..` assertions, unrecognized-tool, unrecognized-agent, missing-config) — unaffected by design, since they don't depend on `$verdict`.

Restored:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ bash tests/run.sh
...
84 passed, 0 failed
```

### Traversal-guard deletion, with the corrected (source-path) green assertion

```
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' '/\*\/\.\.\/\*) deny/d' hooks/guard.sh
```

Diff:

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -118,7 +118,6 @@ path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebo
 # would survive as an absolute path, match no glob, and be permitted on a
 # read -- the same silent fail-open shape as the Task 3 defect.
 case "/$path/" in
-  */../*) deny "tdd guard: path contains a '..' segment and cannot be classified safely: $path" ;;
 esac
 
 case "$path" in
```

`bash tests/run.sh`:

```
--- guard.test.sh ---
  [... all PASS ...]
  FAIL: a .. segment denies rather than escaping classification
    expected to contain: 2|
    actual: 0|
  FAIL: a .. segment denies for green even on a path it could otherwise read
    expected to contain: 2|
    actual: 0|
  [... remaining PASS ...]

82 passed, 2 failed
exit=1
```

Both traversal assertions now fail when the guard is removed — `tdd-red` as before, and now `tdd-green` too, because its assertion targets a source path (`src/a.py`) rather than a test path. With the traversal guard gone, the unstripped path `$SANDBOX/../<dir>/src/a.py` matches neither the test glob nor (as an unstripped absolute-looking path) the source glob, so `tdd_path_verdict green:read` no longer coincidentally denies it via the ordinary rule — the assertion now genuinely proves the traversal guard is load-bearing for green, closing the gap I flagged in the round-0 report.

Restored:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ bash tests/run.sh
...
84 passed, 0 failed
$ git status --porcelain
 M hooks/guard.sh
 M hooks/hooks.json
 M tests/guard.test.sh
```

No `.bak` file left behind (the only changes are the three tracked files, pre-staging).

### Targeted check requested by the coordinator

`tdd-red` + `NotebookEdit` writing under `globs.source`, in a fresh sandbox with a valid config, run directly against `hooks/guard.sh` (not through the test harness):

```
$ SANDBOX="$(mktemp -d)"; mkdir -p "$SANDBOX/.tdd"; cp tests/fixtures/config.json "$SANDBOX/.tdd/config.json"
$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"NotebookEdit","tool_input":{"notebook_path":"%s/src/analysis.ipynb"}}' "$SANDBOX" \
    | TDD_PROJECT_DIR="$SANDBOX" bash hooks/guard.sh
{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may only write test files; src/analysis.ipynb is not under the configured test globs"}
exit=2
```

Confirms the fix directly: `tdd-red` writing a notebook under `src/` is denied with the same "only write test files" rule as an ordinary source write, using `notebook_path` correctly.

### hooks.json shape re-verified

```
$ jq -e '.hooks.PreToolUse[0].hooks[0].command' hooks/hooks.json
"${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh"
$ jq -e '.hooks.PreToolUse[0].matcher' hooks/hooks.json
"Read|Write|Edit|MultiEdit|NotebookEdit|Bash"
```

### Commit

```
dd404d3 fix(guard): deny unmapped tools instead of permitting them
 3 files changed, 49 insertions(+), 12 deletions(-)
```

Staged and committed exactly `hooks/guard.sh`, `hooks/hooks.json`, and `tests/guard.test.sh` (the three files the fix round touched; `tests/fixtures/config.json` was unchanged in this round). Note: a separate commit, `c8ad1ef` ("fix: judge every file-writing tool, not just Write and Edit"), appeared in the log between my Step-1 commit (`3e1433b`) and this one — it touches only `docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` (the master plan document) and was not made by me in this task; I did not include it in or depend on it for my commit, and `git show --stat dd404d3` confirms my commit contains only the three files listed above.

### Concerns after fix round 1

All three concerns from the round-0 report are resolved:

1. The Step 5 `sed` under-mutation is fixed (unanchored pattern now hits both occurrences; verified via `grep -c 'exit 0'` before and after, and via the diff showing two hunks).
2. The green traversal assertion now targets a source path and genuinely fails when the traversal guard is deleted (previously it passed for an unrelated reason).
3. The critical fail-open (`MultiEdit`/`NotebookEdit`/any unrecognized tool silently permitted) is closed — the tool `case`'s default branch now denies, and both writing-tool paths are covered by passing assertions plus the standalone targeted check above.

No new concerns identified in this round. The only remaining known limitation is the one already documented in the brief itself and unchanged by this fix: a symlink created inside a role's writable globs could allow reading through it undetected, but creating one is not reachable through the tools this guard currently mediates (`Bash` is allowlisted to the test runner; `Write`/`Edit`/`MultiEdit`/`NotebookEdit` cannot create symlinks).

---

## Fix round 2

The re-review closed four of five findings from round 1. One stayed open (a stale comment my fix left behind) and two residuals surfaced from the re-review itself; the coordinator corrected the brief again and I re-read it in full before implementing.

- **Open — Finding 3 (minor), stale comment.** My round-1 fix added the corrected comment block above the bash-role `case` but left the old one immediately above it, so `hooks/guard.sh` stated "every role is measured on coverage" two lines above a block explaining mutate is not. Fixed by deleting the two stale lines (`# The phase's own runner command, plus the coverage command — every role is` / `# measured on coverage, so every role may measure itself.`).
- **Residual 1 (important), path key must be selected by tool, not by fallback.** `.tool_input.file_path // .tool_input.notebook_path` validated whichever field happened to be present first. A `NotebookEdit` payload carrying a benign `file_path` (a test path) alongside the real-target `notebook_path` (a source path) would be judged on `file_path` — the field the tool doesn't act on — and permitted. Fixed by adding a `path_key` variable set per-tool in the same `case` that maps `mode`, then extracting with `jq -r --arg k "$path_key" '.tool_input[$k] // empty'`.
- **Residual 2 (minor), `NotebookRead`.** The widened matcher substring-matches `NotebookRead` too, which fell to the unrecognized-tool `deny`. Not a hole (denying a read is the safe direction) but gratuitous. `NotebookRead` now maps to `mode=read, path_key=notebook_path`, judged by the ordinary read rule, and is listed in the `hooks.json` matcher. `BashOutput` and any other unmapped tool still deny — that's deliberate, not a residual.
- Also tightened three assertions that used `assert_contains "2" "$out"` against `"<stderr>|<rc>"` (which could match a stray `2` inside a deny message) to `assert_contains "|2" "$out"`.

Implemented the corrected brief verbatim — `hooks/guard.sh`, `hooks/hooks.json`, and `tests/guard.test.sh` all now match it exactly (diffs shown below).

### Files changed

- `hooks/guard.sh` — tool `case` now sets `path_key` alongside `mode` per tool (`file_path` for `Read`/`Write`/`Edit`/`MultiEdit`; `notebook_path` for `NotebookEdit`/`NotebookRead`; empty for `Bash`); path extraction uses `jq --arg k "$path_key"` instead of the `file_path // notebook_path` fallback; stale duplicate comment removed above the bash-role `case`.
- `hooks/hooks.json` — matcher widened to include `NotebookRead`.
- `tests/guard.test.sh` — added the decoy-payload assertion (`NotebookEdit` with both `file_path` and `notebook_path` set, targeting `notebook_path`); tightened `assert_contains "2" ...` to `assert_contains "|2" ...` on the three tool-mapping assertions.

### Full pass

```
$ bash tests/run.sh
...
  PASS: red writing source via Write is denied
  PASS: red writing source via Edit is denied
  PASS: red writing source via MultiEdit is denied
  PASS: NotebookEdit is judged on notebook_path, not a decoy file_path
  PASS: red writing source via NotebookEdit is denied
  PASS: an unrecognized tool denies rather than passing through
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green even on a path it could otherwise read
  ...

85 passed, 0 failed
exit=0
```

48 (baseline) + 37 (guard.test.sh, up from 36) = 85, zero failures.

### `grep -n "measured on coverage" hooks/guard.sh`

```
$ grep -n "measured on coverage" hooks/guard.sh
$ echo "exit=$?"
exit=1
```

No match, confirming the stale comment is gone (exit 1 = grep found nothing).

### Targeted check 1: decoy payload (`file_path` = test path, `notebook_path` = source path)

Run directly against `hooks/guard.sh` in a fresh sandbox, not through the test harness:

```
$ SANDBOX="$(mktemp -d)"; mkdir -p "$SANDBOX/.tdd"; cp tests/fixtures/config.json "$SANDBOX/.tdd/config.json"
$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"NotebookEdit","tool_input":{"file_path":"%s/tests/test_a.py","notebook_path":"%s/src/nb.ipynb"}}' "$SANDBOX" "$SANDBOX" \
    | TDD_PROJECT_DIR="$SANDBOX" bash hooks/guard.sh
{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may only write test files; src/nb.ipynb is not under the configured test globs"}
exit=2
```

The decoy `file_path` (a legal test path) is ignored; the guard judges `notebook_path` (the real write target, under `src/`) and denies, naming `src/nb.ipynb` — not the decoy — in the message. Confirms `path_key` selection works correctly and closes Residual 1.

### Targeted check 2: `NotebookRead` on a source path denies via the ordinary read rule

```
$ SANDBOX="$(mktemp -d)"; mkdir -p "$SANDBOX/.tdd"; cp tests/fixtures/config.json "$SANDBOX/.tdd/config.json"
$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"NotebookRead","tool_input":{"notebook_path":"%s/src/nb.ipynb"}}' "$SANDBOX" \
    | TDD_PROJECT_DIR="$SANDBOX" bash hooks/guard.sh
{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may not read source files; src/nb.ipynb is under the configured source globs"}
exit=2
```

The message text is `"Red may not read source files; ... is under the configured source globs"` — the ordinary `tdd_path_verdict red:read` denial — not the unrecognized-tool message (`"called an unrecognized tool"`). Confirms `NotebookRead` is mapped to `mode=read` and judged like any other read, closing Residual 2.

### Step 5 mutation checks, re-run against the round-2 guard

Located both occurrences of the verdict-check line first:

```
$ grep -n '\[ "\$verdict" = "allow" \] && exit 0' hooks/guard.sh
108:  [ "$verdict" = "allow" ] && exit 0
133:[ "$verdict" = "allow" ] && exit 0
```

Applied the unanchored sed:

```
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' 's/\[ "\$verdict" = "allow" \] && exit 0/exit 0/' hooks/guard.sh
$ grep -c 'exit 0' hooks/guard.sh
6
```

Diff — both occurrences mutated:

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -105,7 +105,7 @@ if [ "$mode" = "bash" ]; then
     v=$(tdd_bash_verdict "$cmd" "$template")
     if [ "$v" = "allow" ]; then verdict="allow"; break; fi
   done
-  [ "$verdict" = "allow" ] && exit 0
+  exit 0
   deny "$verdict"
 fi
 
@@ -130,5 +130,5 @@ case "$path" in
 esac
 
 verdict=$(tdd_path_verdict "$role" "$mode" "$rel" "$test_globs" "$source_globs")
-[ "$verdict" = "allow" ] && exit 0
+exit 0
 deny "$verdict"
```

`bash tests/run.sh`:

```
--- guard.test.sh ---
  PASS: main thread (no agent_type): permits silently
  PASS: unrelated agent type: permits silently
  PASS: orchestrator may read tests
  PASS: orchestrator may run its own audit command
  PASS: red writing a test is permitted
  FAIL: red writing source exits 2
    expected to contain: 2|
    actual: 0|
  FAIL: denial JSON has deny decision
    expected to contain: "permissionDecision":"deny"
    actual: 0|
  FAIL: denial names the violated rule
    expected to contain: only write test files
    actual: 0|
  FAIL: red reading source is denied
    expected to contain: 2|
    actual: 0|
  FAIL: green reading a test is denied
    expected to contain: 2|
    actual: 0|
  PASS: green writing source is permitted
  PASS: green running the configured single-test command is permitted
  FAIL: green running an arbitrary command is denied
    expected to contain: 2|
    actual: 0|
  PASS: refactor running the full suite is permitted
  PASS: red may run the coverage command
  PASS: green may run the coverage command
  PASS: refactor may run the coverage command
  FAIL: metacharacters after a coverage prefix are still denied
    expected to contain: 2|
    actual: 0|
  PASS: refactor may run the complexity command
  FAIL: green may not run the complexity command
    expected to contain: 2|
    actual: 0|
  PASS: tdd-mutate may write source
  FAIL: tdd-mutate may not read tests
    expected to contain: 2|
    actual: 0|
  PASS: tdd-mutate may run the full suite
  PASS: unrecognized tdd-* agent permits
  FAIL: red writing source via Write is denied
    expected to contain: |2
    actual: |0
  FAIL: red writing source via Edit is denied
    expected to contain: |2
    actual: |0
  FAIL: red writing source via MultiEdit is denied
    expected to contain: |2
    actual: |0
  FAIL: NotebookEdit is judged on notebook_path, not a decoy file_path
    expected to contain: |2
    actual: |0
  FAIL: red writing source via NotebookEdit is denied
    expected to contain: |2
    actual: |0
  PASS: an unrecognized tool denies rather than passing through
  PASS: empty file_path denies rather than permitting
  PASS: a .. segment denies rather than escaping classification
  PASS: a .. segment denies for green even on a path it could otherwise read
  FAIL: relative source path is still denied to red
    expected to contain: 2|
    actual: 0|
  PASS: relative test path is still allowed to red
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread

--- rules.test.sh ---

70 passed, 15 failed
exit=1
```

15 failures (up from 14 in round 1), the new one being "NotebookEdit is judged on notebook_path, not a decoy file_path" — the new decoy-payload assertion is now confirmed to be among the failures the coordinator asked to check, alongside the other four writing-tool assertions (Write, Edit, MultiEdit, plain NotebookEdit), since all five route through the disabled path-verdict check.

Restored:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ bash tests/run.sh
...
85 passed, 0 failed
```

### Traversal-guard deletion, re-confirmed unchanged

```
$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' '/\*\/\.\.\/\*) deny/d' hooks/guard.sh
$ bash tests/run.sh
...
  FAIL: a .. segment denies rather than escaping classification
    expected to contain: 2|
    actual: 0|
  FAIL: a .. segment denies for green even on a path it could otherwise read
    expected to contain: 2|
    actual: 0|
...
83 passed, 2 failed
exit=1
```

Still exactly the two traversal assertions, unaffected by the path-key change (they use `Read`/`Write` with `payload_read`/`payload_write`, which always populate `file_path`).

Restored:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ bash tests/run.sh
...
85 passed, 0 failed
$ git status --porcelain
 M hooks/guard.sh
 M hooks/hooks.json
 M tests/guard.test.sh
```

No `.bak` file left behind.

### hooks.json shape re-verified

```
$ jq -e '.hooks.PreToolUse[0].hooks[0].command' hooks/hooks.json
"${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh"
$ jq -e '.hooks.PreToolUse[0].matcher' hooks/hooks.json
"Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Bash"
```

### Commit

```
b486d54 fix(guard): select the path field by tool, add NotebookRead
 3 files changed, 23 insertions(+), 12 deletions(-)
```

Staged and committed exactly `hooks/guard.sh`, `hooks/hooks.json`, and `tests/guard.test.sh` (the three files this round touched; `tests/fixtures/config.json` was unchanged). As in round 1, a separate commit — `ea3d287` ("fix: select the guarded path key by tool, drop stale comment") — appeared in the log between my round-1 commit (`dd404d3`) and this one; it touches only `docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` (the master plan document), was not made by me, and is not included in or depended on by my commit. `git show --stat b486d54` confirms my commit contains only the three files listed above.

### Concerns after fix round 2

All findings from this round are resolved:

1. Finding 3 (stale comment) — deleted; `grep -n "measured on coverage" hooks/guard.sh` returns nothing.
2. Residual 1 (path key by tool) — fixed via `path_key`; verified both by the new automated assertion and by the standalone decoy-payload check above.
3. Residual 2 (`NotebookRead`) — mapped to `mode=read`; verified the denial message text (not just the exit code) comes from the ordinary read rule.

No new concerns identified in this round. The known limitation already on record (symlink-based read-through, not reachable through the currently-mediated tools) remains unchanged and is not affected by this fix.

---

## Fix round 3

**Critical finding, reported by the coordinator after Task 6 step 6 finally ran (it needed a plugin install and Claude Code restart, so it had been deferred):** real dispatches carry `agent_type` in the namespaced form `"claude-tdd:tdd-red"`, not the bare `"tdd-red"` the `case` matched on. Every real subagent call fell through to the unrecognized-agent branch (`*) exit 0`) and was silently permitted. Reproduced by the coordinator against the shipped guard: bare `tdd-red` denied correctly (exit 2), namespaced `claude-tdd:tdd-red` was permitted (exit 0) for the identical write. All 93 tests at the time passed, because every test payload used the bare name the design assumed — the tests and the code shared the same wrong premise, so nothing but dispatching a real agent and reading the raw bytes could catch it. This was recorded as an open risk in the Task 1 spike doc from the start, not something introduced by any of my rounds.

Implemented the corrected brief verbatim.

### Files changed

- `hooks/guard.sh` — the role `case` now matches `"${agent##*:}"` (namespace stripped via bash parameter expansion) instead of `"$agent"`. The `case` arms themselves (`tdd-red)`, `tdd-green)`, `tdd-refactor)`, `tdd-mutate)`) are unchanged, so `tests/agents.test.sh` — which greps `guard.sh` for `<name>)` per the agent files' `name:` field — still holds. Added the explanatory comment block. No change to the no-`jq` fallback (it already matches `*tdd-red*` etc. as a substring, which catches the namespaced spelling too).
- `hooks/hooks.json` — no change; the matcher was already correct.
- `tests/guard.test.sh` — extended the `AGENT` comment to explain the namespaced vs. bare distinction; added four new assertions using `"claude-tdd:tdd-red"` / `"claude-tdd:tdd-green"` / `"claude-tdd:tdd-mutate"` alongside the existing bare-name ones.
- `tests/fixtures/config.json` — unchanged.

Note: `tests/agents.test.sh` now exists in the repo (added by a parallel Task 6 process while I was working these fix rounds) — it was not created or modified by me, but it exercises the same `case` arms and its presence is why the "run to verify all pass" totals below include more assertions than in prior rounds.

### Full pass

```
$ bash tests/run.sh
...
  PASS: tdd-mutate may run the full suite
  PASS: namespaced tdd-red writing source is denied
  PASS: namespaced tdd-red writing a test is allowed
  PASS: namespaced tdd-green reading a test is denied
  PASS: namespaced tdd-mutate may run the full suite
  PASS: unrecognized tdd-* agent permits
  ...

97 passed, 0 failed
exit=0
```

(97 = 85 from round 2's `guard.test.sh`/`rules.test.sh`/`smoke.test.sh` baseline, plus 4 new namespaced assertions in `guard.test.sh`, plus 8 assertions in the now-present `tests/agents.test.sh`.)

### Targeted check 1: namespaced `tdd-red` writing under `globs.source` and `globs.test`

Run directly against `hooks/guard.sh` in a fresh sandbox with a valid config, not through the test harness:

```
$ SANDBOX="$(mktemp -d)"; mkdir -p "$SANDBOX/.tdd"; cp tests/fixtures/config.json "$SANDBOX/.tdd/config.json"

$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"claude-tdd:tdd-red","tool_name":"Write","tool_input":{"file_path":"%s/src/a.py"}}' "$SANDBOX" \
    | TDD_PROJECT_DIR="$SANDBOX" bash hooks/guard.sh
{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may only write test files; src/a.py is not under the configured test globs"}
exit=2

$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"claude-tdd:tdd-red","tool_name":"Write","tool_input":{"file_path":"%s/tests/test_a.py"}}' "$SANDBOX" \
    | TDD_PROJECT_DIR="$SANDBOX" bash hooks/guard.sh
exit=0
```

`agent_type=claude-tdd:tdd-red` writing under `globs.source` denies (exit 2, correct rule cited); writing under `globs.test` permits (exit 0). Confirms the namespace strip resolves to the same role and rules as the bare form.

### Targeted check 2: main thread untouched

```
$ printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git diff --name-only"}}' \
    | TDD_PROJECT_DIR="$SANDBOX" bash hooks/guard.sh
exit=0
```

A payload with no `agent_type` running the orchestrator's own audit command still exits 0 silently — the namespace-stripping change only affects the `case` used once `agent` is already known to be non-empty, so the `[ -n "$agent" ] || exit 0` early exit is untouched.

### Bite-check: revert the strip, confirm the new assertions fail, restore

```
$ grep -n 'case "${agent##\*:}"' hooks/guard.sh
50:case "${agent##*:}" in

$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' 's/case "\${agent##\*:}" in/case "$agent" in/' hooks/guard.sh
```

Diff:

```diff
--- a/hooks/guard.sh
+++ b/hooks/guard.sh
@@ -47,7 +47,7 @@ agent=$(printf '%s' "$input" | jq -r '.agent_type // empty')
 # would also be constrained here. That is a false denial -- loud and safe --
 # whereas matching too narrowly permits silently, which is the failure this
 # guard exists to prevent.
-case "${agent##*:}" in
+case "$agent" in
   tdd-red)      role=red ;;
   tdd-green)    role=green ;;
   tdd-refactor) role=refactor ;;
```

`bash tests/run.sh`:

```
--- guard.test.sh ---
  ...
  PASS: tdd-mutate may run the full suite
  FAIL: namespaced tdd-red writing source is denied
    expected to contain: 2|
    actual: 0|
  PASS: namespaced tdd-red writing a test is allowed
  FAIL: namespaced tdd-green reading a test is denied
    expected to contain: 2|
    actual: 0|
  PASS: namespaced tdd-mutate may run the full suite
  PASS: unrecognized tdd-* agent permits
  ...

95 passed, 2 failed
exit=1
```

**Only 2 of the 4 new namespaced assertions actually fail**, not all four. Worth stating precisely rather than confirming the brief's framing uncritically: the two that fail are the `deny`-type ones ("namespaced tdd-red writing source is denied", "namespaced tdd-green reading a test is denied"). The two `allow`-type ones ("namespaced tdd-red writing a test is allowed", "namespaced tdd-mutate may run the full suite") still pass under the broken (bare-name-only) guard, because an *unrecognized* `agent_type` also falls through to `exit 0` — the same permissive outcome as a correctly-identified role performing an allowed action. These two assertions can't distinguish "the guard correctly identified this as tdd-red and permitted a legal test write" from "the guard didn't recognize the agent at all and permitted everything," so they don't actually detect this regression; they just happen not to contradict it. The two deny-type assertions are the ones doing the real work here, and they did fail as expected — the bite-check overall does confirm the fix is load-bearing, just not via all four assertions equally.

Restored:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ bash tests/run.sh
...
97 passed, 0 failed
$ git status --porcelain
 M hooks/guard.sh
 M tests/guard.test.sh
```

No `.bak` file left behind.

### Commit

```
65827b2 fix(guard): strip the plugin namespace before matching agent_type
 2 files changed, 27 insertions(+), 1 deletion(-)
```

Staged and committed exactly `hooks/guard.sh` and `tests/guard.test.sh` (the only two files this round touched; `hooks.json` and `tests/fixtures/config.json` were unchanged). Verified `hooks/guard.sh` remained mode `100755` in the index after staging (`git ls-files -s`). As in prior rounds, a separate commit — `a0b420a` ("fix: strip the plugin namespace from agent_type before matching") — appeared in the log just before this one; it touches only the plan and spike docs (`docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md`, `docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`), was not made by me, and is not included in or depended on by my commit. `git show --stat 65827b2` confirms my commit contains only the two files listed above.

### Concerns after fix round 3

The critical finding is resolved and verified three ways: the full test suite (namespaced assertions pass), a standalone sandbox check against the real namespaced form for both source and test paths, and the bite-check confirming the `deny`-side assertions genuinely regress without the fix.

One concern to record, not fix (per "implement verbatim"): as detailed above, 2 of the 4 new namespaced assertions in `tests/guard.test.sh` ("...writing a test is allowed", "...may run the full suite") pass coincidentally under the broken bare-name-only guard, because unrecognized agents are also permitted — they do not by themselves distinguish correct namespace handling from no namespace handling at all. The `deny`-type assertions ("...writing source is denied", "...reading a test is denied") are the ones that actually exercise the fix. This mirrors the pattern flagged in round 1 (the green traversal assertion that initially targeted a test path and passed for an unrelated reason) — allow-type assertions are structurally weaker at catching under-matching regressions than deny-type ones, since permitting is also what happens by default when nothing is recognized at all.

The known limitation already on record (symlink-based read-through) remains unchanged and unaffected by this fix.

---

## Fix round 4

**Critical finding, from the final whole-branch review:** `guard.sh` strips the project root by literal prefix match and never normalises either side. A path spelled `./e2e/src/a.py` (or with a doubled slash, e.g. `e2e//src/a.py`) fails to strip cleanly, matches no glob, and — because reads are enforced as a **denylist** — no match means **allow**. Verified live against this repo's own `.tdd/config.json`: `red` was denied `e2e/src/calc/__init__.py` but permitted the identical file spelled `./e2e/src/calc/__init__.py` or `e2e//src/calc/__init__.py`; `green` was permitted to read `./e2e/tests/test_divide.py`, a test file, despite green never being allowed to read tests. Not an adversarial spelling — `./` is how a model habitually writes a relative path.

`tdd_normalize_path` already existed in `hooks/lib/rules.sh` (added in a parallel commit, `3456f9c`, with its own six regression assertions); the missing piece was wiring the call sites into `guard.sh` — `grep -c tdd_normalize_path hooks/guard.sh` returned 0 before this fix.

Implemented the corrected brief verbatim: two lines inserted immediately before the existing root-strip `case`, after the `..`-traversal check and after `rules.sh` is sourced (the function would be undefined if placed earlier, and under `set -uo pipefail` with no `-e` that failure mode is easy to miss).

### Files changed

- `hooks/guard.sh` — added:
  ```bash
  root=$(tdd_normalize_path "$root"); root="${root%/}"
  path=$(tdd_normalize_path "$path")
  ```
  plus an explanatory comment, placed after the traversal-deny `case` and before the `case "$path" in "$root"/*) ...` prefix-strip. No other lines changed. `hooks/hooks.json` and `tests/fixtures/config.json` were unchanged — the brief specified no edits to either this round.
- `tests/guard.test.sh` — added four new assertions (authored by me; the brief's own `tests/guard.test.sh` listing had not been extended with these, only the coordinator's follow-up instructions asked for them): a `./`-prefixed and a `//`-doubled absolute path for red reading source, a `./`-prefixed bare-relative path for red reading source, and a `./`-prefixed bare-relative path for green reading a test. The green case deliberately uses a filename that is *not* `test_*.py` (`helpers.py` under `tests/`) — the fixture's `**/test_*.py` catch-all glob is permissive enough to match an un-normalised `./tests/test_a.py` by coincidence (it matches anything ending in `/test_<x>.py` regardless of what precedes it), which would make that specific assertion pass whether or not normalization actually ran. This is the same trap flagged in round 1 ("a .. segment denies for green too" passing for an unrelated reason); using a non-catch-all filename avoids repeating it.

### Full pass

```
$ bash tests/run.sh
...
  PASS: relative test path is still allowed to red
  PASS: a leading ./ segment in an absolute path still denies red reading source
  PASS: a doubled slash in an absolute path still denies red reading source
  PASS: a leading ./ segment in a relative path still denies red reading source
  PASS: a leading ./ segment in a relative path still denies green reading a test
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread
...

181 passed, 0 failed
exit=0
```

Note on the pass count: the coordinator's checkpoint of "177 passed, 0 failed" is stated in the brief's flow as the result right after implementing the two-line `guard.sh` fix, *before* adding the new guard-level assertions — and that is exactly what I observed: `bash tests/run.sh` reported `177 passed, 0 failed` immediately after the `guard.sh` edit and before touching `tests/guard.test.sh`. (177 also reflects other test files — `tests/config-contract.test.sh` and the now-larger `tests/agents.test.sh`/`tests/rules.test.sh` — added by parallel work on other tasks in this branch since round 3; none of that growth is mine.) After adding my four new assertions, the total is 181, still 0 failed.

### Targeted check 1: bypass closed, against this repo's own live config

Run directly against `hooks/guard.sh` with `TDD_PROJECT_DIR="$PWD"` and this repo's own `.tdd/config.json` (globs `e2e/src/**` / `e2e/tests/**`), not the fixture:

```
$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"Read","tool_input":{"file_path":"e2e/src/calc/__init__.py"}}' \
    | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh
exit=2  {"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may not read source files; e2e/src/calc/__init__.py is under the configured source globs"}

$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"Read","tool_input":{"file_path":"./e2e/src/calc/__init__.py"}}' \
    | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh
exit=2  {"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may not read source files; e2e/src/calc/__init__.py is under the configured source globs"}

$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"Read","tool_input":{"file_path":"e2e//src/calc/__init__.py"}}' \
    | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh
exit=2  {"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: Red may not read source files; e2e/src/calc/__init__.py is under the configured source globs"}

$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-green","tool_name":"Read","tool_input":{"file_path":"./e2e/tests/test_divide.py"}}' \
    | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh
exit=2  {"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"deny: green may not read test files; e2e/tests/test_divide.py is under the configured test globs. Work from the handover report and the test runner's output."}
```

All four exit 2, and every deny message names the same normalized path (`e2e/src/calc/__init__.py`, `e2e/tests/test_divide.py`) regardless of the spelling that triggered it — confirming normalization runs before the glob match rather than merely happening to deny for an unrelated reason.

### Targeted check 2: trailing-slash root

Same four payloads, with `TDD_PROJECT_DIR="$PWD/"`:

```
$ printf '...' | TDD_PROJECT_DIR="$PWD/" bash hooks/guard.sh   # e2e/src/calc/__init__.py
exit=2  ...Red may not read source files; e2e/src/calc/__init__.py...

$ printf '...' | TDD_PROJECT_DIR="$PWD/" bash hooks/guard.sh   # ./e2e/src/calc/__init__.py
exit=2  ...Red may not read source files; e2e/src/calc/__init__.py...

$ printf '...' | TDD_PROJECT_DIR="$PWD/" bash hooks/guard.sh   # e2e//src/calc/__init__.py
exit=2  ...Red may not read source files; e2e/src/calc/__init__.py...

$ printf '...' | TDD_PROJECT_DIR="$PWD/" bash hooks/guard.sh   # ./e2e/tests/test_divide.py
exit=2  ...green may not read test files; e2e/tests/test_divide.py...
```

All four still exit 2 with an identical trailing slash on `TDD_PROJECT_DIR`, confirming `root="${root%/}"` (applied after normalization) handles it.

### Targeted check 3: legitimate cases still pass

```
$ printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-green","tool_name":"Write","tool_input":{"file_path":"e2e/src/calc/__init__.py"}}' \
    | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh
exit=0
stderr: (empty)

$ printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git diff --name-only"}}' \
    | TDD_PROJECT_DIR="$PWD" bash hooks/guard.sh
exit=0
stderr: (empty)
```

Green writing source, and a main-thread payload with no `agent_type` running its own audit command, both still permit silently.

### Bite-check: remove the two normalization lines, confirm the four new assertions fail, restore

Not explicitly requested this round, but done for the same reason as every prior round's mutation check: a passing assertion is only evidence if it can be shown to fail against the defect it claims to catch.

```
$ grep -n "tdd_normalize_path" hooks/guard.sh
140:root=$(tdd_normalize_path "$root"); root="${root%/}"
141:path=$(tdd_normalize_path "$path")

$ cp hooks/guard.sh hooks/guard.sh.bak
$ sed -i '' '140,141d' hooks/guard.sh
$ bash tests/run.sh
...
  PASS: relative test path is still allowed to red
  FAIL: a leading ./ segment in an absolute path still denies red reading source
    expected to contain: 2|
    actual: 0|
  FAIL: a doubled slash in an absolute path still denies red reading source
    expected to contain: 2|
    actual: 0|
  FAIL: a leading ./ segment in a relative path still denies red reading source
    expected to contain: 2|
    actual: 0|
  FAIL: a leading ./ segment in a relative path still denies green reading a test
    expected to contain: 2|
    actual: 0|
  PASS: missing config denies even for an otherwise-legal write
  PASS: missing config still permits the main thread
...

177 passed, 4 failed
exit=1
```

All four new assertions fail — including the green/`helpers.py` case, confirming it genuinely exercises the fix rather than being coincidentally caught by the `**/test_*.py` catch-all glob (which was the exact trap that made a similarly-shaped assertion misleading in round 1). No other assertion regressed, confirming the normalization lines are additive and don't disturb any other path.

Restored:

```
$ mv hooks/guard.sh.bak hooks/guard.sh
$ bash tests/run.sh
...
181 passed, 0 failed
$ git status --porcelain
 M agents/tdd-green.md
 M agents/tdd-mutate.md
 M agents/tdd-red.md
 M agents/tdd-refactor.md
 M hooks/guard.sh
 M tests/guard.test.sh
```

No `.bak` file left behind. The four `agents/*.md` modifications are from parallel work on other tasks in this branch, not touched by me — confirmed by `git diff --stat` on those files before staging, and excluded from what I staged and committed.

### Commit

```
d51b5ff fix(hook): normalise paths before the root-prefix strip
 2 files changed, 29 insertions(+)
 hooks/guard.sh      |  6 ++++++
 tests/guard.test.sh | 23 +++++++++++++++++++++++
```

Staged and committed exactly `hooks/guard.sh` and `tests/guard.test.sh` — the only two files this round touched. Used the `hook` scope (singular) per this repo's commit-scope convention, as the coordinator specified. Verified `hooks/guard.sh` remained mode `100755` in the index after staging (`git ls-files -s`). As in every prior round, a separate parallel commit — `3456f9c` ("fix(hook): normalize paths before glob matching to close a read bypass"), which added `tdd_normalize_path` itself to `rules.sh` — appears earlier in the log; it was not made by me and is not part of my commit. `git show --stat d51b5ff` confirms my commit contains only the two files listed above.

### Concerns after fix round 4

The critical finding is resolved and verified four ways: the full test suite (four new guard-level assertions plus the existing 177), a standalone check against this repo's own live config for all four originally-reported bypass spellings, a trailing-slash-root variant of the same check, a check that the two legitimate cases (main thread, green writing source) are unaffected, and a bite-check confirming all four new assertions are genuinely load-bearing (none pass coincidentally).

No new concerns. The known limitation already on record (symlink-based read-through, not reachable through the currently-mediated tools) remains unchanged and unaffected by this fix. Given this is the fourth round of fixes to this hook — a namespace-matching gap, a decoy-payload path-key gap, and now a path-normalization gap, each surviving a fully green suite until verified against live behavior — the pattern across all four suggests the risk in this file is specifically in *how paths and identities arrive from Claude Code in practice* versus how the design assumed they would arrive; every defect so far has been in that gap, not in the pure decision functions in `rules.sh`, which have held up through all four rounds without a reported defect.
