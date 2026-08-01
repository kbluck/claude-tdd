# SDD ledger — plan: docs/superpowers/plans/2026-07-30-tdd-subagent-workflow.md

Branch: feat/tdd-subagent-workflow
Base: 86a3057

## Pre-flight scan
- Fixed: Global Constraints demanded `set -euo pipefail` for every script, but
  guard.sh and run.sh both branch on non-zero exits as control flow. Constraint
  now exempts them. (plan commit follows)
- Open question for human: Task 5 mandates writing a deliberate inverted
  condition to demonstrate the tests catch it.
- Blocker: Tasks 1, 9, 10 require installing a plugin and restarting Claude
  Code. Neither the controller nor a subagent can restart the session.

## Task 1: hook-in-subagent spike (DECISION GATE)
- Step 1 complete: stub plugin built at /tmp/tdd-spike/spike-plugin/
  - probe.sh self-tested standalone: allow-path exit 0, FORBIDDEN-path exit 2
    with correct deny JSON on stderr. Logic verified; loading is not.
- Steps 2-7 BLOCKED on human: install + restart required.
- Resolved: Task 5's planted bug replaced with a mutation check (write guard
  correctly, then flip [ -z ] -> [ -n ], confirm suite goes red, revert).
  Committed code is never wrong; proof of test teeth is preserved.

## Task 1: COMPLETE — gate PASSED
- Q1 hooks fire in subagents: YES
- Q2 denial correctable: YES (systemMessage reached agent, it continued)
- Discovery: payload carries agent_type/agent_id; plugin-dev docs incomplete.
  Fixes a real bug -- phase-marker guard would have denied the orchestrator's
  own `git diff` audit. Marker cannot tell orchestrator from agent.
- Findings: docs/superpowers/spikes/2026-07-30-hook-in-subagent.md
- Stub plugin uninstalled by user.
- Spec + plan reworked onto agent_type; .tdd/phase eliminated.
- New Task 6 Step 6 verifies custom agents report their own name in
  agent_type -- load-bearing and still untested.
Task 1: complete (commits ffa0128..HEAD, gate passed)

Task 2: complete (commits e600cb9..54edf21, review clean)
Task 2: minor (deferred): tests/run.sh sources each *.test.sh without -e. A
  test file with a syntax error, or an empty one, leaves FAIL at 0 and the
  harness reports green. Green means "no assertion failed", not "the expected
  assertions ran". Inherited from the brief, not a Task 2 defect. Suggested
  fix for final review: have run.sh snapshot PASS+FAIL before each file and
  report a file that contributed zero assertions.

## Task 3: path decision rules
- First attempt: commit bdeaa86, 21/0 passing, spec compliance OK.
- Review: NOT APPROVED. Critical fail-open, reproduced independently by the
  controller: unquoted glob strings undergo PATHNAME EXPANSION, not just word
  splitting. `src/**` was replaced by files on disk, so
  `tdd_path_verdict red read src/pkg/module.py` returned "allow" from a dir
  containing src/ and "deny" elsewhere. Wrong answer was the permissive one,
  on read isolation, which leaves no trace in a diff.
- Root cause was the PLAN's own design note, not implementer deviation.
  Plan fixed in 25d8888: tdd_matches_any takes the glob STRING and splits it
  under set -f; params default to empty; empty governing glob list denies;
  regression tests run in a scratch tree shaped to trigger the bug.
- Task 3: fix round 1/5 dispatched (resumed implementer a36cc54ac98c20278).
- Task 3: fix round 1/5 (3 addressed, 0 open; commits bdeaa86..fe465de)
  Bite check confirmed: reverting the fix makes exactly the 5 new regression
  assertions fail (25/5), pass again after restore. Controller independently
  confirmed the verdict is now CWD-independent.
Task 3: complete (commits 54edf21..fe465de, review clean, 30/30)
Task 3: minor (deferred): tests/rules.test.sh:94 `cd "$_glob_prevpwd" || return`
  -- if the cd back ever failed it would skip the rm -rf AND leave every
  subsequently-sourced test file running from the orphaned sandbox. Negligible
  probability, never observed.
