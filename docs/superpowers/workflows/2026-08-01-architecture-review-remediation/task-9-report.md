# Task 9 report: orchestrator-side test-file scan

## Summary

`skills/run-tdd-cycle/SKILL.md` is the only file touched, as the brief requires. The scan was added to Red's existing audit step
(*Per item / Red*, step 2) as a second thing that step checks, feeding the same `Violation → revert` branch the glob-match check
already used — not a new phase, not a parallel mechanism. Two downstream cross-references inside *Reverting a dispatch* that
described that branch's shape were also updated, because the new violation type breaks an assumption those references made
before this task (see "Downstream edits" below).

## What was added, and where

### 1. The scan itself (`### Red`, step 2, immediately after the glob-match check)

> "**Also read every touched test file and scan it for a raw read of source text** — `open(`, `File.read`, or your toolchain's
> equivalent raw-file-read call, whose target argument names a `globs.source` path. Red may not read source; a test that opens a
> source path and then prints, returns, or asserts on the raw text it read has done exactly that, through the one channel the
> guard cannot see: it runs as the test file itself, under Red's own configured test command, with no `PreToolUse` call to deny."

This is phrased as an instruction to the orchestrator ("read... and scan it"), not a passive description ("is scanned") — the
first draft used the passive form and an advisor review caught that it is reachable only by inference, the exact failure mode
this task's own verification standard warns about.

### 2. The false-positive carve-out

> "`require(`/`include` naming a `globs.source` path is **not, on its own, a hit.** That is how a test loads the module under
> test to exercise its behavior, and every Red test does exactly that — flagging it unconditionally would fire on the normal
> case this rule exists to leave alone. It becomes a hit only combined with the pattern above: the loaded value then treated as
> text and surfaced — printed, concatenated into an assertion message, returned as a string — rather than exercised as
> behavior."

This is the part the brief's four tokens (`open(`, `require(`, `include`, `File.read`) don't resolve on their own. `open(` and
`File.read` are unambiguous "read raw content" primitives — nothing about normal test authorship calls them on the module under
test. `require(`/`include` are different: they are literally *how* a test in most toolchains imports the module under test, and
that import's target is, by construction, a `globs.source` path. A scan that fires on the bare token+target-glob match would flag
every ordinary Red test that imports its subject — which is exactly the case constraint 5 in the task instructions named as
something that "must not trip this." The carve-out states the actual discriminator: read-vs-execute, not which function name was
used.

### 3. The ceiling statement

> "**This is a detector, not a control.** It is a substring-and-judgment heuristic against a file an LLM wrote, applied by you
> reading the file rather than by a literal grep: it raises the cost of the bypass and catches the obvious spelling, and it does
> not close the channel."

Contains the literal word "detector," satisfying the plan's stated completion criterion, and states the ceiling in the same
paragraph that introduces the mechanism — per the brief's constraint 1, "wherever it describes it."

### 4. Reusing the existing violation branch

> "Violation (glob mismatch or content-scan hit) → **revert** (see *Reverting a dispatch*) scoped to every path this audit found
> touched, not only the ones that failed the check — the whole dispatch is rejected, not just its offending half. Re-dispatch
> quoting the rule and the specific paths that failed it, up to `limits.violationRetries` times. Beyond that → stop, escalate."

This is the pre-existing branch, generalized from "broke the glob match" to "failed the check" so it correctly covers either
kind of finding, and still points at *Reverting a dispatch* by name rather than spelling out `git reset --hard` / `git clean` at
the point of use — per constraint 4, which explicitly forbids that.

## Downstream edits (in *Reverting a dispatch*)

An advisor review caught that the new violation type breaks two claims that section made before this task:

1. **The "found concrete paths" bucket's description of what Red's audit can name.** It said Red's audit names "the paths that
   failed the glob match" — no longer complete, since a content-scan hit is a path that *passed* the glob match. Updated to: "the
   paths that failed the check — a glob mismatch, or, for Red, a content-scan hit." Also flagged that a content-scan hit is the
   one violation in that bucket that sits *inside* the role's glob rather than outside it, since the bucket's own opening
   paragraph up top asserts "by definition... outside the role's globs" as the general justification for pathspec-based
   scoping — that assertion is no longer true without qualification, so it now says "for most of the checks below" and carries a
   parenthetical naming the one exception, rather than silently becoming false for one of the six violation-site/type
   combinations it describes.
