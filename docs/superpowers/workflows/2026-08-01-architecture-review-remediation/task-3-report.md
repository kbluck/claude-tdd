# Task 3 report: Port the guard and the decision rules to Node

## Summary

Filled in `hooks/lib/rules.mjs` (was a denying stub from Task 2) and wrote `hooks/guard.mjs` from
scratch. Moved `hooks/hooks.json` to exec form (`"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"]`).
Promoted all 20 `test.todo()` entries in `tests/guard.test.mjs` to real subprocess tests. Added
`package.json` + `tsconfig.json` (devDependencies only, `noEmit`, `allowJs`/`checkJs`) and verified
`tsc --noEmit` passes clean. Deleted the retired bash implementation (`hooks/guard.sh`,
`hooks/lib/rules.sh`) and the now-fully-superseded bash test harness (`tests/run.sh` and all
`tests/*.test.sh`), and updated AGENTS.md's Tests section accordingly (Traps section untouched, per
ruling).

## Files changed

- `hooks/guard.mjs` — new. The I/O shell: version-floor check, stdin/JSON, agent/role dispatch,
  config load, tool-to-mode/path-key dispatch, bash-command-key selection, deny emission.
- `hooks/lib/rules.mjs` — filled in from the Task 2 stub. `globMatch`, `matchesAny`, `toRepoRelative`,
  `pathVerdict`, `bashVerdict`, `runtimeSupported`. No exported name or signature changed from the
  pinned stub.
- `hooks/hooks.json` — exec form.
- `tests/guard.test.mjs` — 20 todos promoted to real tests (subprocess-spawns `node hooks/guard.mjs`);
  tripwire test replaced with a "guard.mjs exists" sanity check.
- `package.json`, `tsconfig.json`, `package-lock.json` — new, devDependencies only.
- `AGENTS.md` — Tests section rewritten for `node --test`; Traps section untouched.
- Deleted: `hooks/guard.sh`, `hooks/lib/rules.sh`, `tests/run.sh`, `tests/guard.test.sh`,
  `tests/rules.test.sh`, `tests/config-contract.test.sh`, `tests/agents.test.sh`, `tests/smoke.test.sh`.

## Design decisions of note

**`toRepoRelative`** unifies "resolve fully" and "resolve nearest existing ancestor + re-append tail"
into one loop: walk from the full absolute path upward one segment at a time, calling
`fs.realpathSync.native` on each candidate; the first one that resolves is the ancestor, and
whatever wasn't tried is the tail. When the full path already exists this degenerates to a single
successful call with an empty tail — no special-casing needed for "the whole thing exists" vs "the
leaf is new" vs "a whole new subdirectory". Separators are converted to `/` on the raw input *before*
any filesystem call (not "after canonicalisation" as one reading of the spec prose might suggest) —
this is what makes the `backslashSeparators` spelling-matrix row resolve in one direct `realpath`
call rather than needing the ancestor-walk fallback, and it doesn't affect the S2a (`$ROOT/.`) case
since that's handled by realpath natively regardless.

**`pathVerdict`**'s case-fold (reads only, per spec) is implemented as "try the literal path, then
try `.toLowerCase()`, either match denies" — with the SAME deny-reason template regardless of which
one matched, which is what makes the `paths.test.mjs` spelling matrix's `assertSameVerdict` on
upper-case rows hold (literal match and folded match must be indistinguishable in the output).

**`guard.mjs`'s traversal check (`containsDotDotSegment`) lives in the guard, not in `toRepoRelative`.**
`toRepoRelative` must resolve an internal `..` as an ordinary filesystem operation (the
`dotdotTraversal` spelling-matrix row requires `ROOT/tests/../src/a.py` to canonicalise to
`src/a.py` and get the *reference* verdict) — so the two files test different things and don't
conflict: `toRepoRelative` never rejects `..`; `guard.mjs` rejects a literal `/../` segment in the
untrusted raw payload path before `toRepoRelative` ever sees it. Confirmed by grep that neither
`paths.test.mjs` nor `rules.test.mjs` spawns a subprocess — they call the pure functions directly, so
there's no double-guard to reconcile.

