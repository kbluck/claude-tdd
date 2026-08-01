# Task 3 report: Path decision rules

## What was created

- `hooks/lib/rules.sh` — pure decision functions, sourced only (no shebang, no
  `set` line, no `exit`, no side effects at load time). Defines:
  - `tdd_glob_match <pattern> <path>`
  - `tdd_matches_any <path> <glob1> [glob2 ...]`
  - `tdd_path_verdict <phase> <mode> <path> <test_globs> <source_globs>`
  All three copied verbatim from the brief's Step 3 code block. File ends
  with a trailing newline (confirmed via `tail -c 1 hooks/lib/rules.sh |
  xxd` → `0a`), so Task 4 can append `tdd_bash_verdict` cleanly onto a
  fresh line.
- `tests/rules.test.sh` — copied verbatim from the brief's Step 1 code
  block. No shebang, no `set -e`, no `exit`; relies on `assert_eq` /
  `assert_contains` and `$REPO_ROOT` exported by `tests/run.sh`.

No other files were touched. `hooks/guard.sh` and `hooks/hooks.json` were
intentionally not created (Task 5's scope).

## Step 2: failing run (verbatim)

Command: `bash tests/run.sh` (run before `hooks/lib/rules.sh` existed)

```
Exit code 1

--- rules.test.sh ---
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 3: /Users/kbluck/Claude/code/claude-tdd/hooks/lib/rules.sh: No such file or directory
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 9: tdd_glob_match: command not found
  FAIL: ** normalizes and matches across directories
    expected: yes
    actual:   no
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 12: tdd_glob_match: command not found
  PASS: non-matching glob returns 1
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 15: tdd_glob_match: command not found
  FAIL: leading ** matches nested path
    expected: yes
    actual:   no
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 19: tdd_path_verdict: command not found
  FAIL: red may write a test file
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 21: tdd_path_verdict: command not found
  FAIL: red may not write source
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 23: tdd_path_verdict: command not found
  FAIL: red may not read source
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 25: tdd_path_verdict: command not found
  FAIL: red may read an unclassified file
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 27: tdd_path_verdict: command not found
  FAIL: red may read its own tests
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 31: tdd_path_verdict: command not found
  FAIL: green may write source
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 33: tdd_path_verdict: command not found
  FAIL: green may not write tests
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 35: tdd_path_verdict: command not found
  FAIL: green may not read tests
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 37: tdd_path_verdict: command not found
  FAIL: green may read source
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 41: tdd_path_verdict: command not found
  FAIL: refactor may write source
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 43: tdd_path_verdict: command not found
  FAIL: refactor may not read tests
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 48: tdd_path_verdict: command not found
  FAIL: mutation may write source
    expected: allow
    actual:   
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 50: tdd_path_verdict: command not found
  FAIL: mutation may not write tests
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 52: tdd_path_verdict: command not found
  FAIL: mutation may not read tests
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 56: tdd_path_verdict: command not found
  FAIL: empty phase denies
    expected to contain: deny
    actual: 
/Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 58: tdd_path_verdict: command not found
  FAIL: unknown phase denies
    expected to contain: deny
    actual: 

--- smoke.test.sh ---
  PASS: harness compares equal strings
  PASS: harness finds a substring

3 passed, 18 failed
```

This matches the brief's expectation ("FAIL — `hooks/lib/rules.sh: No such
file or directory`"), with one caveat noted below under Concerns: one of
the 3 reported "passes" (`non-matching glob returns 1`) is vacuous in this
run, not a real pass.

## Step 4: passing run (verbatim)

Command: `bash tests/run.sh` (run after `hooks/lib/rules.sh` was written)

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
  PASS: empty phase denies
  PASS: unknown phase denies

--- smoke.test.sh ---
  PASS: harness compares equal strings
  PASS: harness finds a substring

21 passed, 0 failed
```

Confirmed exit code 0 (`bash tests/run.sh > /dev/null 2>&1; echo $?` → `0`).

## Commit

`bdeaa86` — `feat: phase-aware path decision rules`
Contains exactly `hooks/lib/rules.sh` and `tests/rules.test.sh` (2 files
changed, 106 insertions, 0 deletions). Branch `feat/tdd-subagent-workflow`.

## Concerns

1. **The RED run wasn't fully red.** In the Step 2 failing run, the
   assertion `non-matching glob returns 1` reports PASS even though
   `rules.sh` doesn't exist yet: `tdd_glob_match` fails with "command not
   found" (nonzero exit), so `r=no` in the test's `&& r=yes || r=no`
   idiom, which happens to equal the expected value `"no"`. That pass is
   vacuous — it would pass identically for a correct implementation, a
   missing one, or a wrong one that always fails to match. It does not
   indicate anything was working prematurely; I'm flagging it so it isn't
   mistaken for a real early-pass signal. The other 17 non-smoke
   assertions failed for the expected reason (missing file / commands not
   found).

2. **The `tests/**` normalization test doesn't discriminate an absent
   substitution.** I checked directly: `[[ "tests/a/b.py" == tests/** ]]`
   matches natively in Bash's `[[ ]]` even with *no* `**` → `*`
   normalization at all, because a bare `*` (and therefore `**`) already
   crosses `/` inside `[[ ]]`. So the pinned test case ("`**` normalizes
   and matches across directories") would pass even if
   `tdd_glob_match` did no substitution whatsoever. I verified the
   implementation is correct on its own terms, independent of that test:
   `bash -c 'x="tests/**"; echo "${x//\*\*/*}"'` prints `tests/*` — the
   substitution genuinely collapses `**` to `*` as intended. I also
   reproduced the failure mode the brief warned about: if the replacement
   half uses `\*` instead of `*` (i.e. `${1//\*\*/\*}`), it leaves a
   literal backslash (`tests/\*`) on this Bash (3.2.57), and that
   variant does *not* match `tests/a/b.py` — so the implemented
   `${1//\*\*/*}` (no backslash in the replacement) is the form that
   avoids that bug, confirmed empirically, not just by following the
   brief's prose. Net: the implementation is right; the pinned test
   alone wouldn't have caught the backslash bug variant for this specific
   assertion had it existed, though the same bug would still have broken
   the `**/test_*.py` leading-wildcard test case in the same suite.
   No action taken — `tests/rules.test.sh` was left verbatim per
   instructions.

3. **`tdd_matches_any` is never called directly by the pinned tests**,
   only indirectly through `tdd_path_verdict`. It's implemented and part
   of the declared interface per the brief; noting for visibility only,
   no action needed.

4. **Report file location is gitignored.** `.superpowers/` is excluded by
   the repo's top-level `.gitignore` (confirmed via `git check-ignore -v`
   matching `.gitignore:4:.superpowers/`), consistent with the
   `chore: ignore SDD workspace` commit and the fact that
   `task-2-report.md` is also untracked. This report was written to disk
   but intentionally not added to the commit, matching that precedent.

No correctness defects found. Status: DONE_WITH_CONCERNS (both concerns
above are explanatory/process notes about the pinned test's coverage, not
implementation bugs).

## Fix round 1

Code review found a Critical defect, originating in the original brief
(not in the transcription): the call sites `tdd_matches_any "$path"
$test_globs` / `$source_globs` left the glob-string argument unquoted.
Unquoted expansion in bash undergoes **pathname expansion** as well as
word splitting, so `src/**` was silently replaced by whatever files
happened to exist on disk in the current working directory. Consequence:
`tdd_path_verdict red read src/pkg/module.py ...` returned `allow` when
run from a directory containing a `src/` tree, and `deny` from anywhere
else — a CWD-dependent, silent fail-open on read isolation, undetectable
by the original 21/0 run because no fixture directory in that suite
contained an actual `src/` tree and the glob string happened to still
"work" for the flat fixtures used.

The brief was rewritten and re-read from
`.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-3-brief.md`
(current version). Changes implemented verbatim:

- `tdd_matches_any` signature changed from variadic (`<path> <glob>...`)
  to a single quoted glob-string argument (`<path> <glob-string>`). It
  now splits internally under `set -f` (pathname expansion disabled),
  saving and restoring the caller's noglob flag via `case "$-" in *f*)`.
  This confines the hazard to one function; every call site now passes
  `"$test_globs"` / `"$source_globs"` quoted.
- Every parameter in `tdd_glob_match` and `tdd_path_verdict` now defaults
  to empty (`${1:-}` etc.), since this file is sourced under `set -u` and
  an unset positional would otherwise abort the sourcing script with a
  non-blocking exit code, letting the tool call through instead of
  denying it.
- `tdd_path_verdict` now explicitly denies whenever the *governing* glob
  list for that phase/mode is empty, rather than treating an empty glob
  string as "matches nothing, so allow/deny falls through by luck."
- `tests/rules.test.sh` gained: three empty-glob-list fail-closed
  assertions; a regression block that builds a scratch tree (via
  `mktemp -d`) containing `src/a.py`, `src/pkg/module.py`,
  `tests/test_a.py`, `cd`s into it, and asserts Red/Green verdicts are
  unaffected by that tree's existence; and an assertion that
  `tdd_matches_any`'s caller-visible `set -f`/`set +f` state is restored
  after the call.

### Covering tests / commands run

1. **New tests against the pre-fix (still-buggy) code** — confirms the
   new regression tests actually detect the described defect before any
   fix is applied.

   Command: `bash tests/run.sh` (run with the *old* `hooks/lib/rules.sh`
   from commit `bdeaa86` still in place, new `tests/rules.test.sh`
   already written)

   ```
   Exit code 1

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
     FAIL: empty source globs deny a read rather than permitting it
       expected to contain: deny
       actual: allow
     FAIL: empty test globs deny a read rather than permitting it
       expected to contain: deny
       actual: allow
     PASS: empty test globs deny a write
     FAIL: red may not read nested source even when src/ exists on disk
       expected to contain: deny
       actual: allow
     PASS: red may not read top-level source even when it exists on disk
     PASS: green may not read an existing test file
     FAIL: green may write nested source that exists on disk
       expected: allow
       actual:   deny: green may only write source files; src/pkg/module.py is not under the configured source globs
     FAIL: green may write nested source that does NOT exist yet
       expected: allow
       actual:   deny: green may only write source files; src/pkg/brand_new.py is not under the configured source globs
     PASS: tdd_matches_any restores the caller's noglob flag

   --- smoke.test.sh ---
     PASS: harness compares equal strings
     PASS: harness finds a substring

   25 passed, 5 failed
   ```

   The first failure (`red may not read nested source even when src/
   exists on disk` → got `allow`) is the exact defect from the finding,
   reproduced directly.

2. **Full suite against the fixed implementation:**

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

   --- smoke.test.sh ---
     PASS: harness compares equal strings
     PASS: harness finds a substring

   30 passed, 0 failed
   ```

   Exit code confirmed 0.

3. **Bite check: temporarily revert `hooks/lib/rules.sh` to the old
   unquoted-variadic form and re-run against the new (fixed) test file.**
   `git show bdeaa86:hooks/lib/rules.sh > hooks/lib/rules.sh` (whole-file
   revert, since the old bug required both the old `tdd_matches_any` body
   *and* the old unquoted call sites in `tdd_path_verdict` — reverting
   `tdd_matches_any` alone while the call sites still quote their
   argument would not reproduce the hazard). Output is identical to run
   1 above: `25 passed, 5 failed`, exit 1, with the same five regression
   assertions failing for the same reasons. Then restored the fixed file
   (`cp` from a pre-revert backup) and re-ran to confirm `30 passed, 0
   failed`, exit 0 — shown in run 2's block above, re-verified after
   restore. `git diff` against the pre-revert backup showed no
   difference, confirming the restore was exact.

### Commit

`fe465de` — `fix: guard glob splitting against pathname expansion`
Contains `hooks/lib/rules.sh` and `tests/rules.test.sh` (2 files changed,
99 insertions, 22 deletions). Branch `feat/tdd-subagent-workflow`, on top
of `bdeaa86`.

### Concerns

- None found in the corrected implementation. The fail-closed-on-empty
  behavior (`[ -z "$test_globs" ]` / `[ -z "$source_globs" ]` checks in
  `tdd_path_verdict`) is a new branch not exercised by mutation testing
  in this task — Task 6 (mutation hardening) or a later review pass
  should confirm those specific branches are covered, not just the
  paths that were already covered before this fix.
- An unrelated commit, `25d8888` (`fix: confine glob splitting to
  tdd_matches_any under set -f`), appeared in the branch history between
  my prior commit (`bdeaa86`) and this one. It touches only
  `docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md` (plan/
  progress tracking), not `hooks/lib/rules.sh` or
  `tests/rules.test.sh` — confirmed via `git show --stat 25d8888`. No
  conflict with this fix; noting for traceability since it wasn't a
  commit I made.

## Fix round 2

Whole-branch review found a second Critical defect, this time a live
bypass verified against the repo's real config rather than a fixture:
paths were never normalised before glob matching. `hooks/guard.sh`
strips the project root from an absolute path by literal prefix; the
result is then matched against `test_globs`/`source_globs`. A path
spelled with an ordinary alternative — `./e2e/src/calc/__init__.py`
instead of `e2e/src/calc/__init__.py`, or `e2e//src/...` with a doubled
slash — fails to strip cleanly (or strips to something that still
carries the artifact) and matches no configured glob. Because reads are
a **denylist** (no-match means allow), the unnormalised spelling is
silently *more* permissive than the canonical one: Red was denied
`e2e/src/calc/__init__.py` directly but permitted the identical file
under `./e2e/src/calc/__init__.py`. `./` is not an adversarial spelling
— it is how a model routinely writes a relative path — so this was a
live, easily-triggered hole in the one guarantee (Red can't read
implementation source) the whole design exists to enforce.

It escaped every prior round because `tests/guard.test.sh` (Task 5,
not mine) exercises exactly one relative spelling and asserts it's
denied, which is true and looks like proof the guard handles relative
paths in general — the same shape of gap as the earlier `agent_type`
namespace defect: a passing test that is not evidence the underlying
property holds for the untested spellings.

The brief was re-read from
`.superpowers/sdd/2026-07-30-tdd-subagent-workflow/task-3-brief.md`
(current version) and implemented verbatim: a new function,
`tdd_normalize_path <path>`, inserted between `tdd_matches_any` and
`tdd_path_verdict` in `hooks/lib/rules.sh`. It collapses repeated
slashes via `tr -s '/'`, then loops stripping a leading `./` and
collapsing `/./` segments via `case` pattern matching, until neither
applies. An absolute path's leading `/` is preserved because `tr -s '/'`
only *squeezes* repeated slashes, it doesn't remove a lone one. Empty
input returns empty rather than falling through to any of the `case`
arms. `tdd_path_verdict` itself is **unchanged** — this task only
supplies the normaliser; wiring it into `guard.sh`'s call sites before
`tdd_path_verdict` is invoked is explicitly Task 5's responsibility per
the coordinator's instruction, and `hooks/guard.sh` was not opened or
modified in this round.

As instructed, the brief's warning about the identical backslash trap
from round 1's `**` normalization bug was taken seriously rather than
trusted on faith: `${p//\/\//\/}` was never written into the file at
all — the brief specifies `tr -s '/'` directly — but the claim that
this form is correct was still verified empirically by running the
final function and inspecting byte-exact output (see step 3.3 below),
not just by reading the brief's prose.

### Covering tests / commands run

1. **New tests against the pre-fix code** (`tdd_normalize_path` not yet
   defined) — confirms the six new assertions fail for the right reason
   before any implementation exists.

   Command: `bash tests/run.sh` (run with `tests/rules.test.sh` already
   carrying the six new assertions, `hooks/lib/rules.sh` not yet
   touched)

   Relevant excerpt (full suite: 172 passed, 5 failed):
   ```
   /Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 74: tdd_normalize_path: command not found
     FAIL: leading ./ is stripped
       expected: e2e/src/a.py
       actual:
   /Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 76: tdd_normalize_path: command not found
     FAIL: repeated slashes collapse
       expected: e2e/src/a.py
       actual:
   /Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 78: tdd_normalize_path: command not found
     FAIL: /./ segments collapse
       expected: e2e/src/a.py
       actual:
   /Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 80: tdd_normalize_path: command not found
     FAIL: all three at once
       expected: e2e/src/a.py
       actual:
   /Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 82: tdd_normalize_path: command not found
     FAIL: an absolute path keeps its leading slash
       expected: /abs/e2e/src/a.py
       actual:
   /Users/kbluck/Claude/code/claude-tdd/tests/rules.test.sh: line 84: tdd_normalize_path: command not found
     PASS: empty input stays empty rather than erroring
   ```
   The sixth assertion (`empty input stays empty rather than erroring`)
   passed vacuously here — "command not found" produces empty output,
   which happens to equal the expected empty string — the same shape of
   vacuous pass noted for round 1's Step 2. It is not evidence the
   function was already correct; the bite check in step 3 below is what
   actually establishes that.

2. **Full suite against the fixed implementation:**

   Command: `bash tests/run.sh`

   ```
   30 total assertions in rules.test.sh, including:
     PASS: leading ./ is stripped
     PASS: repeated slashes collapse
     PASS: /./ segments collapse
     PASS: all three at once
     PASS: an absolute path keeps its leading slash
     PASS: empty input stays empty rather than erroring
     [... all other rules.test.sh and full-suite assertions also PASS ...]

   177 passed, 0 failed
   ```
   (Full suite total is 177 because `agents.test.sh`, `config-contract.test.sh`,
   and `guard.test.sh` — none of them mine, added by Tasks 4/5/7 while
   this fix was in progress — are now also picked up by `tests/run.sh`.)
   Exit code confirmed 0.

3. **Bite check.** Replaced `tdd_normalize_path`'s body with a
   pass-through (`printf '%s' "$1"`), leaving everything else in
   `hooks/lib/rules.sh` untouched, and re-ran:

   ```
     FAIL: leading ./ is stripped
       expected: e2e/src/a.py
       actual:   ./e2e/src/a.py
     FAIL: repeated slashes collapse
       expected: e2e/src/a.py
       actual:   e2e//src/a.py
     FAIL: /./ segments collapse
       expected: e2e/src/a.py
       actual:   e2e/./src/a.py
     FAIL: all three at once
       expected: e2e/src/a.py
       actual:   .//e2e/./src//a.py
     FAIL: an absolute path keeps its leading slash
       expected: /abs/e2e/src/a.py
       actual:   /abs//e2e/./src/a.py
     PASS: empty input stays empty rather than erroring

   172 passed, 5 failed
   ```
   Five of six regression assertions fail against the pass-through, each
   showing exactly the un-normalised input echoed back. The sixth
   (`empty input ...`) passes under a pass-through too, since
   `printf '%s' ""` is still empty — that assertion is correctly
   *consistent* with a working normaliser but, on its own, cannot
   distinguish "normalizes empty to empty" from "does nothing to
   anything"; the other five assertions are what carry the discriminating
   power for this function. Restored the fixed implementation from a
   pre-revert backup (`cp`); `diff` against the backup showed no
   difference, and the full suite returned to `177 passed, 0 failed`,
   exit 0.

   Then, as the coordinator asked, printed the fixed function's actual
   output for each of the six inputs directly — not just via the
   assertions — using `od -c` for a byte-exact view, specifically to
   rule out a silently-wrong output like `e2e\/src/a.py` (a literal
   backslash) passing an assertion that only checks a substring or gets
   the comparison backwards:
   ```
   ./e2e/src/a.py        -> e2e/src/a.py           (12 bytes, no backslash)
   e2e//src/a.py         -> e2e/src/a.py           (12 bytes, no backslash)
   e2e/./src/a.py        -> e2e/src/a.py           (12 bytes, no backslash)
   .//e2e/./src//a.py    -> e2e/src/a.py           (12 bytes, no backslash)
   /abs//e2e/./src/a.py  -> /abs/e2e/src/a.py      (17 bytes, no backslash)
   "" (empty)             -> (0 bytes)
   ```
   All six outputs are byte-exact matches for the expected normalised
   path with no stray characters.

### Commit

`3456f9c` — `fix(hook): normalize paths before glob matching to close a
read bypass`. Contains `hooks/lib/rules.sh` and `tests/rules.test.sh`
(2 files changed, 49 insertions, 0 deletions). Branch
`feat/tdd-subagent-workflow`. `hooks/guard.sh` was not touched, per the
coordinator's instruction that its call sites are Task 5's to wire up.

Scope note: the coordinator asked for the "hooks" scope; this repo's
established convention (per `AGENTS.md` and the branch's own commit
history, e.g. `a7fca4e fix(hook): prevent glob splitting against
pathname expansion`) uses the singular `hook`, so that's what was used.

### Concerns

- **Round 1's commits are no longer in this branch's ancestry.**
  `bdeaa86` and `fe465de` (my round 1 commits, referenced above) exist
  as objects but `git merge-base --is-ancestor` shows neither is an
  ancestor of current `HEAD` — the branch history was rewritten at some
  point while other tasks (4, 5, 7, e2e fixtures, and a large
  scope-convention cleanup pass) landed concurrently. The equivalent
  content now lives under `8946a4d feat(hook): add phase-aware path
  decision rules` and `a7fca4e fix(hook): prevent glob splitting
  against pathname expansion` — same diffs, proper scopes, different
  SHAs. This round's work was built on and committed against current
  `HEAD` (`1f933db` at the time of commit), so nothing was lost, but the
  round 1 section of this report above cites SHAs that a `git show` will
  no longer find. Flagging this so it isn't mistaken for missing work.
- The normaliser doesn't handle `..` segments (path traversal) — that
  wasn't in scope for this finding or this brief, and `guard.test.sh`
  (Task 5, already in the suite) separately covers `..` segments being
  denied at the guard layer. Noting only so it isn't assumed
  `tdd_normalize_path` is a general-purpose path canonicalizer; it does
  exactly the three things the brief specifies and nothing more.