2. **The "no check found anything" bucket's justification.** It said Red's and Green's `Violation → revert` branch is what
   makes "the audit already confirmed everything is inside the glob" a fact — this fact is now doing more work for Red than it
   states, since Red's audit also gates the content scan. Updated to note the branch "now also covers a content-scan hit" and
   that the confirmed fact is "inside the glob, and, for Red, clear of a content-scan hit."

Both are minimal, targeted edits — I did not rewrite the section's overall structure, and the "five sites" / "two cases" framing
is unchanged, since the content scan is a second failure mode within Red's existing audit site, not a sixth site.

## Trace 1: a committed test that reads a source file → detected → violation → revert

Scenario: Red's dispatch writes a file at a path matching `globs.test` (so it passes the ordinary glob check), but the file's
body contains `print(open("src/calculator.py").read())`.

1. The scan fires — quoting the sentence that makes it happen: *"Also read every touched test file and scan it for a raw read
   of source text — `open(`, `File.read`, or your toolchain's equivalent raw-file-read call, whose target argument names a
   `globs.source` path."* `open(` is present, its target `"src/calculator.py"` names a `globs.source` path.
2. It counts as a hit — quoting the rule that classifies it: *"Red may not read source; a test that opens a source path and
   then prints, returns, or asserts on the raw text it read has done exactly that, through the one channel the guard cannot
   see."* The test prints the read, satisfying "prints... the raw text it read."
3. It is a violation and reverts — quoting the branch: *"Violation (glob mismatch or content-scan hit) → **revert** (see
   *Reverting a dispatch*) scoped to every path this audit found touched... Re-dispatch quoting the rule and the specific paths
   that failed it, up to `limits.violationRetries` times."*
