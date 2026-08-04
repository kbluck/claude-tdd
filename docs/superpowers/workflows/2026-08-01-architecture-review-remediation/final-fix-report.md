# Final gate — fix-wave report

Applied the three findings from the final whole-branch review as six scoped commits (Finding 1
split into its two scopes per AGENTS.md's "one type and scope per commit; split when a change
spans two"; two of the six are follow-up commits from an advisor review that caught a
compositional gap and an unverified claim before this was reported done — see "Advisor round"
below). Both suites stayed green throughout.

## Commits

| Commit | Type/scope | What |
|---|---|---|
| `7f6a878` | `test(agent)` | pin `tools:` frontmatter on all four `agents/tdd-*.md` to exact equality `{Read, Write, Edit, Bash}` |
| `bc3e841` | `test(hook)` | pin `hooks.json`'s `PreToolUse` matcher against `guard.mjs`'s `TOOL_DISPATCH` table |
| `467c1eb` | `chore` | `git rm --cached .mcp.json`, add it to `.gitignore` |
| `de0d1d0` | `test(hook)` | correct two stale RED-state comments |
| `f6db27b` | `test(hook)` | close a compositional gap: matcher vs. agent-granted tools directly |
| `43f038d` | `test(hook)` | correct an unverified claim introduced by `de0d1d0` |

Base: `6cce7b9`. Working tree clean after the last commit.

## Finding 1 — tools: frontmatter and hooks.json matcher pinned

### (a) Agent `tools:` frontmatter — `7f6a878`

`tests/agents.test.mjs` already looped over `agents/*.md` to check `name:` against `ROLES`. Added
a `frontmatterTools()` extractor (same regex-on-source-text approach as the existing
`frontmatterName()`) and, inside the existing per-file loop, a new test per agent asserting
`tools:` parses to the sorted array `['Bash', 'Edit', 'Read', 'Write']` via `assert.deepEqual` —
equality, not subset, because addition (not removal) is the direction that opens a bypass (Grep
returns file content and sits outside the `PreToolUse` matcher entirely; the spec at
`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:415` makes this explicit).

4 new tests (one per `agents/tdd-*.md` file).

### (b) `hooks.json` matcher vs. `guard.mjs`'s `TOOL_DISPATCH` — `bc3e841`

Added `toolDispatchKeys()` to `tests/guard.test.mjs`: reads `hooks/guard.mjs`'s source text and
extracts the `TOOL_DISPATCH` object's key names with a regex over the captured block. Deliberately
does **not** `import` `guard.mjs` — the module calls `main()` unconditionally at the top level,
which reads stdin synchronously; importing it in the test process would hang.

New test locates the `PreToolUse` entry whose hook body references `guard` (same pattern the
existing exec-form test uses), splits its `matcher` string on `|`, and asserts the **sorted set**
of those tokens deep-equals the sorted set of `TOOL_DISPATCH` keys.

