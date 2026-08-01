# Task 4 report: Bash command allowlist

## What was changed

- `hooks/lib/rules.sh` — appended `tdd_bash_verdict <command> <template>`.
  Signature and the two rules (static-prefix match; delta-scoped
  metacharacter ban on `; | & > < \` $( <newline>`) are exactly as specified
  in the brief. One deliberate deviation from the brief's literal code
  block: `local cmd="$1" template="$2"` was changed to
  `local cmd="${1:-}" template="${2:-}"`. Rationale below.
- `tests/rules.test.sh` — appended the brief's Step 1 pinned test block
  verbatim, plus three additional assertions (also below).

Nothing else was touched. `hooks/guard.sh` and `hooks/hooks.json` were not
created (Task 5's scope), per instructions.

### Deviation from the brief: parameter defaults

The brief's Step 3 code uses bare `local cmd="$1" template="$2"`. Every
other function in this file (`tdd_glob_match`, `tdd_matches_any`,
`tdd_path_verdict`) already defaults every positional via `${n:-}`, with a
comment explaining why: the file is sourced under `set -u`
(`tests/run.sh` line 3: `set -uo pipefail`), and an unset positional
aborts the sourcing script with a non-blocking exit code that lets the
guarded tool call through instead of denying it — a fail-open, not a
crash-and-stop. This is the exact class of defect Task 3 shipped and then
fixed (unquoted glob expansion silently fail-opening reads).

I verified this empirically before deciding:

```
$ bash -c 'set -u; f() { local a="$1"; echo got; }; f; echo "after rc=$?"'
bash: $1: unbound variable
```

(exit 127, confirming an unset positional does abort the function.)

I kept the brief's exact function signature, the two rules, and all of its
pinned test cases verbatim (as instructed). Only the internal parameter
handling was adapted to match the file's own established, documented
invariant. This is noted here as a deviation for visibility, not something
requiring approval from the brief author, since the brief's function
signature (`tdd_bash_verdict <command> <template>`) and both rules are
unchanged and every pinned assertion still passes unmodified.

### Additional test assertions (beyond the brief's pinned set)

1. **Glob characters in the agent-supplied delta are treated as data, not
   a pattern.** `case "$cmd" in "$prefix"*)` and the metacharacter `case`
   both rely on quoting to keep the *pattern* side literal; the *subject*
   side (`$cmd` / `$delta`) is never reinterpreted as a pattern by `case`
   regardless of what characters it contains. This is correct by
   construction in the brief's snippet, but pytest's own parametrized node
   IDs (`test_x[case-1]`) and `-k` expressions (`-k test_*`) are a
   realistic, common case where `[`, `*` appear in real agent-supplied
   arguments, so I pinned it directly rather than relying only on
   reasoning about `case` semantics:
   - `pytest -q tests/test_a.py::test_x[case-1]` against `T_SINGLE` → allow
   - `pytest -q -k test_*` against `T_FULL` → allow
2. **A missing (not just empty) template must deny, not crash the
   suite.** `tdd_bash_verdict "pytest -q" 2>/dev/null` (template argument
   omitted entirely) must still produce a string containing `deny`. This is
   the direct test for the `${2:-}` fix described above; run inside the
   assertion's own `$(...)` subshell so a crash there degrades to an empty
   captured string (visible as a normal FAIL) rather than aborting
   `tests/run.sh` itself.

## Step 2: failing run (verbatim)

Command: `bash tests/run.sh`, run after appending only the new tests
(implementation not yet appended).

```
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
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 108: tdd_bash_verdict: command not found
  FAIL: substituted test id is allowed
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 110: tdd_bash_verdict: command not found
  FAIL: exact template match is allowed
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 112: tdd_bash_verdict: command not found
  FAIL: template containing a colon path is allowed verbatim
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 115: tdd_bash_verdict: command not found
  FAIL: unrelated command is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 117: tdd_bash_verdict: command not found
  FAIL: semicolon in delta is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 119: tdd_bash_verdict: command not found
  FAIL: pipe in delta is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 121: tdd_bash_verdict: command not found
  FAIL: redirect in delta is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 123: tdd_bash_verdict: command not found
  FAIL: command substitution in delta is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 125: tdd_bash_verdict: command not found
  FAIL: and-chain in delta is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 127: tdd_bash_verdict: command not found
  FAIL: in-place edit via bash is denied
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 129: tdd_bash_verdict: command not found
  FAIL: empty template denies
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 137: tdd_bash_verdict: command not found
  FAIL: glob characters in a parametrized test id are treated as data, not a pattern
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 139: tdd_bash_verdict: command not found
  FAIL: glob characters after the prefix are treated as literal data, not a pattern
    expected: allow
    actual:   
  FAIL: missing template argument denies rather than crashing
    expected to contain: deny
    actual: 

--- smoke.test.sh ---
  PASS: harness compares equal strings
  PASS: harness finds a substring

30 passed, 14 failed
EXIT: 1
```

All 14 new assertions failed for the expected reason (`tdd_bash_verdict:
command not found`, except the last, whose "command not found" line was
swallowed by its own `2>/dev/null` — the empty captured haystack is the
visible symptom there instead). The 30 pre-existing assertions were
untouched and still passed.

## Step 4: passing run (verbatim)

Command: `bash tests/run.sh`, run after appending the implementation.

```
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
  PASS: glob characters in a parametrized test id are treated as data, not a pattern
  PASS: glob characters after the prefix are treated as literal data, not a pattern
  PASS: missing template argument denies rather than crashing

--- smoke.test.sh ---
  PASS: harness compares equal strings
  PASS: harness finds a substring

44 passed, 0 failed
EXIT: 0
```

30 (prior) + 14 (new) = 44, zero failures, exit code confirmed 0.

## Bite checks (verbatim)

Four separate breaks were applied, one at a time, each verified against
the full suite and restored (via `diff` against a saved-good copy,
confirmed byte-identical) before the next.

### Break 1 — neutralize the metacharacter `case` (make it never match)

Changed the delta `case` patterns to a single pattern that can never
match (`__NEVER_MATCHES__`), so no delta is ever denied for containing a
metacharacter.

```
  PASS: template containing a colon path is allowed verbatim
  PASS: unrelated command is denied
  FAIL: semicolon in delta is denied
  FAIL: pipe in delta is denied
  FAIL: redirect in delta is denied
  FAIL: command substitution in delta is denied
  FAIL: and-chain in delta is denied
  PASS: in-place edit via bash is denied
  PASS: empty template denies
...
39 passed, 5 failed
```

Exactly the 5 delta-metacharacter assertions failed; the prefix-based
denials (`unrelated command`, `in-place edit via bash`) still passed
because they're rejected before the delta check ever runs. Restored;
re-ran to confirm 44/0 before the next break.

### Break 2 — neutralize the prefix `case` (make it always match)

Changed `case "$cmd" in "$prefix"*) ;; *) deny ;; esac` to `case "$cmd" in
*) ;; esac` (always falls through as if the prefix matched).

```
  PASS: template containing a colon path is allowed verbatim
  FAIL: unrelated command is denied
  PASS: semicolon in delta is denied
  PASS: pipe in delta is denied
  PASS: redirect in delta is denied
  PASS: command substitution in delta is denied
  PASS: and-chain in delta is denied
  FAIL: in-place edit via bash is denied
  PASS: empty template denies
...
42 passed, 2 failed
```

Exactly the 2 predicted assertions failed: with no real prefix match,
`${cmd#"$prefix"}` removes nothing, so `delta` is the whole command; `rm
-rf src` and `sed -i s/a/b/ src/a.py` contain no banned metacharacter, so
both incorrectly returned `allow`. Restored; re-ran to confirm 44/0.

### Break 3 — neutralize the empty-template guard

Changed `if [ -z "$template" ]; then ... fi` to `if false; then ... fi`.

```
  PASS: in-place edit via bash is denied
  FAIL: empty template denies
  PASS: glob characters in a parametrized test id are treated as data, not a pattern
  PASS: glob characters after the prefix are treated as literal data, not a pattern
  FAIL: missing template argument denies rather than crashing
...
42 passed, 2 failed
```

Both assertions gated by this guard failed — the brief's pinned "empty
template denies" case, and my added "missing template argument" case
(which also has an empty `template` after the `${2:-}` default applies).
Restored; re-ran to confirm 44/0.

### Break 4 — revert `${1:-}`/`${2:-}` to the brief's literal bare `$1`/`$2`

This is the deviation-justification check: confirms the added
"missing template argument" test actually discriminates the two forms.

```
  FAIL: missing template argument denies rather than crashing
...
43 passed, 1 failed
```

Only that one assertion failed — with a bare `$2`, calling
`tdd_bash_verdict "pytest -q"` (template omitted) aborts inside the
`$(...)` subshell under `set -u`, yielding an empty captured string that
does not contain "deny". Restored; re-ran to confirm 44/0.

All four restores were verified via `diff` against a saved-good copy of
`hooks/lib/rules.sh` (byte-identical each time) before the final commit.

## Commit

`440accc` — `feat: bash command allowlist with delta-scoped metacharacter ban`
Branch `feat/tdd-subagent-workflow`, on top of `fe465de`.
Contains exactly `hooks/lib/rules.sh` and `tests/rules.test.sh` (2 files
changed, 90 insertions, 0 deletions). Working tree clean after commit.

## Concerns

1. **Deviation from the brief's literal implementation code** (documented
   above and in the commit body): `${1:-}`/`${2:-}` instead of bare
   `$1`/`$2`. The function's signature, both rules, and every one of the
   brief's pinned test assertions are unchanged and pass verbatim; only
   internal parameter handling changed, to match this file's own
   established `set -u` safety convention (visible in `tdd_path_verdict`'s
   comment block) and to avoid repeating the exact fail-open class of bug
   fixed in the immediately preceding commit (`fe465de`). Flagging for
   visibility in case the brief's exact code was expected to be typed
   in unmodified.