4. The revert mechanism the orchestrator is pointed at explicitly says how to scope `clean` for this exact case — quoting
   *Reverting a dispatch*: *"Red's audit and Green's each name the paths that failed the check — a glob mismatch, or, for Red, a
   content-scan hit (see *Per item*) — even though a content-scan hit sits *inside* `globs.test` by construction."* This closes
   the loop: the found-paths pathspec (not the role's glob fallback) is what `clean` uses, and the text says so explicitly rather
   than leaving it to be inferred from the general rule.

## Trace 2: a committed test that merely imports the module under test → not detected, no false positive

Scenario: Red's dispatch writes a test at a path matching `globs.test` whose body contains
`const { add } = require('../src/calculator')` (a normal JS import of the module under test) and nothing else that touches
source content.

1. The scan's trigger tokens include `require(`, and the target `'../src/calculator'` names a `globs.source` path — so the bare
   token+target match alone would, incorrectly, look like a hit.
2. The carve-out is the sentence that prevents that — quoted in full above: *"`require(`/`include` naming a `globs.source` path
   is **not, on its own, a hit.** That is how a test loads the module under test to exercise its behavior, and every Red test
   does exactly that... It becomes a hit only combined with the pattern above: the loaded value then treated as text and
   surfaced — printed, concatenated into an assertion message, returned as a string — rather than exercised as behavior."* The
   scenario only calls `add(...)` (uses the loaded value as behavior) and never surfaces `require`'s return value as text, so the
   "combined with the pattern above" condition is not met.
3. No hit → the audit's other clause (glob match) already passed, so nothing in step 2 fires, and the dispatch proceeds through
   the ordinary outcome branch in step 3 (`failing` → commit, `red`, continue to Green) exactly as it would have before this
   task existed.

## What the heuristic misses (honest accounting)

- **Token coverage is illustrative, not exhaustive.** The brief's four tokens (`open(`, `require(`, `include`, `File.read`) are a
  mix of Python (`open`), Ruby (`File.read`), and JS/PHP (`require`/`include`) idioms. They do not literally include, for
  example, Node's actual raw-read primitive `fs.readFileSync`/`fs.readFile`, Go's `os.ReadFile`, or Rust's
  `std::fs::read_to_string`. I added "or your toolchain's equivalent raw-file-read call" to extend the rule's *intent* beyond the
  four literal strings, but that phrase depends on the orchestrator (an LLM) correctly generalizing in the moment — it is not a
  fixed pattern list, so its reliability varies by how well-known a given toolchain's read primitive is.
- **It is judgment, not a deterministic grep.** The task itself frames this as the orchestrator reading the file and reasoning
  about it, not running a literal regex — that is what makes the `require`/`include` carve-out possible at all (a bare substring
  match cannot distinguish "loads a module" from "loads and prints text"). The same judgment-based nature means an obfuscated
  version of the bypass — path built via string concatenation across variables, read via a wrapper function with an unrelated
  name, base64-decoded before printing, or shelled out through `subprocess`/`child_process` to `cat`/`type` the file — is not
  guaranteed to be caught, even though it is the same underlying bypass this task targets. The heuristic raises the cost of the
  straightforward version; it does not raise the cost of a deliberately obfuscated one by the same margin.
- **It only runs once, at Red's commit-gating audit.** This matches the plan's invariant ("caught at commit time") and is not a
  gap relative to the task's own scope, but it means there is no continuous or retroactive scan — a bypass that somehow evaded
  this check at commit time is not caught later by anything this task adds.

## Does Green's symmetric case belong here?

No — per the brief's constraint 6, I did not implement it, and I don't think it belongs in this task. Green's symmetric bypass
(a source file that prints a test file's content, pulled in by the test run) is a real, structurally identical channel, but it
would require a scan of Green's committed *source* files at Green's audit step (`### Green`, step 2) against `globs.test`
targets — a distinct site, with its own false-positive question (a source file legitimately referencing a fixture path, or a
source file that itself contains golden-file/snapshot-testing logic reading from `globs.test`, would need the same kind of
read-vs-execute discrimination this task worked out for Red). That is a same-shaped but separate task, not a small addition to
this one, and the brief scoped this task to Red's committed test files specifically.

## Files changed

- `skills/run-tdd-cycle/SKILL.md` — the only file touched. `git show --stat` on the commit below names it.

## Self-review findings

- First draft used passive voice ("is scanned") with no actor or verb — caught by advisor review before committing; rewritten as
  an imperative instruction consistent with every other step in this file ("On return, **audit**", "Run the coverage command",
  "run the configured single-test command... yourself").
- First draft treated `require(`/`include` identically to `open(`/`File.read` (all four "hit on target-glob-match alone") — this
  would have failed Trace 2 as originally written, since `require('../src/calculator')` is exactly the case constraint 5 warns
  must not trip the detector. Caught by advisor review, not by running any test (there is no automated test for this file's
  prose) — caught by tracing the required scenario against the literal text before treating the task as done.
- Confirmed the two downstream cross-references in *Reverting a dispatch* that described the pre-existing `Violation → revert`
  branch still read true after the branch's trigger condition widened; updated both rather than leaving a document that would
  mislead a reader following it script-fashion mid-cycle (relevant here specifically because this repo's own traps file calls out
  "fixing the document about the artifact is not fixing the artifact" as a recorded failure mode, and the inverse — leaving one
  part of a document accurate while a cross-referenced part goes stale — is the same class of defect).
- Re-read the full diff (`git diff -- skills/run-tdd-cycle/SKILL.md`) end to end for markdown bold-marker balance and to confirm
  no leftover reference to the old "broke the glob match" / "specific paths that broke the match" phrasing survived anywhere the
  new content-scan case would also apply. One remaining occurrence of "broke the glob match" (in the *Reverting a dispatch*
  five-sites paragraph) was left as-is: it already reads "not only the subset that broke the glob match **where one exists**,"
  which was already hedged for checks with no glob-mismatch subset (Refactor's hard coverage gate) before this task, so it
  correctly covers a content-scan hit's found-paths case too without further edits.
- Ran `node --test` before and after: 301 tests, 300 pass, 0 fail, 1 todo, unchanged in both counts and identities. Confirmed
  `git status --porcelain` shows only `skills/run-tdd-cycle/SKILL.md` modified before staging.

## Concerns

- The token-coverage gap noted above (real toolchain read primitives beyond the brief's four literal tokens) is inherent to the
  brief's chosen token list, not something I introduced or think this task should have expanded — flagging it so a future reader
  doesn't assume the four tokens are toolchain-complete.
- The `require`/`include` carve-out is a judgment call I made (not present in the brief or spec text verbatim) to make the
  detector actually satisfy the "must not trip on normal imports" requirement. I'm confident it's necessary — without it the
  detector fires on essentially every JS test file that imports its subject — but it is my addition, not a transcription, so it's
  the piece most worth a second look.
- Green's symmetric bypass remains fully open, as it was before this task; noted above rather than implemented, per explicit
  scope instruction.