Task 3: minor (deferred): hooks/lib/rules.sh:9 `${1//\*\*/*}` has no ${1:-}
  fallback unlike its siblings. Pattern-substitution on an unset positional
  does not trip set -u on bash 3.2.57, but that is not guaranteed elsewhere.

## Task 4: bash command allowlist
- First attempt: commit 440accc, 44/0 passing, spec ✅.
- Review: Important gap, reproduced by controller. A template whose text before
  the first { is empty/whitespace makes the prefix test `case "$cmd" in *)`,
  matching everything -- allowlist degrades to "no metacharacters", so
  `cp -r /etc /tmp/exfil` was permitted. [ -z "$template" ] misses it because
  "   " is non-empty. Not agent-reachable (config is human-confirmed), hence
  Important not Critical.
- Root cause again the PLAN, not implementer deviation. Fixed in 19bdc1c:
  deny on empty static prefix; trim tabs as well as spaces; 4 new tests.
- Task 4: fix round 1/5 dispatched.
- Task 4: fix round 1/5 (2 addressed, 0 open; commits 440accc..8b0133e)
Task 4: complete (commits fe465de..8b0133e, review clean, 48/48)
Task 4: minor (deferred): a template with content AFTER the placeholder, e.g.
  `pytest -q {testId} --cov > out.json`, puts that trailing text into the delta
  and false-denies a normal invocation. Prefix-only design. Task 7 should warn.
Task 4: minor (deferred): no word boundary after prefix (`pytest -qq` matches
  `pytest -q`); `${template%%\{*}` also truncates at a brace-expansion `{`.

## Task 5: the guard hook
- Pre-dispatch audit by controller (given the Task 3/4 pattern) found two more
  plan-authored fail-opens, fixed in 9786c56 BEFORE dispatch:
  1. `[ -n "$path" ] && exit 0` -- the old planted bug was still in the code
     block; I had removed its explanation but not the line, so the plan
     contradicted its own step 5. Now denies on missing file_path.
  2. Path traversal unguarded: "$root/../<repo>/src/a.py" resolves back inside
     the project, does not start with "$root/", survives the strip as absolute,
     matches no glob, and would be PERMITTED on a read.
  Also rewrote step 5's mutation check, which targeted a line that no longer
  existed. Symlink traversal recorded as a known, currently-unreachable limit.
- First attempt: commit 3e1433b, 79/0 passing. Implementer self-flagged three
  brief defects rather than transcribing silently -- good catch by it.
- Controller confirmed the serious one by running the shipped guard:
  tdd-red + NotebookEdit -> src/a.py = exit 0 PERMITTED (Write = exit 2 denied).
  Matchers are unanchored regex, so `Edit` delivers MultiEdit/NotebookEdit,
  which fell through `*) exit 0`. Third fail-open of the same class.
- Plan fixed in c8ad1ef: unknown tools deny; MultiEdit/NotebookEdit mapped;
  notebook_path read; no-jq pattern no longer depends on compact JSON;
  mutate/coverage comment corrected; green traversal assertion now uses a
  source path (it was passing via a different rule); step 5 sed unanchored to
  hit both copies of the verdict line.
- Task 5: fix round 1/5 dispatched.
- Task 5: fix round 1/5 (4 addressed, 1 open; commits 3e1433b..dd404d3)
  Open: stale mutate/coverage comment left beside its own correction.
  Residuals named: NotebookRead/BashOutput now deny for constrained roles
  (safe direction); file_path // notebook_path precedence rested on an
  unverified NotebookEdit schema assumption.
- Controller fixed all three in ea3d287 before round 2: path key now selected
  BY TOOL (the // precedence judged a field NotebookEdit ignores, and would
  have permitted the write -- permissive direction again); stale comment
  removed; NotebookRead mapped to read; assertions tightened to "|2".
- Task 5: fix round 2/5 dispatched.
- Task 5: fix round 2/5 (4 addressed, 0 open; commits dd404d3..b486d54)
Task 5: complete (commits 9786c56..b486d54, review clean, 85/85)

## Task 6: agent definitions
- First attempt: commit 9206e16, 93/0 passing (85 + 8 from agents.test.sh).
  Implementer correctly diagnosed plugin-dev's validate-agent.sh as buggy
  (set -e + failed grep on missing color:) rather than working around it.
- Controller fixed the plan in fa0c12c: agents carry a color: field so step 4's
  validator is a gate that can actually pass.
- Review: NOT APPROVED, Critical. Prompts instructed git/rm commands the Bash
  allowlist denies. Confirmed live: tdd-mutate git status/git checkout,
  tdd-red rm, tdd-refactor git checkout all exit 2. Fails CLOSED (not a safety
  hole) but broke mutate's central revert-after-each-mutant contract, and the
  shared "a denial means you strayed" text would have blamed the agent for a
  structural denial.
- Plan fixed in 490f927: record-and-restore via Edit/Write; git status moves to
  the orchestrator; red stops trying to delete; boundary text now states Bash
  is limited to configured commands by design.
- Task 6: fix round 1/5 dispatched.
- CONTROLLER ERROR: commit 212fa6b used `git add -A` while the Task 6
  implementer was mid-edit, sweeping its agents/tdd-mutate.md change into a
  commit whose message describes only the Tasks 7/8 plan audit. Tree content is
  correct (93/0, validator exit 0 on all four). History attribution is wrong.
  Not rewriting while a subagent holds the tree. FIX FORWARD: use explicit
  paths in `git add` for the rest of this run, never -A.
- Task 6: fix round 1/5 (3 addressed; commits fa0c12c..8390fd6)
- Task 6: fix round 2/5 (5 addressed, 0 open; commits 8390fd6..212fa6b)
Task 6: complete (commits 8d8b661..212fa6b, review clean, 93/93)
  EXCEPT step 6 (agent_type round-trip) -- needs plugin install + restart,
  deferred to the human operator. Load-bearing: if custom agents do not report
  their own name in agent_type, every guard lookup misses and it permits
  silently. Tasks 9/10 depend on it.
- Review also surfaced 3 orchestrator gaps, fixed pre-emptively in 41da328:
  mutation pass had no before-dispatch clean-tree check (steps went 1,3,4) yet
  tdd-mutate's prompt now claims the orchestrator does it; Refactor branch
  never named no-change-needed; a reverted refactor was taken on trust though
  Edit-based restore can be imperfect and the coverage gate would miss it.

## Task 6 step 6 RESULT — assumption was WRONG (2026-07-31)
Plugin agents report agent_type "claude-tdd:tdd-red", namespaced <plugin>:<agent>,
not bare "tdd-red". Guard's dispatch table missed every arm -> *) exit 0 ->
ENTIRELY INERT for every real dispatch. Reproduced:
  agent_type=tdd-red            exit 2 denied
  agent_type=claude-tdd:tdd-red exit 0 PERMITTED (red writing source)
All 93 tests passed throughout because every test payload used the bare name.
Most consequential defect so far; only a real dispatch could surface it.
Fixed in plan a0b420a: match ${agent##*:}; tests now cover the namespaced form.
Task 5 REOPENED: fix round 3/5 dispatched to apply it to hooks/guard.sh.
- Task 5: fix round 3/5 (1 addressed, 0 open; commit 65827b2). 97/97.
Task 5: complete (namespace fix verified LIVE, not just synthetically)
Task 6: step 6 COMPLETE. Live dispatch of claude-tdd:tdd-red against a
  discriminating config: read of a source file DENIED with the correct
  message, read of a test file permitted. Guard confirmed working end to end.
- Gotcha recorded in plan: /plugin install caches a snapshot; /reload-plugins
  does NOT refresh it. Diff repo hooks/ against the cache before trusting any
  live run in Tasks 9/10.
- Note from implementer (test strength, deferred): in the round-3 bite check
  only 2 of the 4 new namespaced assertions failed against the broken guard.
  The two allow-side ones passed coincidentally, since an unrecognized
  agent_type also exits 0. Deny-side assertions are the load-bearing ones.

## NOTE: branch rebased 2026-07-31 (by the user, not the controller)
All commits reworded to Conventional Commits with AGENTS.md scopes, and my
mixed `git add -A` commit split into fix(plan) + fix(agent) -- which fixes the
attribution error recorded earlier. Content intact, 135/0, tree clean.
EVERY SHA RECORDED ABOVE THIS LINE IS STALE. Identify commits by message, not
SHA. Implementer reports reference pre-rebase SHAs too.

## Task 7: /tdd-init
- Rounds 1-3. Round 1: template omitted 6 schema keys incl. maxCrap, so a
  config written from it would have a null primary refactor threshold -- a
  comparison that never fires. Round 2: added a template check that grepped the
  WHOLE file, vacuous for 7 of 14 keys. Round 3: scoped to the Step 7 block but
  kept a bare-name needle, still vacuous for 4 (maxCrap/mutantsPerPass appear in
  the following paragraph; mutation is a substring of mutationRounds; ignore of
  .gitignore on the inclusive end-anchor line).
- Now: needle is the JSON form "key":, plus a guard that the block stops before
  step 8 -- a broken END anchor makes sed run to EOF and silently re-widen,
  which passes quietly. Controller verified all five keys bite and the
  end-anchor guard bites. 135/0.
- Lesson recorded: I reported round 2 as closed on a single-sample bite check
  using crapMode, one of the ten keys that happened to work.
- Task 7 rounds 4-5. Round 4 derived the key list from the fixture (closing the
  14-vs-19 subset gap) but copied the spec extraction WITHOUT the end-anchor
  guard the template got in round 3 -- breaking the spec's `}` swept in prose,
  168/0 stayed green.
- Round 5, the deepest one: a one-char typo in the derived loops' jq filter
  (strnig for string) deleted 46 assertions and the suite reported 122/0. The
  check ceased to exist and the run looked healthy. Root cause was tests/run.sh
  reporting "N passed, 0 failed" with no notion of what N should be -- recorded
  as a Task 2 deferred minor and carried for five tasks while this class
  recurred six times.
- Fixed structurally: run.sh now fails any file contributing zero assertions
  and fails on an empty glob (both verified, exit 1); both derived loops assert
  >=19 keys enumerated; spec block asserts its last line is `}`.
- Controller verified the glob-zero branch the implementer skipped, plus a
  syntax-error file (caught as "contributed no assertions"). 171/0.
- Task 7: fix round 5/5 (2 addressed, 0 open). 171/0.
Task 7: complete (review clean after 5 fix rounds)
Task 7: minor (deferred): run.sh's per-file guard catches a file that produces
  NOTHING, not one that dies partway. A syntax error after assertion 3 leaves
  those 3 recorded, the guard sees movement, and the assertions that never ran
  stay invisible. `. "$t"`'s exit status is not a safe substitute -- it returns
  whatever the file's last command returned. Zero current occurrences.
Task 7: minor (deferred): test files are SOURCED into run.sh's scope, so a file
  assigning BEFORE, FOUND or t breaks the guard silently. No current file does.
Task 7: minor (deferred): the >=19 cardinality floor has 4 keys of slack (23
  actual). Catches collapse, not a partial loss of up to 3 keys. Deliberate --
  deriving the expected count from the same filter would be strictly weaker.

## Task 8: orchestrator skill
- First attempt: SKILL.md + commands/tdd.md, 171/0. Implementer flagged two of
  my numbering errors (preflight header said "all six" over seven steps; Red and
  Green step lists skipped numbers) and transcribed verbatim rather than
  silently fixing -- right call. The header undercount mattered: the step it
  would skip is the agent_type probe, the one that verifies the guard is alive.
- Pre-dispatch audit had already closed four vacuous-pass holes (empty diff
  passing the audit, empty checklist completing the run, a probe that errors
  reading as a pass, mutantsAttempted:0 reading as no survivors).
- Review: NOT APPROVED. 2 Critical + 6 Important, all seam defects in my brief.
  C1 knownRed written once, read never -- and both refactor and mutate stop on
  a non-green suite, so accepting the proceed-past-red offer would have made
  both roles refuse for the whole session. C2 Refactor's blocked said continue
  while Escalation said stop; combined, a run could refactor nothing and report
  success. I1 violationRetries declared, contract-tested, never read. I2 Green
  verified one test, never the suite. I3 Green's verify had no failure branch.
  I4 mutation pass computed CRAP unconditionally though crapMode unavailable is
  supported. I5 round counter only in context, contradicting the resumability
  claim. I6 completion tested only for pending, so a resumed run with a blocked
  item reports success with work outstanding.
- Fixed in fbf385d (orchestrator) + follow-up (agent prompts).
- CONTROLLER ERROR: fbf385d's message claimed knownRed was threaded when only
  the orchestrator half applied -- my edit script failed partway and the git
  commit on the next line ran anyway. Second time today a chained commit ran
  after a failed script. Gate commits on the script succeeding.
- Task 6 reopened (fix round 3) for the refactor/mutate knownRed changes.
- CONTROLLER ERROR (repeat): I committed the escalation/violationRetries fix to
  the PLAN (85fccd8), regenerated the brief, then went straight to re-review
  WITHOUT dispatching an implementer to apply it. So I reported a fix that never
  reached skills/run-tdd-cycle/SKILL.md. The re-review caught it: the shipped
  file still said "a second guardrail violation" at :258 while :106 used
  limits.violationRetries. Fixing the document about the artifact is not fixing
  the artifact -- the same distinction the Task 6 implementer caught me on.
  RULE: after every plan fix, dispatch the implementer before reviewing.
- Task 8: fix rounds 1-4. Round 3 fixed I7 + the mutation-pass knownRed gap;
  round 4 declared mutationRoundsRun in the schema (non-blocking per review,
  fixed anyway -- it was the shape knownRed and the Task 2 harness minor both
  had: named in prose, absent from the declared structure).
Task 8: complete (review clean, 171/171)
Task 8: note: two dispatches pass knownRed (Refactor, Mutate); THREE
  orchestrator-side suite checks subtract it (Green, Refactor context,
  Mutation). I said three dispatches in a fix message; shipped file was right.

## Task 9: end-to-end run — COMPLETE, workflow ran and the guarantee held
Items: 1 redundant (passing-flat, discarded), 2 done (red->green), 3 done
(red->green, coverage gate fired: 1 new uncovered vs allowance 2 = WITHIN).
Commits: red:/green: pairs for subtract and divide. 3 tests pass, tree clean.
Verified post-run: green denied reading tests, red denied reading AND writing
source, green permitted to write source, orchestrator unconstrained.
CRAP mapping discriminating: divide cov=0.75 not 1.00 (the uniform-1.0 failure
mode the skill warns about is NOT present).

### Three defects found ONLY by running
1. /tdd-init invalidates its own partition: step 4 verifies, step 8 commits
   .tdd/config.json, so /tdd preflight fails on drift right after a clean init.
   Plan fixed 79ac7c9. Task 7 fix round 5 dispatched.
2. `git checkout -- .` does not revert. It restores tracked files only, and
   Red's tests are always NEW files. Confirmed: after the passing-flat discard
   the rejected test was still in the tree, where the next commit would sweep
   it up. Revert is now checkout+clean scoped to the role's write globs.
   Plan fixed. Task 8 fix pending.
3. commands/tdd.md referenced $1, which was NOT substituted (arrived as a
   trailing ARGUMENTS: line), so "if $1 is empty" could never fire. Could not
   verify the real /tdd typed-command path, so the fix refers to the argument
   in prose and depends on neither behaviour. Plan fixed. Task 8 fix pending.

### Controller errors this run
- Committed pytest bytecode via a broad `git add e2e`; untracked it after.
- Sourced hooks/lib/rules.sh into ZSH for an audit -> false VIOLATIONs. The
  library is bash. Fourth instrument error today (whole-file grep, empty
  dirname, zsh word-splitting, this). Run verification in bash explicitly.
- Edited .gitignore mid-cycle, polluting an audit that assumes a clean tree.
- Task 8 fix rounds 5-6: F1 (checkout doesn't discard untracked), F2 (reset
  --hard has the same blind spot at 3 more sites), F3 (bare commands must not
  survive at point of use), F4 ($1 substitution) -- all ADDRESSED, verified
  against shipped files. Re-review independently confirmed git clean's pathspec
  dialect matches the plugin's glob dialect for both fixture glob shapes, and
  that clean without -x spares gitignored paths.
Task 8: complete (review clean, 171/171)
- Follow-up fixed after close: the scoping sentence said to scope BOTH commands,
  but `git reset --hard -- <path>` is fatal: Cannot do hard reset with paths.
  Only clean takes a pathspec. Prose describing an impossible command is how F1
  and F2 arose; now states reset is tree-wide and why that is safe here.
- Task 8 needs one more implementer round to apply that wording to SKILL.md.

## Task 10: mutation pass — COMPLETE, loop demonstrably works
Round 1: 11 mutants, 8 killed, 4 survivors (incl. the planted a/b -> a*b).
Round 2: 9 mutants, 8 killed. All 4 round-1 survivors CONFIRMED KILLED, and a
5th gap surfaced that the louder ones had masked: `if b == 0` weakens to
`if b <= 0` undetected because nothing divided by a negative. Genuine spec
violation, found only by a working feedback loop.
Final: 6 items (1 redundant, 2 red->green, 3 from mutation), 7 tests, rounds
2/2, pending 0, blocked 0, tree clean, plugin suite 171/171.

### Three structural defects, all invisible to review
1. CRITICAL: the three-way Red rule breaks EVERY mutation-origin item. A
   survivor means source is correct + test weak, so Red's test passes and
   coverage cannot move -> passing-flat -> discarded -> next round finds the
   same survivors forever. The feature could never close a gap. Verified: the
   discarded test killed all 3 recorded mutants. Now judged on mutant-kill,
   verified orchestrator-side (Red cannot write source).
2. CRITICAL: restoring source does not invalidate bytecode. Suite reported
   1 failed with a traceback that source could not produce; git called the tree
   clean because .pyc is gitignored. False red here, but the same mechanism
   serves a false GREEN, and the post-mutation suite check is where that would
   be believed. Fixed with PYTHONDONTWRITEBYTECODE=1 in the commands.
3. IMPORTANT: survivors must be grouped by missingBehavior. 3 of 4 round-1
   survivors were one gap; literal reading queues 3 redundant Red cycles.

### Environmental defect found and fixed mid-pass
Running the mutation command left e2e/mutants/ behind, which permanently broke
the configured test command. The mutate agent diagnosed it, proved it was
unrelated to its mutations by reverting and reproducing, and reported blocked
rather than handing a broken tree downstream. Fixed in the wrapper (trap rm)
and the commands (--ignore=e2e/mutants).

## Deferred-item status for the final review
SUPERSEDED — Task 2's "run.sh reports green when a file contributes nothing":
fixed in Task 7 round 5. run.sh now fails any file contributing zero assertions
and fails on an empty glob. Both verified, exit 1 each.

STILL OPEN, all Minor, all with zero current occurrences:
- Task 3: tests/rules.test.sh cd-back failure would skip the rm -rf and leave
  later sourced files in the wrong directory.
- Task 3: hooks/lib/rules.sh:9 ${1//\*\*/*} lacks a ${1:-} fallback, unlike its
  siblings. Does not trip set -u on bash 3.2; not guaranteed elsewhere.
- Task 4: a template with content AFTER its placeholder is unenforced -- the
  agent may drop it. /tdd-init warns; the guard cannot check it.
- Task 4: no word boundary after the static prefix (pytest -qq matches
  pytest -q); ${template%%\{*} also truncates at a brace-expansion {.
- Task 7: run.sh's per-file guard catches a file producing NOTHING, not one
  dying partway; a syntax error after assertion 3 stays invisible.
- Task 7: test files are SOURCED into run.sh's scope, so one assigning BEFORE,
  FOUND or t breaks the guard silently. No current file does.
- Task 7: the >=19 cardinality floor has 4 keys of slack (23 actual).

## FINAL WHOLE-BRANCH REVIEW — 2 blocking findings
1. CRITICAL, LIVE: paths never normalised. guard.sh strips the root by literal
   prefix, so ./x or x//y fails to strip, matches no glob, and on a READ that
   means ALLOW (denylist). Reproduced against the live config:
     red   ./e2e/src/calc/__init__.py   PERMITTED (e2e/src/... DENIED)
     green ./e2e/tests/test_divide.py   PERMITTED
   Survived 40 rounds because guard.test.sh tested exactly ONE relative
   spelling; its passing was indistinguishable from the property holding.
   tdd_normalize_path landed in rules.sh (3456f9c, 177/177). guard.sh call
   sites dispatched.
   NOTE: my first normaliser used ${p//\/\//\/} and silently emitted
   e2e\/src/a.py -- the SAME replacement-half trap as the ** bug in round 1.
   Caught only by printing output. Now uses tr -s.
2. Grep/Glob listed in agent frontmatter but outside the PreToolUse matcher, so
   such calls never reach the guard at all -- and Grep returns file CONTENT.
   A live probe showed this harness does NOT actually grant them (red held only
   Read/Write/Edit/Bash), so no live bypass, but the frontmatter promised what
   the guard could not cover. Removed rather than widening the matcher: Grep and
   Glob are directory-scoped, the guard classifies file paths, and granting a
   tool the guard cannot classify makes the boundary decorative.

Non-blocking, still to handle:
3. .tdd/config.json committed at root contradicts AGENTS.md:15 which says there
   is none. Either remove it or correct AGENTS.md.
4. Ledger's "zero occurrences" for the post-placeholder template gap is wrong:
   tdd-init's own Go row proposes `go test -run {testId} ./...`.
5. e2e/ ships with the plugin via marketplace source "./" -- dev-only, consider
   excluding.
- Final review finding 1 FIXED: tdd_normalize_path in rules.sh (3456f9c) + call
  sites in guard.sh (d51b5ff). 181/181. Bite-checked: removing the two
  normalisation lines fails exactly 4 assertions.
  The Task 5 implementer built its green assertion with helpers.py rather than a
  test_*.py name, so it cannot be satisfied coincidentally by the permissive
  **/test_*.py catch-all -- the way a similarly-shaped assertion WAS satisfied in
  round 1. First time on this branch the vacuous-pass mode was anticipated
  rather than discovered.

## Final review fixes — COMPLETE, branch mergeable
F1 path-normalisation bypass: FIXED (3456f9c rules.sh, d51b5ff guard.sh).
  Re-review re-derived the guarantee from the shipped files and reproduced the
  original repro plus new spellings. Bite-check: removing the two normalisation
  lines fails exactly 4 assertions.
F2 Grep/Glob outside the matcher: FIXED (0417c2c). Not a live bypass -- a probe
  showed this harness never granted them -- but the frontmatter promised what
  the guard could not cover. Removed rather than widening the matcher, since
  Grep/Glob are directory-scoped and the guard classifies file paths.
F3/F4/F5 (tracked config, Go template ordering, e2e ships): FIXED.
Residual from the re-review, also FIXED: a root spelled $ROOT/. bypassed --
  normalise handled leading ./ and middle /./ but not trailing /.
Spec reconciled with the shipped system across 8 items (8e58832).

### RESIDUAL, recorded not fixed
Symlink/realpath route: an absolute path filesystem-equivalent to the root but
spelled via a different route (e.g. /tmp vs /private/tmp on macOS) fails the
literal prefix match and is permitted on a read. Lexical normalisation cannot
address this; it needs realpath. Not reachable in this repo's layout, and
distinct from the already-documented agent-planted-symlink limitation.

### Final state
181/181 plugin tests, 7 e2e tests, tree clean, ~115 commits.
20 defects total: 12 found by review, 8 by running. All in the plan, none from
an implementer. Implementers caught 5 by flagging rather than transcribing.