2. **No word boundary after the prefix.** With `T_FULL="pytest -q"`, the
   command `pytest -qq` (or `pytest -q --anything-agent-likes`) is
   allowed, because the prefix match is a plain string-starts-with check
   with no boundary requirement. This is the brief's specified design —
   the delta metacharacter ban is the actual guard — not a defect; noting
   for the record since it wasn't independently re-verified against a
   real config beyond the templates in this task's own tests.
3. **Trailing-whitespace trim only strips spaces, not tabs**, in the
   `while [ "${prefix% }" != "$prefix" ]; do prefix="${prefix% }"; done`
   loop (copied verbatim from the brief). Not exercised by any pinned or
   added test; low risk since `config.json` command templates are
   expected to be authored with normal spaces, but noting since it's an
   edge the current tests don't cover.
4. **Report file location is gitignored** (`.superpowers/` excluded per
   the repo's `.gitignore`), consistent with prior task reports in this
   directory (task-2, task-3). Written to disk but not part of the commit.

No correctness defects found in the shipped implementation. All four bite
checks confirmed the relevant assertions fail against a broken
implementation and pass against the fixed one. Status: DONE.

## Fix round 1

Code review found an Important gap, originating in the brief (not in my
transcription): a template whose static prefix is empty or
whitespace-only left `prefix=""`, degenerating `case "$cmd" in
"$prefix"*)` to `case "$cmd" in *)`, which matches any string. The
allowlist then fell through to checking only the delta's punctuation, so
a clean, unrelated command was permitted — e.g. `tdd_bash_verdict "cp -r
/etc /tmp/exfil" "   "` and `tdd_bash_verdict "rm -rf /tmp/pwned"
"{cmd}"` both returned `allow`. The existing `[ -z "$template" ]` guard
did not catch either case, since `"   "` and `"{cmd}"` are both
non-empty strings. Not agent-reachable (`.tdd/config.json` is
human-confirmed at init and no constrained agent may write it), but the
guard's own comment promises fail-closed behavior and this input broke
that promise.

The brief was rewritten and re-read from
`.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-4-brief.md`
(current version). Changes implemented verbatim from the corrected
brief, applied on top of my prior `${1:-}`/`${2:-}` deviation (kept —
see Concern 1 above; the new brief did not ask me to revert it and
reverting it would reintroduce that same fail-open class):

- After the trailing-whitespace trim, an empty `prefix` now denies with
  `"deny: the configured command for this phase has no static prefix, so
  it cannot constrain anything; the guard fails closed"`.
- The trim loop changed from a literal-space `while [ "${prefix% }" !=
  "$prefix" ]; do prefix="${prefix% }"; done` to a `[[:space:]]`-based
  loop, so a tab before the placeholder is trimmed too instead of
  surviving into the prefix and causing a false denial. (This was my own
  self-flagged Concern 3 from the first round — a false-denial direction,
  not a false-allow, but still wrong.)
- `tests/rules.test.sh` gained four pinned assertions: whitespace-only
  template denies, placeholder-only template denies, a template starting
  with a placeholder denies, and a tab-trailing prefix still matches a
  normal invocation (`allow`).

### Step: verify the two reported reproduction cases

Command, run directly against the fixed `hooks/lib/rules.sh`:

```
$ source hooks/lib/rules.sh
$ tdd_bash_verdict "cp -r /etc /tmp/exfil" "   "
deny: the configured command for this phase has no static prefix, so it cannot constrain anything; the guard fails closed
$ tdd_bash_verdict "rm -rf /tmp/pwned" "{cmd}"
deny: the configured command for this phase has no static prefix, so it cannot constrain anything; the guard fails closed
```

Both now deny, matching the brief's required behavior.

### Full suite after the fix (verbatim)

Command: `bash tests/run.sh`

```
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

48 passed, 0 failed
EXIT: 0
```

48 = 44 (prior) + 4 (new). Zero failures, exit 0.

### Bite check A — revert the empty-prefix guard

Command: changed `if [ -z "$prefix" ]; then ... fi` to `if false; then
... fi`, then `bash tests/run.sh`.

```
  PASS: template containing a colon path is allowed verbatim
  PASS: unrelated command is denied
  PASS: semicolon in delta is denied
  PASS: pipe in delta is denied
  PASS: redirect in delta is denied
  PASS: command substitution in delta is denied
  PASS: and-chain in delta is denied
  PASS: in-place edit via bash is denied
  PASS: empty template denies
  FAIL: whitespace-only template denies rather than allowing any clean command
  FAIL: placeholder-only template denies
  FAIL: template starting with a placeholder denies
  PASS: trailing tab is trimmed from the static prefix
  PASS: glob characters in a parametrized test id are treated as data, not a pattern
  PASS: glob characters after the prefix are treated as literal data, not a pattern
  PASS: missing template argument denies rather than crashing
...
45 passed, 3 failed
```

Exactly the 3 predicted assertions failed. Restored via `cp` from a
saved-good backup, confirmed byte-identical via `diff`, re-ran to confirm
`48 passed, 0 failed`.

### Bite check B — revert the tab-aware trim to the space-only loop

Command: changed the `[[:space:]]`-based `while` loop back to `while [
"${prefix% }" != "$prefix" ]; do prefix="${prefix% }"; done`, then `bash
tests/run.sh`.

```
  FAIL: trailing tab is trimmed from the static prefix
...
47 passed, 1 failed
```

Exactly the 1 predicted assertion failed — with only literal spaces
trimmed, the tab before `{testId}` survives into the prefix, so
`"pytest -q\t"` never matches as a prefix of `"pytest -q tests/t.py::x"`
(the agent's actual invocation has a space, not a tab, after `-q`).
Restored via `cp` from the saved-good backup, confirmed byte-identical
via `diff`, re-ran to confirm `48 passed, 0 failed`.

Both restores were verified against
`/private/tmp/claude-501/-Users-kbluck-Claude-code-claude-tdd/338deb86-aee0-4bc0-850d-d9b18163a55e/scratchpad/rules.sh.round2.good.bak`
(saved immediately after the fix passed cleanly, before either bite
check).

### Commit

`8b0133e` — `fix: deny bash templates whose static prefix is empty or whitespace`
Branch `feat/tdd-subagent-workflow`, on top of `19bdc1c`.
Contains exactly `hooks/lib/rules.sh` and `tests/rules.test.sh` (2 files
changed, 36 insertions, 2 deletions). Working tree clean after commit.

Note: `19bdc1c` (`fix: deny a configured command with no static prefix`)
appeared in the branch history between my Task 4 commit (`440accc`) and
this fix commit. It touches only
`docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` (plan/
progress tracking), confirmed via `git show --stat 19bdc1c` — not
`hooks/lib/rules.sh` or `tests/rules.test.sh`. No conflict with this fix;
noting for traceability since it wasn't a commit I made, matching the
same pattern seen once before in Task 3's report.

### Concerns (fix round 1)

None found in the corrected implementation. Concerns 1–4 from the
original report still stand as recorded (parameter-default deviation,
no word boundary after the prefix, and the gitignored report location);
concern 3 (tab not trimmed) is now resolved by this fix and is no longer
live. Two additional review observations were explicitly deferred by the
coordinator and require no action here: the prefix match's lack of a
word boundary (intended design), and `${template%%\{*}` also truncating
at a brace-expansion `{` (a Task 7 config-authoring concern, not a
defect in this function).

Status: DONE.