**Why sorted-set rather than literal-string equality**, for the next reviewer who might reopen
this: the dispatch's own instructions are in tension — "equals the literal string implied by the
table" vs. "derive one from the other rather than hardcoding the same string twice" — because
today's matcher order (`Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Bash`) already differs
from `TOOL_DISPATCH`'s declaration order (`Read, NotebookRead, Write, Edit, MultiEdit,
NotebookEdit, Bash`), with zero security effect (a regex alternation matches identically
regardless of branch order). Literal-string equality would have required reordering `hooks.json`
for no security benefit; token-set equality catches every add/remove, which is the direction that
actually matters, without being brittle to a harmless reorder.

1 new test.

### (c) Compositional gap, closed after advisor review — `f6db27b`

An advisor pass caught that (a) and (b) are each self-consistent but never cross-checked against
each other: (a) pins agent `tools:` to a **hardcoded literal**, (b) pins the matcher against
`TOOL_DISPATCH` **derived from `guard.mjs` itself**. Neither compares the matcher against what
agents actually hold. An edit that narrows the matcher *and* `TOOL_DISPATCH` together in the same
diff (e.g. dropping `Bash` from both) would satisfy both existing tests while `agents/tdd-*.md`
still declare `Bash` — exactly the finding's stated failure scenario: the entire command allowlist
for that tool goes dark, with no denial and no failing test.

Added a third, independent test: every tool granted across `agents/*.md` (read directly, not
imported from `agents.test.mjs` — test files in this suite don't depend on each other's
internals) must appear in the matcher's token set. Subset, not equality, since the matcher may
legitimately cover tools no agent currently holds (`MultiEdit`, `NotebookEdit`, `NotebookRead`);
it must never omit one an agent does.

1 new test.

### Bite-checks (identities, not counts)

**(a) agent frontmatter — added `Grep` to `agents/tdd-red.md`'s `tools:` line:**

- Before: `node --test` → `# tests 331 / # pass 330 / # fail 0` (count at the time, before (c) was added)
- After: `# tests 331 / # pass 329 / # fail 1`, with:
  ```
  not ok 10 - tdd-red.md: declares tools: exactly Read, Write, Edit, Bash -- no more, no less
  ```
  Exactly that one identity failed. Restored `agents/tdd-red.md` from a pre-edit copy;
  `git diff --stat agents/tdd-red.md` was empty after restore; suite back to 330/0.

**(b) hooks.json matcher — removed `NotebookRead` from the matcher string:**

- Before: `# tests 331 / # pass 330 / # fail 0`
- After: `# tests 331 / # pass 329 / # fail 1`, with:
  ```
  not ok 106 - hooks.json: the matcher's tool set is exactly guard.mjs's TOOL_DISPATCH keys — not a second hand-typed copy
  ```
  Exactly that one identity failed. Restored `hooks/hooks.json` from a pre-edit copy;
  `git diff --stat hooks/hooks.json` was empty after restore; suite back to 330/0.

**(c) compositional — removed `Bash` from *both* `hooks.json`'s matcher and `guard.mjs`'s
`TOOL_DISPATCH` in the same edit** (the advisor's literal proposed mutation, since it is the case
(a) and (b) alone cannot see):

- Before adding test (c): this compound mutation would have left all 331 tests passing — (a) is
  pinned to a hardcoded literal never compared to the matcher, and (b) compares the matcher only
  against `TOOL_DISPATCH`, which was edited in lockstep. Not independently re-verified against a
  pre-(c) checkout (would have meant reverting a committed test file); accepted as the advisor's
  stated reasoning, which matches the structure of (a) and (b) directly.
- After adding test (c): `node --test` → `# tests 332 / # pass 325 / # fail 6`, including:
  ```
  not ok 107 - hooks.json: every tool granted to an agent in its tools: frontmatter is covered by the matcher
  ```
  This is the identity that demonstrates the gap is closed. The other five failures (`not ok 111,
  122, 123, 124, 126`, all in `tests/guard.test.mjs`'s behavioral suite) are a side effect of this
  bite-check's specific mutation deleting the `Bash` key from `TOOL_DISPATCH` outright — those
  tests spawn `node hooks/guard.mjs` directly against a real payload, bypassing `hooks.json`
  entirely, so removing `Bash` from `TOOL_DISPATCH` also makes the guard itself treat `Bash` as an
  unrecognized tool (structurally different from "the matcher no longer routes `Bash` calls to the
  guard," which is what this finding is actually about, and which only test (c) observes). Restored
  both files from pre-edit copies; `git diff --stat` on both was empty after restore; suite back to
  332/331/0/1.

Every bite-check reports the failing test **identity** before and after, not merely a count, per
AGENTS.md's "a count can hold steady while the failing set changes completely" warning.

## Finding 2 — `.mcp.json` untracked — `467c1eb`

`git rm --cached .mcp.json` (not `git rm`) — confirmed the file is still present on disk
afterward (`ls -la .mcp.json` shows the same 118-byte file, same mtime, unchanged content) and is
no longer in the index (`git status --short` showed `D  .mcp.json` for the staged removal, and the
working-tree copy was untouched). Added `.mcp.json` to `.gitignore`'s `### Project ###` section
(next to `.superpowers/` and `.tdd/checklist.json`) so it isn't re-added by accident. Confirmed no
test or doc in the repo references `.mcp.json` before removing it
(`grep -rn "\.mcp\.json" tests/ docs/ commands/ agents/ hooks/ skills/ AGENTS.md` → no hits), so
untracking it could not regress anything the suite checks.

Own commit, touching only `.gitignore` and `.mcp.json` (deletion from index).

## Finding 3 — stale RED-state comments — `de0d1d0`, corrected by `43f038d`

- `tests/config-contract.test.mjs:10-17` (file header) and `:253-259` (the "NEW" block above the
  two drift-check tests): both described the `singleTerse` drift check as presently RED
  (plan Task 8, open at time of writing). Verified `commands.singleTerse` is now present in
  `tests/fixtures/config.json:6` and `commands/tdd-init.md` (Step 7 template and several
  narrative mentions), and that both drift-check tests pass today. Rewrote both comments in past
  tense: the check *was* a deliberate RED recording a real gap, and now passes because the gap
  closed.

- `tests/rules.test.mjs:475-479`: claimed the `..`-traversal-in-the-delta test "is expected to
  stay red past Task 3 until Task 13 closes it." Verified with `git log --oneline -S` that
  `bashVerdict`'s own `'..'` rejection (`hooks/lib/rules.mjs:317-318`) landed in Task 3 itself —
  the same commit range the comment was written in, per the progress ledger
  (`.superpowers/sdd/2026-08-01-architecture-review-remediation/progress.md:1024-1043`, which
  independently records this exact stale-comment defect and traces the fix to Task 3, 50 minutes
  after the comment).

  **First pass (`de0d1d0`) introduced a fresh unverified claim.** The comment also referenced the
  separate orchestrator-side `testId` validation (plan Task 13, I4). I initially wrote that this
  had landed in Task 13 (`skills/run-tdd-cycle/SKILL.md`) but was "not exercised by this unit-test
  file, only by the e2e/Task 12 workflow checks" — inferred from the plan's stated verification
  intent, not checked against the actual suite.

  **Caught by the advisor before this was reported done.** Checking
  `grep -rn "testId" tests/ | grep -i "skill\|glob"` surfaced `tests/skill-consistency.test.mjs`
  (added by commit `19d93d5`, inside Task 13's own commit range), which pins both halves of I4 at
  the `node --test` level: the `SKILL.md` Red-section prose directly
  (`"SKILL.md's Red audit validates testId against globs.test before it is used (I4)"`) and this
  same `rules.mjs` `'..'` rejection again, independently, from the I4 side
  (`"rules.mjs still rejects '..' in the Bash delta as defence in depth behind the
  orchestrator-side testId check"`). Commit `43f038d` corrects the comment to name the actual
  verifier instead of the inferred one.

Both edits are comment-only; no test body changed. `git diff` for `de0d1d0` and `43f038d` combined
touches exactly `tests/config-contract.test.mjs` and `tests/rules.test.mjs`, nothing else.

## Self-review

- Ran `node --test` and `npm run smoke` after every commit-worthy change, not just once at the
  end. Final state: `node --test` → 332 tests, 331 pass, 0 fail, 1 todo (up from the pre-existing
  326/325/0/1 by exactly the 6 new tests added: 4 agent + 2 hook matcher/composition).
  `npm run smoke` → 11/11 throughout, unaffected (none of these findings touch the e2e path).
- Called the advisor tool before reporting done. It caught two real issues (Finding 1's
  compositional gap, and an unverified claim in Finding 3's own fix) — both are folded in as
  `f6db27b` and `43f038d` above, each bite-checked in turn.
- Checked `git show --stat` on every commit names a file outside `docs/` (AGENTS.md's "fixing the
  document about the artifact is not fixing the artifact" trap) — all six do.
- Confirmed no commit staged via `git add -A`/`.`; every commit staged explicit paths.
- Confirmed `.gitignore` was touched in exactly one commit (Finding 2's own), not mid-cycle
  alongside anything else, per AGENTS.md's "do not edit `.gitignore` mid-cycle."
- Did not touch `docs/**/specs/`, `docs/**/plans/`, or `docs/superpowers/reviews/`, per the
  dispatch's constraints — verified with `git diff 6cce7b9..HEAD --stat`, which lists only
  `.gitignore`, `.mcp.json`, and four files under `tests/`.
- One cosmetic nit noticed but not fixed, to respect the no-amend policy on commits that hadn't
  been pushed and had no other reason to be touched: commit `bc3e841`'s body has "sorted sets. not
  raw string order" (period where a comma was intended). Purely cosmetic, does not affect meaning.

## Concerns

None that block the gate. The stray period noted above is cosmetic only.
