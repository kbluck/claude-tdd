# Task 7 Report — Scope the revert to the offending paths

## Status: DONE (round 6: fix round 3 of 5, last round — spec brought in line with the shipped `SKILL.md` mechanism)

Fixed the third instance of "revert does not revert" in `skills/run-tdd-cycle/SKILL.md`. The first two instances
were command choice (`git checkout -- .` and `git reset --hard` both leaving untracked files behind — already
fixed, present in the file before this task). This one is scoping: the `clean` pathspec was unconditionally set to
"the role's write globs," which is exactly wrong in the one scenario the revert exists as a backstop for — a
guardrail violation is by definition a write outside those globs, so the rogue file the audit caught sat outside
the glob by construction and a glob-scoped `git clean` could never reach it.

Round 1 fixed that but introduced a narrower version of the same class of bug (see "Round 2" below, caught by
advisor review before delivery): scoping `clean` to *only* the offending subset left the rest of the same rejected
dispatch's legitimate output behind. Round 2 fixes that, and also brings two more discard sites (Refactor's
incomplete-restore check, the mutation pass's tree-clean recovery) under the same corrected rule, since both are
just as exposed to the out-of-glob case as Red's and Green's audits.

Only `skills/run-tdd-cycle/SKILL.md` was touched across both commits, per the task's constraint. `git show --stat`
on both commits confirms.

## What changed

### Round 1 — the basic two-case split (`5e23898`)

**Before** (the `clean` pathspec rule in "Reverting a dispatch"):

```
**Only the `clean` half takes a pathspec.** Scope it to the globs that role may write — `globs.test` for Red, `globs.source` for
Green, Refactor and Mutate — because an unscoped `git clean -fd` would delete legitimately untracked work elsewhere in the tree.
(`clean` without `-x` spares gitignored paths, so the venv, the checklist and the coverage report survive either way; do not add
`-x`.)
```

This unconditionally hardcoded the role's write globs as the pathspec, with no branch for "the audit already
named the paths that violated those globs."

**After round 1** introduced a violation/ordinary split, and updated Red's audit-violation branch to reference the
offending paths explicitly. This was directionally correct but, as advisor review found, wrong in scope for the
violation case — see Round 2.

### Round 2 — fix the scope of what gets discarded, and cover two more sites (`9722bae`)

An advisor review pass (before this report was finalized) found two problems with round 1's implementation, both
in the same failure class as the defect under repair:

**Finding 1 — offending-paths-only leaves the rest of the same rejected dispatch behind.** Round 1's text said
"scope `clean` to the offending path(s) the audit named — the paths it found that did not match the role's glob."
Taking the round-1 trace's own setup — Red writes both a legitimate `tests/test_x.py` (in-glob) and a rogue
`src/rogue.py` (out-of-glob) in the same dispatch — cleaning only `src/rogue.py` removes the rogue file but leaves
`tests/test_x.py` sitting in the tree. That is verbatim the failure this section's opening paragraph exists to
prevent ("a rejected `passing-flat` test was still sitting in the tree, where the next item's commit would have
swept it up") — just for the half of the dispatch that happened to pass the glob check. The whole dispatch is
being rejected and re-dispatched under `limits.violationRetries`; all of its output must go, not only the
out-of-glob part.

I confirmed this empirically against a throwaway git repo before changing anything (see Trace A below) — the
round-1 scoping left `tests/test_x.py` behind; scoping to every path the audit found (both files) left the tree
clean.

**Finding 2 — two more sites detect concrete dirty paths but were left on the "fallback to role's glob" branch.**
Refactor's incomplete-restore check and the mutation pass's tree-clean recovery both re-run `git status
--porcelain` (and `git diff HEAD`) and treat a non-empty result as the trigger for `reset and clean`. That is
functionally the same shape as an audit finding a violation — a check computed a concrete list of paths that
should not be there. Round 1 classified both as "ordinary" (fall back to the role's glob) on the reasoning that
Refactor and Mutate can only write inside `globs.source` because the guard enforces it. But the guard is fallible
— that is exactly what Preflight item 7 exists to probe (a guard that fails to launch permits everything
silently) — so a dirty path outside `globs.source` at these two sites is the same backstop scenario the whole
section exists for, not a hypothetical. Moved both into the "found concrete paths" case.

**Before round 2** (the central rule, as left by round 1):

```
**Only the `clean` half takes a pathspec — and that pathspec is the offending paths the audit reported, not the role's write
globs.** ...

- **The discard follows a reported guardrail violation** (Red's audit or Green's, each below in *Per item*). Scope `clean` to the
  offending path(s) the audit named — the paths it found that did not match the role's glob.
- **The discard has no violation to report** — Red's `passing-flat` outcome, Green's unreproducible pass or full-suite regression,
  either coverage gate's overrun, Refactor's incomplete-restore check, or the mutation pass's tree-clean recovery. In every one of
  these the audit already ran clean before the discard was triggered, so every touched path already matches the role's glob by
  construction, and the offending-paths case above does not apply. Fall back to `globs.test` for Red, `globs.source` for Green,
  Refactor and Mutate.
```

**After round 2:**

```
**Only the `clean` half takes a pathspec — and that pathspec is every path the triggering check actually found, not the role's
write globs.** A guardrail violation is *by definition* a write to a path that does not match the role's globs — that is what
makes it a violation rather than ordinary work. So in the scenario this backstop exists for, the rogue file sits outside the
glob by construction, and a `clean` scoped to the glob can never reach it. Two cases, not one; do not collapse them:

- **A check found concrete paths responsible for the discard.** Red's audit and Green's each name the paths that failed the glob
  match (see *Per item*). Refactor's incomplete-restore check and the mutation pass's tree-clean recovery each re-run `git status
  --porcelain` (and `git diff HEAD`) and find it non-empty when it was supposed to be clean — that finding **is** a list of
  concrete paths, the same way an audit's is. In every one of these, scope `clean` to **every path the check found**, not only
  the subset that broke the glob match. A dispatch that violated the glob usually also wrote legitimate in-glob files alongside
  the rogue one — leaving those behind after `clean` reproduces the exact bug this section opens with (a rejected file surviving
  to be swept into a later commit), just for the half of the dispatch that happened to pass the glob check. And a dirty tree
  after Refactor's or Mutate's own restore is not automatically confined to `globs.source`: the guard that normally keeps them
  inside it is the same fallible mechanism Preflight item 7 exists to probe, so a dirty path outside the glob at these two sites
  is the backstop scenario, not a hypothetical one.
- **No check found anything — the discard follows a judgment made from an already-clean audit.** Red's `passing-flat` outcome,
  Green's unreproducible pass or full-suite regression, and either coverage gate's overrun are decisions made *after* that
  dispatch's own audit already passed with nothing flagged. There is no list of problem paths to name here, only the earlier
  confirmation that everything this dispatch touched was inside the role's glob. Fall back to `globs.test` for Red, `globs.source`
  for Green, Refactor and Mutate.
```

Also added one sentence at the end of the paragraph explaining that `git checkout` on a brand-new untracked path
errors with `fatal: pathspec '<path>' did not match any file(s) known to git` and that this is expected — my own
probe output showed this twice and an orchestrator reading a `fatal:`/`error:` line from the first command in the
pair could otherwise misread it as the revert having failed.

**Red's audit-violation branch, before round 2:**

```
2. On return, **audit**: `git diff --name-only` plus `git status --porcelain`. Every touched path must match `globs.test`.
   Violation → **revert** (see *Reverting a dispatch*) using the offending paths this audit found, re-dispatch quoting the rule
   and those paths, up to `limits.violationRetries` times. Beyond that → stop, escalate.
```

**After round 2:**

```
2. On return, **audit**: `git diff --name-only` plus `git status --porcelain`. Every touched path must match `globs.test`.
   Violation → **revert** (see *Reverting a dispatch*) scoped to every path this audit found touched, not only the ones that
   broke the glob match — the whole dispatch is rejected, not just its out-of-glob half. Re-dispatch quoting the rule and the
   specific paths that broke the match, up to `limits.violationRetries` times. Beyond that → stop, escalate.
```

This distinguishes the two audiences that were conflated before: the **revert pathspec** (every touched path, full
dispatch) and the **re-dispatch message to the agent** (only the specific paths that broke the glob match — the
agent does not need, and should not be told about, the paths it got right). Green's audit ("On return, audit as
above against `globs.source`") inherits this by reference, so it did not need a separate edit.

**Refactor's incomplete-restore check, before round 2:**

```
Require `git status --porcelain` and `git diff HEAD` to both be empty; if either is not,
**reset and clean** (see *Reverting a dispatch*) yourself and record that the agent's restore was incomplete.
```

**After:**

```
Require `git status --porcelain` and `git diff HEAD` to both be empty; if either is not,
**reset and clean** (see *Reverting a dispatch*) yourself, scoped to whatever those two commands just reported, and record that
the agent's restore was incomplete.
```

**Mutation pass step 4, before round 2:**

```
4. On return, **verify the tree is clean**: `git status --porcelain` must be empty and `git diff HEAD` must be empty. Not clean →
   **reset and clean** (see *Reverting a dispatch*), record it, and do not trust the report — an agent that failed to revert may also
   have failed to run the suite honestly between mutants.
```

**After:**

```
4. On return, **verify the tree is clean**: `git status --porcelain` must be empty and `git diff HEAD` must be empty. Not clean →
   **reset and clean** (see *Reverting a dispatch*) scoped to whatever those two commands just reported, record it, and do not
   trust the report — an agent that failed to revert may also have failed to run the suite honestly between mutants.
```

Both make explicit, at the point of use, that the pathspec comes from what the check itself just found — not from
`globs.source` — closing Finding 2.

## Every discard site found, and how each is covered (final)

Nine call sites across eight sections (Red and Green share one written audit description) say "discard an agent's
work" via `revert` or `reset and clean`, all pointing at *Reverting a dispatch*:

| # | Site | Kind (final) | Pathspec |
|---|---|---|---|
| 1 | Red audit violation (`### Red`, step 2) | **Found paths** — audit found path(s) outside `globs.test` | Every path the audit found touched (full dispatch) |
| 2 | Green audit violation (`### Green`, step 2, "audit as above") | **Found paths** — audit found path(s) outside `globs.source` | Every path the audit found touched (full dispatch) |
| 3 | Red `passing-flat` (`### Red`, step 3) | Ordinary — audit already passed clean, no paths named | `globs.test` (fallback) |
| 4 | Green step 4, orchestrator's own test run fails | Ordinary — audit already passed; this is a reproduction failure, not a path finding | `globs.source` (fallback) |
| 5 | Green step 5, full-suite regression | Ordinary — audit already passed; a suite-wide check, not a path finding | `globs.source` (fallback) |
| 6 | Green step 6, coverage gate overrun | Ordinary — audit already passed; a coverage number, not a path finding | `globs.source` (fallback) |
| 7 | Refactor hard coverage gate overrun | Ordinary — audit already passed; a coverage number, not a path finding | `globs.source` (fallback) |
| 8 | Refactor incomplete-restore check | **Found paths** — `git status --porcelain`/`git diff HEAD` found concrete dirty paths | Whatever those two commands just reported |
| 9 | Mutation pass step 4, tree not clean | **Found paths** — `git status --porcelain`/`git diff HEAD` found concrete dirty paths | Whatever those two commands just reported |

Sites 1, 2, 8, and 9 are now in the "found concrete paths" case (moved from round 1's "3 ordinary + 2 violation"
split to round 2's "4 found-paths + 5 ordinary" split, correcting Finding 2). Sites 3–7 remain ordinary: none of
them is triggered by a check that names specific paths — they are triggered by a reproduction failure, a
suite-wide regression, or a coverage delta, all measured *after* that dispatch's own audit already confirmed every
touched path was inside the role's glob. For those five, falling back to the role's glob is not a compromise; by
the time the discard fires, the audit has already proven there is nothing outside it to miss.

I re-checked (as in round 1) that no site bypasses the central section by hardcoding `git checkout`/`git clean`
inline — none does; `git clean -fd` still appears only inside the central section itself. So the two edits to that
section, plus the four call-site edits above (Red's audit, Refactor's incomplete-restore check, Mutation's
tree-not-clean check — Green's audit inherits by reference), are the complete set of changes needed.

**One adjacent gap found, still not fixed (out of scope for this task, unchanged from round 1).** Refactor's own
audit step ("On dispatch: pass the trigger, the source paths in scope, and `knownRed`. Audit against
`globs.source`.") never spells out a `Violation → revert...` branch the way Red's and Green's do. If Refactor
itself writes outside `globs.source`, the file does not currently say what happens — a pre-existing structural gap
this task's scoping fix did not introduce and was not asked to add a new branch for. Flagging it for routing to
Task 13 ("remaining consistency items") or wherever audit-completeness gaps are tracked.

## Traces

Per the verification instruction, each step below quotes the exact sentence that makes it happen, and both
scenarios were run against a real git repo, not just read from the prose.

### Trace A — guardrail violation, rogue file plus a legitimate file in the same dispatch

Setup: Red is dispatched for an item. Config `globs.test = ["tests/**", "**/test_*.py"]`, `globs.source =
["src/**"]` (from `tests/fixtures/config.json`). Red writes a legitimate test file `tests/test_x.py` **and**, in
violation of its role, `src/rogue.py` — both in the same dispatch.

1. Per item / Red, step 2 (the audit): *"On return, **audit**: `git diff --name-only` plus `git status
   --porcelain`. Every touched path must match `globs.test`."* — the audit's raw output is both files; `src/rogue.py`
   does not match `globs.test`, so this is a violation.
2. Same step, continuation: *"Violation → **revert** (see *Reverting a dispatch*) scoped to every path this audit
   found touched, not only the ones that broke the glob match — the whole dispatch is rejected, not just its
   out-of-glob half."* — pathspec = `tests/test_x.py` **and** `src/rogue.py`, both.
3. *Reverting a dispatch*, the found-paths bullet: *"In every one of these, scope `clean` to **every path the
   check found**, not only the subset that broke the glob match."* — confirms the pathspec is the full pair, not
   just `src/rogue.py`.
4. The command pair: *"Revert means both: `git checkout -- <pathspec>` ... `git clean -fd -- <pathspec>`"* with
   `<pathspec>` = `tests/test_x.py src/rogue.py`.

**Empirical confirmation** (ran against two throwaway git repos, not just read):

- Scoping `clean` to only the offending path (`git clean -fd -- src/rogue.py`, matching round 1's text) removed
  `src/rogue.py` but left `tests/test_x.py` in the tree — `git status --porcelain` afterward: `?? tests/`. This
  reproduced the exact defect Finding 1 describes, empirically, before I made the round-2 edit.
- Scoping `clean` to both paths (`git clean -fd -- tests/test_x.py src/rogue.py`, matching the round-2 text)
  removed both. `git status --porcelain` afterward was empty.

### Trace B (supplementary) — Refactor's incomplete-restore check finds an untracked path outside `globs.source`

The task's required traces are A (a guardrail violation where the rogue file is outside the role's globs) and C
(an ordinary `passing-flat` discard), below. This one is additional, walking Finding 2's second found-paths site;
its empirical half was not independently re-run (see Concerns) — I judged it against the mechanism already proven
in Trace A rather than building a second throwaway repo for it.

Setup: Refactor is dispatched, reports `reverted`, but its self-restore (via `Edit`/`Write`, not `git checkout`)
was imperfect — assume, for the backstop scenario, that the guard did not enforce the write boundary on this
dispatch (Preflight item 7's exact concern: "a hook that cannot start exits non-2, which permits") and Refactor's
edits, in the course of drafting a note to itself, left a new **untracked** file `docs/scratch.md` behind — never
committed, outside `globs.source`. (Deliberately untracked, not a modification to an existing tracked file: `git
reset --hard HEAD` already restores tracked changes tree-wide with no pathspec needed, per the paragraph below
this one — the pathspec only does work for the untracked half, which is what this trace is checking.)

1. Refactor section: *"**On `reverted`, verify the tree rather than trusting the report.** ... Require `git status
   --porcelain` and `git diff HEAD` to both be empty; if either is not, **reset and clean** (see *Reverting a
   dispatch*) yourself, scoped to whatever those two commands just reported..."* — `git status --porcelain`
   reports `docs/scratch.md` as untracked (`??`); that is the concrete path this check found.
2. *Reverting a dispatch*, found-paths bullet: *"Refactor's incomplete-restore check ... re-run `git status
   --porcelain` (and `git diff HEAD`) and find it non-empty when it was supposed to be clean — that finding **is**
   a list of concrete paths, the same way an audit's is."* — confirms `docs/scratch.md` is used as the `clean`
   pathspec, not `globs.source` (which would not match it — `globs.source = ["src/**"]`, and `docs/**` is
   explicitly Ignore per `tests/fixtures/config.json`).
3. *Reverting a dispatch*, the `reset --hard` block: *"Those sites mean: `git reset --hard HEAD` / `git clean -fd
   -- <pathspec>`"* — `reset --hard HEAD` (unscoped, restores any tracked drift) plus `git clean -fd --
   docs/scratch.md` (scoped, removes the untracked file the check named).

Before round 2, this site would have used `globs.source` as the fallback `clean` pathspec — `git clean -fd --
src/**` cannot match `docs/scratch.md`, so the untracked leftover would have silently survived a `git status
--porcelain` check that only inspects tracked/staged state for the `reset --hard` half, not for what `clean`
needs. The underlying git mechanism (`clean -fd` scoped to a glob cannot reach a path outside it) is the same one
verified empirically in Trace A; this trace applies it to a different call site rather than re-proving it.

### Trace C — ordinary discard, `passing-flat`, no violation reported

Setup: Red is dispatched for an item, writes only `tests/test_flat.py` (in `globs.test`), the test passes, and
coverage does not move.

1. Per item / Red, step 2 (the audit): every touched path (`tests/test_flat.py`) matches `globs.test` — no
   violation, so the orchestrator never enters the found-paths branch.
2. Per item / Red, step 3: *"`passing-flat` → **revert** (see *Reverting a dispatch*), status `redundant`, next
   item..."* — no check ever named a problem path here; step 2's audit passed clean.
3. *Reverting a dispatch*, the ordinary bullet: *"**No check found anything — the discard follows a judgment made
   from an already-clean audit.** Red's `passing-flat` outcome... There is no list of problem paths to name here,
   only the earlier confirmation that everything this dispatch touched was inside the role's glob. Fall back to
   `globs.test` for Red..."* — `passing-flat` is named explicitly as this bullet's first example. Pathspec =
   `globs.test`.

**Empirical confirmation:** ran `git clean -fd -- 'tests/**' '**/test_*.py'` against a throwaway repo containing
only `tests/test_flat.py`; the file was removed, confirmed by an empty `git status --porcelain` afterward. This
fallback case was correct in both round 1 and round 2 — this trace exists to show it still holds after the round-2
rewrite, not to prove a regression fix.

## Files changed

- `skills/run-tdd-cycle/SKILL.md` — the only file touched across both commits. `git show --stat` on `5e23898` and
  `9722bae` each name exactly this file.

## Verification

```
node --test
# tests 297
# pass 294
# fail 2
# cancelled 0
# skipped 0
```

Unchanged across both rounds. The two failures, confirmed by name:
- `drift check: every key the spec declares also appears in tests/fixtures/config.json`
- `drift check: every key the spec declares also appears in the tdd-init.md Step 7 template`

Both are the known-red baseline owned by Task 8 (`commands.singleTerse` not yet added anywhere).
`grep -n singleTerse skills/run-tdd-cycle/SKILL.md` returns nothing — not added by this task, per the brief's
constraint. No other test failed or regressed at any point across both rounds. No test in the suite exercises
`SKILL.md` prose directly — this file is prompt-only, consistent with prior tasks (Task 5, Task 6) against the
same file; the traces above plus the throwaway-repo git runs are the verification evidence for this task, per the
task instructions for a prompt-only change.

## Self-review findings

Advisor review (before this report's first draft was finalized) caught both substantive findings above — I did
not find them myself in a first pass, and I want that on the record rather than implied. After applying the
round-2 fix, I re-read the full diff and the surrounding sections again with fresh eyes:

1. **Checked that "every path the check found" is unambiguous about where it comes from at each of the four
   found-paths sites.** Red/Green: `git diff --name-only` + `git status --porcelain` from the audit step. Refactor
   incomplete-restore / Mutation tree-not-clean: `git status --porcelain` + `git diff HEAD` from that same check.
   Both text edits name the exact commands, not just "the check," so a reader is not left to guess which git
   invocation produced the list.
2. **Checked the re-dispatch message (Red's step 2) still distinguishes "what gets cleaned" from "what gets
   quoted to the agent."** The revert pathspec is now the full touched set; the re-dispatch instruction still says
   "quoting the rule and the specific paths that broke the match" — only the offending subset, since that is what
   the agent needs to hear about, not what it did correctly.
3. **Checked the two ordinary examples lists (round 1's central section vs. the corrected round 2) removed
   Refactor's incomplete-restore check and the mutation pass's tree-clean recovery from the fallback bullet
   entirely** rather than leaving them listed in both places. Confirmed via `grep -n` — they appear only once each
   in the section, in the found-paths bullet.
4. **Re-verified `commands.singleTerse` still does not appear anywhere** after the round-2 edits.
   `grep -n singleTerse skills/run-tdd-cycle/SKILL.md` — no output.
5. **Re-ran `node --test` after round 2** to confirm the failing set is still exactly the same two Task-8 items —
   unchanged, and `git status --porcelain` confirmed only `SKILL.md` was modified before each commit.
6. **Considered whether Finding 2's reasoning also applies to Green's or Refactor's *coverage gate* sites (6, 7)**
   — it does not: a coverage gate produces a number (uncovered-line delta), never a path list, so there is nothing
   for it to "find" in the sense Finding 2 addresses. Left those two on the ordinary/fallback branch, matching the
   table above.

No further defects found in this pass, aside from one non-blocking observation (below): a `clean -fd -- <file
paths>` pathspec leaves the now-empty parent directory on disk, since `git status --porcelain` never reports empty
directories. Reproduced in the Trace A probe output (`Removing tests/test_x.py`, not `Removing tests/`), whereas
round 1's coarser glob pathspec had removed the directory itself (`Removing tests/`). No branch in `SKILL.md`
depends on the directory being gone — every gate that follows a revert checks `git status --porcelain`/`git diff
HEAD` for emptiness, and an empty untracked directory does not appear in either — so this is not a correctness
gap for anything the workflow currently checks. Not acted on; recorded here rather than silently noticed and
dropped.

## Concerns

- The Refactor-audit violation-branch gap (noted above, unchanged from round 1) is real but out of scope for this
  task; it should be routed to whichever task owns audit-completeness across all four roles (Task 13, "remaining
  consistency items," looks like the natural home, but I have not read that task's brief to confirm it is claimed
  there).
- As with Tasks 5 and 6, no automated test exercises this fix directly — Task 12 is the task that will add the
  out-of-glob e2e case this brief's "Done when" line refers to. The throwaway-repo git runs in the traces above
  are the closest thing to an automated check available within this task's scope, and Trace A in particular
  reproduces round 1's actual bug empirically, not just by inspection.
- I did not build a full second throwaway-repo probe for Trace B (Refactor's incomplete-restore check) beyond
  confirming the general `clean`-cannot-reach-outside-a-glob mechanism in Trace A. I judged the two mechanically
  identical (same `git clean -fd -- <pathspec>` behavior, different source for the pathspec) rather than re-running
  the same shell experiment with different file names; flagging the gap between "confirmed the git mechanism" and
  "confirmed this exact call site's wiring" so it's visible rather than silently assumed equivalent.

## Round 3 — coordinator-authorized spec correction (`c3e0b60`)

The coordinator verified both round-1/round-2 commits, confirmed the round-2 self-correction was correct, and
identified that its root claim traced back to an error in the coordinator's own brief and the design spec itself
— `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:306` stated the same incomplete rule Task 7's
round 1 had implemented (offending-subset-only), which round 2 had already proven wrong empirically. The
coordinator authorized a narrowly scoped spec edit to bring the design contract back in line with the correct,
implemented behavior — explicitly citing the same reasoning as the Task 4 precedent: a design document that
contradicts a correct implementation is how someone later "aligns" the implementation back to the wrong rule, and
this is a revert boundary that has already failed twice.

**Constraints given:** scope the edit to the one claim and its immediate reasoning; do not restructure the
section; leave the "third instance of the same class" paragraph alone; keep the fallback-to-role's-globs sentence
correct for the ordinary discard case; touch nothing else in the spec.

**Before** (`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:306`):

```
**The pathspec is the offending paths the audit reported, not the role's write globs** *(iteration 2)*. Scoping to the role's globs was wrong in the one scenario the revert exists for: a guardrail violation is *by definition* a write to a path that does not match the role's globs — that is what makes it a violation rather than ordinary work. In the backstop case the audit exists to catch, the rogue file sits outside the glob by construction, and a glob-scoped `clean` cannot touch it. Fall back to the role's globs only when the audit named no offending path, which is the ordinary discard case (a rejected `passing-flat` test) rather than a violation.
```

**After:**

```
**The pathspec is every path the triggering check found, not the role's write globs** *(iteration 2)*. Scoping to the role's globs was wrong in the one scenario the revert exists for: a guardrail violation is *by definition* a write to a path that does not match the role's globs — that is what makes it a violation rather than ordinary work. In the backstop case the audit exists to catch, the rogue file sits outside the glob by construction, and a glob-scoped `clean` cannot touch it. Nor is the pathspec only the paths that broke the match: a violating dispatch usually also writes legitimate in-glob files alongside the rogue one, and scoping to the offending subset alone leaves those behind — reproducing this section's founding bug (a rejected file surviving to be swept into a later commit) for the half of the dispatch that happened to pass. Fall back to the role's globs only when the triggering check named nothing at all, which is the ordinary discard case (a rejected `passing-flat` test) rather than a violation.
```

**What I verified this correction against:** the round-2 `SKILL.md` text (committed at `9722bae`, unchanged by
this round) and Trace A's empirical result, both already in this report — specifically the sentence "In every one
of these, scope `clean` to **every path the check found**, not only the subset that broke the glob match" (the
central *Reverting a dispatch* section) and the Trace A probe output showing `tests/test_x.py` left behind under
offending-subset-only scoping and removed under full-touched-set scoping. The spec's corrected claim is now a
direct paraphrase of that already-verified `SKILL.md` rule, not a new, independently-derived statement — I did not
invent new reasoning for the spec beyond what round 2 had already established and tested.

**Diff scope check.** `git diff --stat` for this commit shows exactly one file, one line changed:

```
 docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

The sentence before it ("Only `clean` takes a pathspec...") and the paragraph after it ("This is the third
instance of the same class...") are byte-for-byte unchanged — confirmed by re-reading the file after the edit,
not merely by intent. The fallback-to-role's-globs clause ("Fall back to the role's globs only when...") is
preserved, correctly, as the sentence's closing clause.

### Verification (round 3)

```
node --test
# tests 297
# pass 294
# fail 2
```

Failing set unchanged: the same two Task-8 `singleTerse` drift-check items. `git status --porcelain` confirmed
clean before the commit; `git show --stat c3e0b60` names exactly the one spec file.

### Files changed (through round 3)

- `skills/run-tdd-cycle/SKILL.md` — rounds 1–2 (`5e23898`, `9722bae`).
- `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` — round 3 (`c3e0b60`), coordinator-authorized,
  one claim and its immediate reasoning only.

No other file was touched in any round through round 3.

## Round 4 — independent task review, fix round 1 of 5 (`c9638cf`)

An independent review of the task (separate from the advisor pass in round 2) re-enumerated all nine discard
sites from scratch and confirmed the table — no site missed, no phantom site — and credited the round-2
self-correction, the re-dispatch-message-vs-revert-pathspec distinction, and the `git checkout` "fatal: pathspec"
note. It returned "Needs fixes" on two points, one Important and one Minor, both fixed here.

### Finding 1 (Important) — site 7 was classified "ordinary" on a premise that only holds for Red and Green

**The problem.** Round 2's central-section text justified the "no check found anything, fall back to the role's
glob" bucket with: "decisions made *after* that dispatch's own audit already passed with nothing flagged." Site 7
(Refactor's hard coverage gate) was placed in that bucket. But Refactor's audit step, unlike Red's and Green's,
has no defined violation consequence — `SKILL.md`, `### Refactor trigger check`: *"On dispatch: pass the trigger,
the source paths in scope, and `knownRed`. Audit against `globs.source`."* — one clause, no `Violation → revert`
branch. My own round-2 report had already named this gap (deferred to Task 13) without connecting it to site 7's
classification. The review's point: reaching Refactor's coverage gate does **not** prove every touched path is
inside `globs.source`, because nothing upstream of it checks that and acts on a failure — so falling back to
`globs.source` at that gate carries exactly the gap this section exists to close into the one site meant to catch
it, in the identical backstop scenario (the guard fails to launch — Preflight item 7's own concern) already used
to justify moving sites 8 and 9 into the found-paths bucket. Applying that reasoning to sites 8/9 but not site 7,
for the same role and the same fallible guard, was the internal inconsistency the review flagged.

**The fix — one clause, per the review's explicit instruction not to add Refactor's missing audit-violation
branch** (that stays Task 13's, and adding it here would be scope creep):

**Before** (`### Refactor trigger check`, hard coverage gate):

```
Then apply the **hard coverage gate**: run coverage yourself and compare against the pre-dispatch baseline. Any increase in
uncovered lines beyond `coverageGates.refactorMaxNewUncovered` (default 0) → **reset and clean** (see *Reverting a dispatch*) and
record `reverted`, regardless of what the agent reported. New uncovered lines mean new behavior, and Refactor adding behavior is a
boundary violation, not a quality issue. There is no re-dispatch — reverting is the correct outcome.
```

**After:**

```
Then apply the **hard coverage gate**: run coverage yourself and compare against the pre-dispatch baseline. Any increase in
uncovered lines beyond `coverageGates.refactorMaxNewUncovered` (default 0) → **reset and clean** (see *Reverting a dispatch*),
scoped to `git diff --name-only` plus `git status --porcelain` run fresh at this point — the "Audit against `globs.source`" step
above has no defined violation consequence, so nothing has yet confirmed every touched path stayed inside `globs.source`, and
falling back to that glob here would carry the gap into the one site meant to catch it — and record `reverted`, regardless of
what the agent reported. New uncovered lines mean new behavior, and Refactor adding behavior is a boundary violation, not a
quality issue. There is no re-dispatch — reverting is the correct outcome.
```

(An earlier draft of this edit said "Refactor's audit two paragraphs above" — I caught this myself before committing:
counting paragraphs backward from the hard-coverage-gate paragraph lands on "No hit → status `done`, next item,"
not the audit clause. Replaced the fragile paragraph count with a direct quote of the clause being referenced.)

Also updated the central section to move site 7 into the found-paths bucket and explain why its justification
differs from sites 8/9 (a proactive fresh check, not a check that is itself the trigger):

**Before** (central section, found-paths bullet, excerpt):

```
- **A check found concrete paths responsible for the discard.** Red's audit and Green's each name the paths that failed the glob
  match (see *Per item*). Refactor's incomplete-restore check and the mutation pass's tree-clean recovery each re-run `git status
  --porcelain` (and `git diff HEAD`) and find it non-empty when it was supposed to be clean — that finding **is** a list of
  concrete paths, the same way an audit's is. In every one of these, scope `clean` to **every path the check found**...
```

**After** (excerpt; full text in the commit):

```
- **A check found concrete paths responsible for the discard.** Red's audit and Green's each name the paths that failed the glob
  match (see *Per item*). Refactor's incomplete-restore check and the mutation pass's tree-clean recovery each re-run `git status
  --porcelain` (and `git diff HEAD`) and find it non-empty when it was supposed to be clean — that finding **is** a list of
  concrete paths, the same way an audit's is. **Refactor's hard coverage gate belongs here too, for a reason specific to
  Refactor:** its own audit step (see *Per item*) is one clause with no defined violation branch, so unlike Green's coverage-gate
  overrun below — which fires only after an audit that *does* gate conformance — reaching Refactor's gate proves nothing about
  whether every touched path stayed inside `globs.source`. Run the same `git diff --name-only` / `git status --porcelain` Red's
  and Green's audits use, fresh, at the point the gate fires, and scope `clean` to what it returns instead. In every one of
  these five sites, scope `clean` to **every path the check found**...
```

### Finding 2 (Minor) — the fallback sentence still named Mutate, and now Refactor too, with no site left there

The review flagged Mutate specifically: *"SKILL.md:176-177 still reads 'Fall back to `globs.test` for Red,
`globs.source` for Green, Refactor and Mutate.' Under your final split Mutate has no ordinary site."* Fixing
Finding 1 removes Refactor's last ordinary site too (site 7 was it), so the same contradiction now applies to
Refactor as well — I widened the fix to cover both rather than leaving Refactor half-fixed one round later.

**Before:**

```
Fall back to `globs.test` for Red, `globs.source` for Green, Refactor and Mutate.
```

**After:**

```
Fall back to `globs.test` for Red, `globs.source` for Green. Refactor and Mutate have no site in this bucket: every one of
their discards is the found-paths case above.
```

Also reworded the bucket's opening sentence to state the premise precisely — *"an already-clean audit that gates
conformance"* — and named the `Violation → revert` branch as what makes that a fact rather than an assumption, so
a future reader cannot repeat Finding 1's mistake by assuming any audit-shaped step qualifies for the fallback.

### Trace — the site-7 backstop path, quoting the sentence that causes each step

Setup: Refactor is dispatched. The guard failed to launch on this dispatch (Preflight item 7's exact concern:
*"a hook that cannot start exits non-2, which permits"*), so nothing enforced Refactor's write boundary. Refactor
makes a legitimate edit to the existing tracked `src/keep.py` **and** writes a new, never-committed
`docs/scratch.md` — outside `globs.source`, undetected.

1. `### Refactor trigger check`: *"On dispatch: pass the trigger, the source paths in scope, and `knownRed`.
   Audit against `globs.source`."* — this is the entire audit step; it has no stated consequence for a mismatch,
   so `docs/scratch.md` passes through unflagged. This is the clause Finding 1 is about.
2. *"Then apply the **hard coverage gate**: run coverage yourself and compare against the pre-dispatch baseline.
   Any increase in uncovered lines beyond `coverageGates.refactorMaxNewUncovered`... → **reset and clean**"* — the
   gate fires on the coverage delta (a number), independent of step 1's silent miss.
3. *"...scoped to `git diff --name-only` plus `git status --porcelain` run fresh at this point..."* — this is the
   sentence that causes the pathspec to be computed fresh rather than assumed from `globs.source`.
4. *Reverting a dispatch*, `reset --hard` block: *"Those sites mean: `git reset --hard HEAD` / `git clean -fd --
   <pathspec>`"* — `<pathspec>` is now whatever step 3 found.

**Empirical confirmation**, run against a throwaway git repo with exactly this setup (`src/keep.py` legitimately
modified, `docs/scratch.md` untracked and out-of-glob):

- **Before this fix** (fallback to `globs.source`): `git reset --hard HEAD; git clean -fd -- 'src/**'` left
  `docs/scratch.md` on disk — `git status --porcelain` afterward: `?? docs/`. Reproduced the exact failure Finding
  1 describes, empirically, before making the edit.
- **After this fix** (fresh check, scoped clean): captured `docs/scratch.md src/keep.py` via `git diff
  --name-only` + `git status --porcelain --untracked-files=all`, then `git reset --hard HEAD` (restores
  `src/keep.py`, tree-wide, no pathspec needed) followed by `git clean -fd -- docs/scratch.md src/keep.py`
  (removes the untracked file; silently no-ops on the tracked one, which is already handled by `reset --hard`).
  `git status --porcelain` afterward was empty.

### A new finding surfaced while building this trace, flagged but not acted on

Building the trace above, I first tried the wrong command pair (`git checkout --` instead of `git reset --hard
HEAD`, which is what site 7 actually specifies) and found something worth recording even though it turned out not
to apply to site 7: **`git checkout -- <path1> <path2>` aborts the entire operation, restoring *nothing*, if
*any* one of the listed paths does not match a tracked file** — confirmed with `git checkout -- docs/notes.md
src/keep.py` where `docs/notes.md` was untracked and `src/keep.py` was tracked-and-modified: exit code 1, and
`src/keep.py` was left unrestored. A **glob** pathspec (`git checkout -- 'tests/**'`) does not have this problem —
confirmed separately — because the glob itself resolves against tracked files only, so an untracked sibling
matching the glob textually is simply irrelevant to it.

This matters because rounds 1–2 replaced the glob-based pathspec with literal per-file paths for the found-paths
case, and the `checkout` + `clean` command pair (used at sites 1–6, not 7–9) is exactly where a literal pathspec
could include both a tracked-modified path and an untracked-new path in the same revert — e.g., Red editing an
existing shared test fixture while also writing a rogue file, or Green modifying an existing source file while
also writing outside `globs.source`. If that happens, `checkout` would silently fail to restore the tracked file's
edit while `clean` (which does not share this atomicity behavior — confirmed separately, it processes each
pathspec entry independently and simply skips ones that are not untracked) still removes the rogue file. Site 7 is
unaffected because it uses `reset --hard HEAD`, which takes no pathspec and always restores tracked files
tree-wide.

I did not fix this — it is not one of the two findings I was asked to address this round, and the corrective
options (e.g., separating each revert's pathspec into a tracked subset for `checkout` and an untracked subset for
`clean`, or switching sites 1–6 to `reset --hard` the way 7–9 already work) are exactly the kind of design choice
this section has been through three rounds of scoped, reviewed edits to get right — not something to improvise
under a "fix these two things" instruction. Flagging it explicitly rather than silently discovering and dropping
it.

### Verification (round 4)

```
node --test
# tests 297
# pass 294
# fail 2
```

Failing set unchanged: the same two Task-8 `singleTerse` items. `grep -n singleTerse skills/run-tdd-cycle/SKILL.md`
returns nothing. `git status --porcelain` was clean before the commit; `git show --stat c9638cf` names exactly
`skills/run-tdd-cycle/SKILL.md`.

### Files changed (through round 4)

- `skills/run-tdd-cycle/SKILL.md` — rounds 1, 2, 4 (`5e23898`, `9722bae`, `c9638cf`).
- `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` — round 3 (`c3e0b60`).

No other file was touched through round 4.

## Round 5 — fix round 2 of 5: the flagged `checkout` finding was live, not latent (`d038786`)

Round 4's report flagged, but did not act on, a newly-discovered `git checkout -- <mixed pathspec>` atomicity
failure — deliberately, since it was outside that round's two findings. The coordinator reproduced it
independently, confirmed it is not latent but a **live regression this task introduced**, and routed it back in
as an in-scope fix — the fourth instance of "revert does not revert," this one exposed (not created — see the
correction below) by the fix for the third.

### The defect, reproduced cleanly

```
$ git checkout -- tracked.py untracked.py
error: pathspec 'untracked.py' did not match any file(s) known to git
exit: 1
$ cat tracked.py
modified                      # ← restored NOTHING despite being a legitimate, tracked, modified file
$ git checkout -- tracked.py  # control: tracked path alone
exit: 0                       # ← restores correctly
```

**Why this is in scope, not a pre-existing issue:** before rounds 1–2, the pathspec passed to `checkout` was a
**glob** (`globs.test`, `globs.source`). A glob pathspec resolves against tracked files only — it does not "fail
to match" the way a literal path to an untracked file does, so `git checkout -- 'tests/**'` never triggered this
abort even when untracked files also existed under `tests/`. Rounds 1–2 replaced that glob with a **literal list
of every path a check found**, for the found-paths case (sites 1, 2, 7, 8, 9). A literal list mixing one
tracked-modified path with one untracked-new path is the *ordinary* shape of a violating dispatch — Red's tests
are almost always new files — not an edge case, so this was reachable on essentially any real violation involving
both a legitimate edit and a rogue write in the same dispatch.

**The consequence, stated precisely (this is what makes it worse than either of the first two instances):**
`checkout` aborts and restores nothing, `clean` (unaffected — see below) still removes the untracked files, and
the tree *looks* reverted (nothing untracked is left, `git status --porcelain` after `clean` is quieter than
before) while the tracked modification silently survives into the next commit. Neither of the first two instances
of this class did that — `git checkout -- .` unscoped, and `git reset --hard`, both simply left untracked files
behind, visibly, in a tree that still showed the leftover in `git status --porcelain`. This one hides the failure
behind an apparently-cleaner tree.

### Fix chosen and why (the coordinator offered two valid shapes)

The coordinator described two shapes that both satisfy "every tracked path is restored, every untracked path
found is removed, neither half can abort the other":

1. Split the pathspec by tracked-ness (`git ls-files -- <paths>` to filter, `checkout` the tracked subset only).
2. Restore tree-wide with `git reset --hard HEAD` (no pathspec, so nothing to abort on), keep `clean` scoped.

**I chose shape 2 — retire `checkout` from this file entirely, unify every site on `reset --hard` + scoped
`clean`.** Reasoning:

- **The safety argument already exists in the document and applies uniformly.** `reset --hard HEAD` was already
  used, unscoped, at three sites (Refactor's coverage gate, Refactor's incomplete-restore check, the mutation
  pass's tree-clean recovery), justified by: *"safe here only because preflight requires a clean tree and exactly
  one agent writes per dispatch, so the only tracked changes to discard are that dispatch's own"* (round-1/2 text,
  now folded into the unified paragraph). That invariant — clean tree at dispatch start, single writer per
  dispatch — holds identically at every site, not only those three. Extending it costs nothing and needs no new
  justification invented for this fix.
- **It eliminates the bug class rather than working around it.** Shape 1 keeps `checkout` in the mechanism and
  adds a filtering step (`git ls-files`) to avoid feeding it a bad pathspec — more moving parts, another place a
  future edit could get the filter wrong (this project's whole ledger is defects introduced by added complexity
  at exactly this kind of seam). Shape 2 removes `checkout` from the picture, so the atomicity failure has no
  code path left to occur on.
- **It matches the mechanism already used at a majority of sites** (3 of 9 before this fix; all 9 after), reducing
  the number of distinct command patterns in the section from two to one.

I verified shape 2 has no equivalent failure mode of its own before committing to it:

```
$ git reset --hard HEAD          # with tracked.py modified AND untracked.py present
HEAD is now at ... init
exit: 0                          # always succeeds — no pathspec means nothing to validate, nothing to abort
$ cat tracked.py
orig                             # correctly restored
$ git status --porcelain
?? untracked.py                  # reset --hard never touches untracked files — clean's job, unaffected

$ git clean -fd -- tracked.py untracked.py   # mixed pathspec, one tracked, one untracked
Removing untracked.py
exit: 0                          # clean evaluates each entry independently; the tracked one is silently skipped
```

### What changed in `SKILL.md`

**Before** (the two parallel command blocks):

```
Revert means both:

    git checkout -- <pathspec>     # restore tracked edits
    git clean -fd -- <pathspec>    # remove new files

**`git reset --hard HEAD` has the identical blind spot** and appears wherever a branch resets to the last commit rather than
discarding working-tree edits — Refactor's coverage gate, Refactor's incomplete-restore check, and the mutation pass's tree-clean
recovery. Verified: `reset --hard` leaves untracked files exactly as `checkout` does. Those sites mean:

    git reset --hard HEAD
    git clean -fd -- <pathspec>
```

**After** (one unified block; full reasoning in the commit and the file itself):

```
Revert means both:

    git reset --hard HEAD          # restore every tracked file to HEAD — no pathspec, so nothing to abort on
    git clean -fd -- <pathspec>    # remove the untracked paths this dispatch's check found

`git reset --hard` replaces `checkout` here, everywhere in this file — not only at the sites that already used it before this
fix...
```

Also added a new opening paragraph documenting the atomicity failure (with the empirical reproduction inline),
added a paragraph establishing `clean`'s independence from that failure (also empirically verified inline), and
removed the now-obsolete sentence explaining that `git checkout` "errors on a new file — expected, and harmless"
(no longer true or applicable: `checkout` is not part of the mechanism anymore). Updated the closing paragraph
("Branches below say **revert** or **reset and clean**...") to state both words now name the identical mechanism,
rather than two parallel ones.

**Every other site was checked and needed no change.** I grepped the whole file for `checkout` after the edit:
the only remaining mentions are within *Reverting a dispatch* itself (the historical-bug paragraph, the new
atomicity paragraph, and the closing paragraph's warning against spelling out bare commands) plus one unrelated
mention in Refactor's incomplete-restore-check prose (*"Refactor restores by rewriting recorded text with
`Edit`/`Write`, not `git checkout`..."* — describing Refactor's own self-repair mechanism, not the orchestrator's
revert; correctly left alone). No call site outside the central section ever named `checkout` directly — every
branch says "revert" or "reset and clean" and points here, which is exactly what let this land as one section
edit rather than nine call-site edits, and what the closing paragraph now says explicitly.

### Two accuracy corrections made during this round, both against my own draft, before committing

1. **A causation error, caught by advisor review before commit.** My first draft said the atomicity failure was
   *"created by scoping the pathspec to fix the third [instance]."* That is wrong: the failure was already latent
   in `checkout`'s literal-pathspec handling — it did not need rounds 1–2 to exist. What rounds 1–2 did was change
   the pathspec from a glob (which never triggers this failure, since it always resolves against tracked files
   only) to a literal list (which can). Corrected to *"not created by scoping the pathspec to fix the third, but
   *exposed* by it."* This distinction matters in a file whose whole discipline is attributing defects to the
   change that actually caused them (see AGENTS.md, "Fixing the document about the artifact is not fixing the
   artifact" and the ledger's attribution habit generally) — "created by" would have been a false attribution.

2. **A self-caught measurement error, found re-verifying after the advisor's first correction.** The advisor
   flagged that my initial "exited 1" claim was contradicted by output from a *later* probe showing `checkout
   exit=0` for the identical failure, and suggested dropping the exit-code claim as unreliable. Before rewriting
   the sentence to say the exit code varies, I re-ran the exact command with no wrapping (`git checkout --
   tracked.py untracked.py; echo "exit: $?"`) three separate times and got exit 1 every time. The "exit=0" reading
   came from my own probe script, which had wrapped the command in `2>&1 || true` — a defensive pattern that
   forces the compound command's exit status to 0 regardless of what `git checkout` itself returned. That was a
   bug in *my test*, not a property of `git`. Writing "the exit code varies" into the design document would have
   been a false claim manufactured by the exact class of mistake AGENTS.md's "Verification instruments lie"
   section warns about — I caught it only by re-deriving the fact from a clean run rather than trusting the
   advisor's plausible-sounding read of my own flawed output. The committed text states the true, verified
   behavior (mixed pathspec → exit 1, unrestored; single tracked path → exit 0, restored) and keeps one honest
   version of the underlying point — that an orchestrator's *own* command wrapping (a `|| true` guard, a pipe)
   could still lose that signal even though `git` itself reports it reliably.

### Verification (round 5)

```
node --test
# tests 297
# pass 294
# fail 2
```

Failing set unchanged: the same two Task-8 `singleTerse` items. `grep -n singleTerse skills/run-tdd-cycle/SKILL.md`
returns nothing. `git status --porcelain` was clean before the commit; `git show --stat d038786` names exactly
`skills/run-tdd-cycle/SKILL.md`.

Also re-checked line wrapping: two lines drafted during this round temporarily broke the file's ~120–137
character wrap convention (one ballooned to 149 characters, mid-edit; another split awkwardly across two very
short lines). Caught with `awk '{ print length, NR }' | sort -rn | head` before committing and rewrapped to match
the surrounding prose — a formatting nit, not a content error, but recorded since it's exactly the kind of thing
a diff-only review would catch and a "did the tests pass" check would not.

### Files changed (through round 5)

- `skills/run-tdd-cycle/SKILL.md` — rounds 1, 2, 4, 5 (`5e23898`, `9722bae`, `c9638cf`, `d038786`).
- `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` — round 3 (`c3e0b60`).

No other file was touched through round 5.

## Round 6 — fix round 3 of 5, last round for this task: spec brought in line with `SKILL.md` (`1701615`)

The re-review of round 5 verdicted the `checkout` regression **ADDRESSED**, verifying all three load-bearing
claims empirically — including that `clean` evaluates each pathspec entry independently while `checkout` aborts
on the whole list, and that `reset --hard`'s index reset is a safe generalization here because nothing in the
file ever stages before a revert fires. It also confirmed both self-caught corrections from round 5 were right,
noting the exit-code one specifically as the more valuable catch: tracing a "git behaves inconsistently" reading
back to a `|| true` in my own probe script, rather than writing the plausible-but-false claim into the document,
is exactly the instrument-error class this repository's ledger has recorded multiple times.

One thing remained: retiring `checkout` in `SKILL.md` (round 5) made the spec **false**, not merely stale. The
spec's *Reverting a dispatch* section still showed `git checkout -- <pathspec>` as the current mechanism and
framed the pathspec rule around it — and coming right after round 5 proved that exact mechanism silently restores
nothing on a mixed pathspec, leaving it undocumented as retired would document a known-broken command as current
practice. The coordinator scoped this narrowly: bring that one section's mechanism statement into line with what
shipped, preserve the pathspec-sourcing rule and the "third instance" paragraph untouched, touch nothing else in
the spec, and do not touch the plan or the historical review documents.

### Before → after

**Before** (`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:297–304`):

```
Revert means both:

```
git checkout -- <pathspec>     # restore tracked edits
git clean -fd -- <pathspec>    # remove new files
```

Only `clean` takes a pathspec; `git reset --hard -- <path>` fails outright. Reset is therefore tree-wide, which is safe only because preflight requires a clean tree and exactly one agent writes per dispatch.
```

**After:**

```
Revert means both:

```
git reset --hard HEAD          # restore every tracked file to HEAD — no pathspec, nothing to abort on
git clean -fd -- <pathspec>    # remove new files
```

**`checkout` is retired from this mechanism** *(iteration 2)*. `git checkout -- <path1> <path2>` validates every pathspec before touching anything, and if any one of them does not match a file git already tracks, the whole command aborts and restores *nothing* — not even the paths that would have matched. A pathspec built from what a check found routinely mixes a tracked-modified path with an untracked-new one (Red's tests are almost always new files), which is exactly the shape that triggers this. `reset --hard` has no such failure mode: it takes no pathspec at all — `git reset --hard -- <path>` fails outright with `fatal: Cannot do hard reset with paths` — so there is nothing for it to fail to match. Only `clean` takes a pathspec; reset is therefore tree-wide, which is safe only because preflight requires a clean tree and exactly one agent writes per dispatch.
```

### What was preserved, verified rather than assumed

`git diff --stat` for this commit: `1 file changed, 2 insertions(+), 2 deletions(-)` — one code line and the
sentence immediately following it. I re-read the section after the edit to confirm the two paragraphs the
coordinator named stayed untouched:

- The pathspec-sourcing rule, `:306` (unchanged line number, unaffected by the edit above it): *"**The pathspec
  is every path the triggering check found, not the role's write globs** *(iteration 2)*..."* — byte-for-byte the
  same text this task's round 3 wrote, including its own fallback-to-globs clause for the ordinary discard case.
- The "third instance" paragraph, `:308`: *"This is the third instance of the same class — a revert that does not
  revert. The first two were command choice (`git checkout -- .` leaving untracked files; `git reset --hard` with
  the same blind spot); this one is scoping."* — left exactly as instructed, not renumbered to "fourth" or
  otherwise edited, even though round 5's `SKILL.md` commit message and this report both use "fourth instance"
  language for the `checkout`-retirement fix. The spec's numbering describes the three defects the spec itself
  already covers (unscoped `checkout`, `reset --hard`'s identical blind spot, and glob-vs-offending-paths
  scoping); the `checkout`-atomicity defect is not yet a fourth entry in the spec's own list, and the coordinator
  did not ask me to add one — only to fix the mechanism statement.

Also confirmed no other part of the spec changed: `docs/superpowers/plans/2026-08-01-architecture-review-remediation.md`
and every file under `docs/superpowers/reviews/` are untouched (`git status --porcelain` shows neither), matching
the explicit instruction not to touch the plan or the historical review documents.

### Verification (round 6)

```
node --test
# tests 297
# pass 294
# fail 2
```

Failing set unchanged: the same two Task-8 `singleTerse` items. `git status --porcelain` was clean before the
commit; `git show --stat 1701615` names exactly
`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md`.

### Files changed (final — all six rounds)

- `skills/run-tdd-cycle/SKILL.md` — rounds 1, 2, 4, 5 (`5e23898`, `9722bae`, `c9638cf`, `d038786`).
- `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` — rounds 3 and 6 (`c3e0b60`, `1701615`).

No other file was touched in any round.

## Task 7 — final summary across all six rounds

1. **Round 1** (`5e23898`): scoped the revert's `clean` pathspec to the audit's offending paths instead of the
   role's globs — the task's originally-scoped defect.
2. **Round 2** (`9722bae`), advisor-caught: fixed round 1's offending-subset-only scoping, which left a violating
   dispatch's legitimate in-glob files behind; also brought Refactor's incomplete-restore check and the mutation
   pass's tree-clean recovery under the same found-paths rule.
3. **Round 3** (`c3e0b60`), coordinator-authorized: corrected the spec's own claim, which round 2 had proven
   incomplete, to match what actually shipped.
4. **Round 4** (`c9638cf`), independent task review, fix 1 of 2 findings: moved Refactor's hard coverage gate from
   the "ordinary" bucket to "found paths," since its audit (unlike Red's and Green's) has no defined violation
   consequence to justify trusting the glob fallback; also removed Refactor and Mutate from the fallback sentence,
   since neither has an ordinary site left.
5. **Round 5** (`d038786`), fix 2 of 2 findings, self-caught scope expansion: retired `git checkout` from the
   mechanism entirely after proving it silently restores nothing on a mixed tracked/untracked literal pathspec —
   the shape rounds 1–2 made reachable and the ordinary shape of a violating dispatch. Unified every site on
   `git reset --hard HEAD` plus scoped `git clean -fd`, the mechanism already used and justified at three of the
   nine sites before this fix.
6. **Round 6** (`1701615`), coordinator-directed: brought the spec's *Reverting a dispatch* section in line with
   round 5's shipped mechanism, since it had gone from stale to actively false — documenting a command already
   proven to fail silently as the current practice.

Every round's commit touches exactly the file(s) named for that round; no round touched the plan, `agents/`, or
any historical review document. Test suite failing set — the two Task-8 `singleTerse` drift-check items — is
unchanged across all six rounds and every commit.