**`bashVerdict` implements the `..`-in-delta ban.** The pinned `rules.mjs` JSDoc (Task 2's contract)
says explicitly: "the delta ... must contain no shell metacharacter and no `..`." I implemented this.
See "Known deviation" below for why this matters against baseline.

## TDD evidence

### RED before (baseline, from the parent task)

```
node --test   →  293 tests, 149 pass, 123 fail, 21 todo
```

### GREEN after

```
node --test   →  293 tests, 289 pass, 3 fail, 1 todo
```

Failing set (exact identities, not just count):
```
case-fold: a wrong-case WRITE of a test file is DENIED for red too      <- see "Known deviation" below
drift check: every key the spec declares also appears in tests/fixtures/config.json    <- Task 8's
drift check: every key the spec declares also appears in the tdd-init.md Step 7 template <- Task 8's
```

The `hooks.json: PreToolUse is registered in EXEC form` test — the third item in the parent's
disclosed known-red baseline — is now green.

### guard.test.mjs specifically

```
node --test tests/guard.test.mjs   →  22 tests, 22 pass, 0 fail, 0 todo
```

All 20 promoted todos pass; the tripwire was replaced with a "guard.mjs exists" sanity check.

### Bite-checks (break it on purpose, confirm the right things fail)

**S3 zero-depth `**/` fix.** Disabled the `pattern[i+2] === '/'` branch in `globMatch` (forced it into
the "not followed by /" fallback):

```
not ok globMatch: leading **/ matches at ZERO depth (root-level file)
not ok globMatch: leading **/ zero depth — idiomatic Go test file
not ok case-fold: a wrong-case WRITE of a test file is DENIED for red too   <- flips the OTHER way, see below
# pass 82, # fail 3 (was 0 failures before the break)
```

Exactly the two zero-depth globMatch tests failed, as expected for this defect class — and the
case-fold write test *flipped to passing*, confirming (independently of my earlier reasoning) that
it's the same mechanism with the opposite sign. Restored and re-verified 289/3/1.

**Appendix A probes (review doc, against the real `.tdd/config.json` + `e2e/` fixture in this repo,
not a test sandbox):**

```
tdd-red   Read  e2e/src/calc/__init__.py                  -> DENIED (baseline, unchanged)
tdd-red   Read  E2E/src/calc/__init__.py                  -> DENIED (was PERMITTED — bypass closed)
tdd-red   Read  e2e/SRC/calc/__init__.py                  -> DENIED (was PERMITTED — bypass closed)
tdd-green Read  E2E/tests/test_divide.py                  -> DENIED (was PERMITTED — bypass closed)
tdd-red   Read  /private$PWD/e2e/src/calc/__init__.py     -> DENIED (was PERMITTED — bypass closed)
tdd-red   Write E2E/src/calc/__init__.py                  -> DENIED (baseline, unchanged — writes allowlist)
```

All six DENIED. **A2 (trailing-`/.` root bypass, S2a — recorded FIXED in the plan, never in the bash
code):**

```
root=$PWD    -> DENIED (correct baseline)
root=$PWD/.  -> DENIED (was PERMITTED in the bash version — now actually fixed in code)
```

### tsc --noEmit

```
npx tsc --noEmit   →  clean, no errors
```

(Caught two real typing gaps during development: an implicit-any parameter in `toPosixSlashes`, and
an implicit-any index into `TOOL_DISPATCH`. Both fixed with JSDoc types before this ran clean.)

`node_modules` was removed after verification (`rm -rf node_modules`); `.gitignore` was not touched,
per AGENTS.md's "do not edit `.gitignore` mid-cycle." `package-lock.json` is committed for
reproducible installs.

## Resolved: the case-fold WRITE test defect (coordinator ruling + fix)

Originally reported as an open deviation (see the commit history of this section, or `git log -p`
on this file if kept). **The coordinator adjudicated it: the test was wrong, the implementation was
correct, fix the test.** Summary of the ruling and the fix, since this is now closed:

**Mechanism (unchanged from the original finding).** `TEST_GLOBS = ['tests/**', '**/test_*.py']`.
`'**/test_*.py'` is a leading-`**/`, basename-anchored glob: `**` consumes the `TESTS` segment
*opaquely*, regardless of case — there's no literal character in `**` to be case-sensitive about —
so `'TESTS/test_a.py'` matched it **literally**, with no folding involved at all. The write was
therefore genuinely, correctly authorised by the config; the original assertion (`DENY`) could never
hold and demonstrated nothing about case folding. Verified not to be a port regression against the
retired bash (`tdd_glob_match "**/test_*.py" "TESTS/test_a.py"` → matched there too, before
deletion).

**Fix applied (commit `ee58baa`).** Rewrote `tests/rules.test.mjs:376` to use a local,
directory-anchored glob (`['tests/**']`, no leading `**/`) instead of the shared `TEST_GLOBS`, for
this one test only — no change to `TEST_GLOBS`/`SOURCE_GLOBS` or any other test, so no blast radius
across the spelling matrix or the rest of the file. Still asserts `DENY`. Renamed the test and added
a comment explaining why a `**/`-prefixed glob cannot express this property, so nobody reintroduces
the same broken assertion later. No production code (`hooks/lib/rules.mjs`, `hooks/guard.mjs`)
changed for this fix.

**Verification:**
```
node --test   →  293 tests, 290 pass, 2 fail, 1 todo
```
Failing set is now exactly the two disclosed Task-8 items:
```
drift check: every key the spec declares also appears in tests/fixtures/config.json
drift check: every key the spec declares also appears in the tdd-init.md Step 7 template
```

**Bite-check (required by the ruling): make `pathVerdict` fold case on writes too, confirm this
exact test fails, restore.**

Before (failing-test identities, `.tdd/config.json` fixture, full suite):
```
drift check: every key the spec declares also appears in tests/fixtures/config.json
drift check: every key the spec declares also appears in the tdd-init.md Step 7 template
```

Mutation: added `|| matchesAny(relPath.toLowerCase(), allowGlobs)` to the write branch of
`pathVerdict` in `hooks/lib/rules.mjs` (temporary, reverted immediately after).

After (failing-test identities):
```
case-fold: a wrong-case WRITE is DENIED, not folded into an allow (allowlist must not widen)
case-fold: a wrong-case WRITE of a test file is DENIED for red too, against a directory-anchored glob
drift check: every key the spec declares also appears in tests/fixtures/config.json
drift check: every key the spec declares also appears in the tdd-init.md Step 7 template
```

Exactly two NEW failures appeared: the rewritten test, and its pre-existing `SRC/a.py` sibling — the
two tests that exist specifically to catch a write-side case-fold regression, and only those two.
Confirms the rewritten test now genuinely exercises "allowlists match the literal path only, folding
would widen." Restored `rules.mjs` from the pre-mutation copy and reconfirmed 290/2/1 with the
before-mutation failing set unchanged.

## Self-review findings

- **Advisor caught this one, not me:** the promoted test named
  `guard: NotebookEdit/NotebookRead are judged on notebook_path, not file_path` only exercised
  `NotebookEdit` in its body — `NotebookRead`'s own `pathKey` had no assertion touching it. This is a
  recorded mutation survivor from the architecture review (`docs/superpowers/reviews/…:644`,
  "NotebookRead path key → file_path: survived — NotebookRead is never tested") and the fourth of
  four "branches iteration 1 never covered" named in the plan's Task 2 section; I'd closed the other
  three (Red's own `single`, `<` in the metacharacter list, the non-null `commands.mutation`
  fixture) but missed this one, and worse, the test's *name* claimed the coverage existed. Added a
  second decoy case to the same test (commit `ed67878`): a `NotebookRead` payload with a benign
  `file_path` (unclassified, red may read it) and a real-target `notebook_path` under `src/**`,
  which must deny. Bite-checked by flipping `NotebookRead`'s `pathKey` to `'file_path'` in
  `guard.mjs` and confirming exactly the new assertion fails (0 instead of 2); restored and
  re-verified 289/3/1.
- Confirmed `agents.test.mjs`'s 4 per-agent "declared name is what the guard dispatches on" tests
  pass — they require the literal substrings `'tdd-red'` etc. to appear in `guard.mjs`'s source text.
  `BASH_COMMAND_KEYS`'s object-literal keys (quoted, since they contain hyphens) satisfy this for
  free; didn't need a special-cased dispatch table just for the test.
- Found and fixed a test bug of my own during development: the `..`-traversal guard test built its
  path with `path.join(sandbox, '..', ...)`, which Node normalises away before the string ever
  reaches the guard — silently testing nothing. Rewrote with plain string concatenation (matching
  what the retired bash test did, and what `paths.test.mjs`'s own header comment warns about).
  Caught by the test actually failing, not by inspection.
- Removed a stray, meaningless `env: { agent_type: undefined }` override left over from an earlier
  draft of the malformed-JSON test (agent_type is payload-only, never an env var).
- The "unmappable role" branch in `guard.mjs`'s bash dispatch (`if (!candidateKeys)`) is currently
  dead code, since every `ROLES` entry has a `BASH_COMMAND_KEYS` entry. Kept it anyway — it mirrors
  the bash original's defensive structure and costs three lines against a future `ROLES` change that
  forgets to update the map; didn't feel like the over-engineering the CLAUDE.md guidance warns
  against, but flagging it since it doesn't currently fire in any test.
- Reused a single `deny()` reason template per branch throughout `rules.mjs` (rather than one string
  per call site) specifically so identical failures produce identical text — this is what
  `assertSameVerdict`'s spelling-matrix checks and `assertDistinctReasons`'s fail-open checks need;
  built a reasons/distinctness table on paper before writing `pathVerdict`'s body, per the advisor's
  suggestion, rather than discovering collisions by re-running the suite repeatedly.
- Did not touch `docs/superpowers/plans/2026-08-01-architecture-review-remediation.md`,
  `docs/superpowers/specs/*.md`, or the ledger `progress.md` — those looked like controller-owned
  artifacts (the ledger literally says "so a post-compaction controller can parse them") outside this
  task's delegated scope (write to `task-3-report.md`).

## Concerns for the parent / next task

1. **`node_modules` is not gitignored, by design (AGENTS.md: don't edit `.gitignore` mid-cycle)** —
   removed via `rm -rf` after every verification pass, so the tree is clean now, but the next person
   who runs `npm install` to typecheck will dirty the tree against AGENTS.md's clean-tree
   commit-audit assumption until someone adds `node_modules/` to `.gitignore` — a one-line
   follow-up, naturally scoped to Task 11 (README/packaging) or Task 13 (remaining consistency
   items), not this task.
2. Everything else is green and cross-checked: the failing set is now **exactly** the two disclosed
   Task-8 items, no more and no fewer. Bite-checks on the S3 fix and the case-fold write property
   both land on the predicted assertions, live Appendix A probes against the real repo config all
   six DENIED, `tsc --noEmit` clean, all 20 promoted guard tests passing (including the
   `NotebookRead` fix).

## Commits

- `932e07a` — `feat(hook): port the guard and decision rules to node`
- `ed67878` — `test(hook): cover NotebookRead's own path key, not just NotebookEdit's`
- `ee58baa` — `test(hook): fix a case-fold WRITE test that could not fail`
- `9aa322f` — `docs(hook): disclose and test the out-of-root read-denies behaviour` (review round 1 fixes, below)

## Review round 1 — fixes (commit `9aa322f`)

Task review came back "Needs fixes", two Important items, both addressed.

### 1. Out-of-root reads deny where bash allowed — undisclosed and untested

**Finding.** `hooks/lib/rules.mjs:226-228`: `pathVerdict` denies on a `null` `relPath` for both `read`
and `write`, before the mode branch. Only the write case had a test or documentation (`toRepoRelative`'s
own JSDoc said "`null` is NOT permit — the caller decides, and for a write it must deny", silent on
read). The retired bash guard's behaviour differed here: an out-of-root path stayed an unmatched
absolute string, matched no configured glob, and (reads being a denylist) was **permitted**.

**Controller's ruling:** deny is correct; keep the behaviour; the defect was that it was silent and
untested. Rationale (theirs, recorded here and in the spec so it isn't "restored" later): an
unplaceable path can't be classified against the `test`/`source`/`ignore` partition the whole
read-isolation argument depends on being exhaustive — the same "check cannot be evaluated" case this
design treats as fail-closed everywhere else, now correctly extended to the read side. Closes the
class the `/private` symlink residual belonged to (an absolute path naming the same file by a route
the literal prefix strip never recognised as in-root).

**What changed:**

- `hooks/lib/rules.mjs` — `pathVerdict`'s JSDoc gains a paragraph stating the null-denies-both-modes
  property explicitly, why it's a deliberate departure from bash, and a pointer to the spec. **No
  behaviour changed** — the code already did this; only the contract is now written down.
- `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` — one paragraph added to the
  "Paths are canonicalised before matching" section, right after the existing "`realpath` failures
  deny" bullet (which already gestured at this but didn't call out the departure from bash or the
  "both modes" scope explicitly).
- `tests/rules.test.mjs` — new test immediately after the existing `'fail-closed: null relPath
  denies'` (write-only) test: computes both the write and read verdicts for the same null `relPath`
  and asserts them identical via `assertSameVerdict` (added to the file's imports), not two separate
  `assertDeny` calls — so the pair reads as ONE property and the reason is asserted to actually name
  the rule, not merely that the call denied.
- `tests/paths.test.mjs` — new test immediately after the existing `'toRepoRelative: a real path
  OUTSIDE the root returns null'` test: resolves a real out-of-root path (`os.tmpdir()`, same fixture
  the existing test already uses) through the actual `toRepoRelative`, then feeds the resulting
  `null` into `pathVerdict` with `mode: 'read'` and asserts DENY — pinning the two functions together
  at the seam, not just asserting the unit-level property with a hand-passed `null`.

**Verification:**
```
node --test tests/rules.test.mjs tests/paths.test.mjs   →  all new/existing tests pass
node --test                                              →  295 tests, 292 pass, 2 fail, 1 todo
```

**Bite-check.** Temporarily relaxed `pathVerdict`'s read branch to fall through to `allow()` on a
`null`/non-string `relPath` (moved the validation into the write-only branch; guarded the
`.toLowerCase()` fold so it degrades rather than throwing) — simulating the old bash-parity gap
without introducing a crash, since `matchesAny(null, ...)` already safely returns `false`.

Before (full-suite failing identities):
```
drift check: every key the spec declares also appears in tests/fixtures/config.json
drift check: every key the spec declares also appears in the tdd-init.md Step 7 template
```

After the mutation (full-suite failing identities):
```
drift check: every key the spec declares also appears in tests/fixtures/config.json
drift check: every key the spec declares also appears in the tdd-init.md Step 7 template
fail-closed: null relPath denies for read too, with the identical reason as write (one property, not two)
toRepoRelative + pathVerdict: a path resolving outside the root denies on read at the seam, not just as a hand-passed null
```

Exactly the two new tests failed, nothing else. Restored `rules.mjs` and reconfirmed byte-identical
to the pre-mutation version via `git diff` (clean) before re-running the full suite.

### 2. AGENTS.md's false claim about the bash test files

**Finding.** `AGENTS.md:53-54` said "Every one of its test files has a `.test.mjs` equivalent under
`node:test`." False: `tests/smoke.test.sh` (deleted in the earlier commit alongside the rest of the
bash harness) has no successor, because it only tested the retired harness's own
`assert_eq`/`assert_contains` functions — nothing about this plugin — and `node:test`'s assertions
are Node's own, needing no such self-test.

**Fix.** Rewrote the sentence to name which four files (`agents`, `config-contract`, `guard`, `rules`)
do have a `.test.mjs` equivalent, and to state plainly why the fifth (`smoke`) didn't need one. No new
tests — nothing was lost, so nothing needed covering; the fix is the claim, per the ruling.

**Verification:** `node --test` unaffected (this file has no test-time role); re-ran the full suite
anyway as part of the combined verification above — 292/2/1, same failing set.

### Deferred (not this round, per instruction)

Two reviewer Minors — capturing `stdout` in `guard.test.mjs`'s `runGuard()` to pin that a deny writes
nothing there, and a comment on `guard.mjs`'s `main()` noting that ESM top-level imports evaluate
before the version-floor check — are left to the ledger, not fixed here.
