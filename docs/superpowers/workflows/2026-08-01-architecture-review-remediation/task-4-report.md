# Task 4 Report: Preflight and `/tdd-init` learn about the interpreter

## Summary

Replaced the `jq`-on-`PATH` check in both `skills/run-tdd-cycle/SKILL.md` (preflight item, formerly numbered 3) and
`commands/tdd-init.md` (step 1, "Check prerequisites") with a Node interpreter/version check against `hooks/lib/rules.mjs`'s
`NODE_FLOOR`. Reordered `SKILL.md`'s preflight list to match the spec's canonical numbering (Node check at item 6, the
`agent_type` probe at item 7), since the spec and plan both cross-reference "item 6"/"item 7" numerically and the old numbering
(jq at 3) no longer agreed with either document. Markdown-only change; `hooks/` untouched.

## What changed, with before/after

### `skills/run-tdd-cycle/SKILL.md`

**Before** (item 3 of 7, unordered relative to the spec):
> 3. **`jq` on PATH.** Missing → stop. The guard fails closed without it and would deny every tool call.

**After** (item 6 of 7, matching spec order):
> 6. **Node is on `PATH` and is at least the floor `hooks/lib/rules.mjs` exports as `NODE_FLOOR`** — a floor, not a pin; a newer
> major passes. Run `node --version` through the `Bash` tool. Missing, or below the floor → stop and tell the user to install or
> upgrade Node.
>
> **The two failures are not the same shape.** A too-old-but-*present* Node does launch `guard.mjs`, which checks its own
> version first, before anything else can throw, and denies loudly with exit 2 — that path is genuinely fail-closed on its own.
> A missing Node never launches the guard at all: `PreToolUse` sees a non-2 exit and silently *permits* the call, exactly like a
> missing shell did. Preflight exists to catch both loudly, at setup, rather than let either reach a live dispatch.
>
> **This proves less than it looks like it proves — item 7 is what closes the gap.** This check only shows that node is on the
> *`Bash` tool's* `PATH`. The hook itself is spawned by Claude Code directly, in exec form, with no shell, so it resolves `node`
> against a different environment — and under a per-shell version manager (`fnm`, `nvm`) the two routinely disagree. Measured on
> the development machine: an IDE-hosted session resolved the hook's `node` to a bundled 24.13.0 while `fnm` gave the `Bash` tool
> 22.23.2, at the same moment on the same machine. Report both results to the user: a green version check here is necessary and
> **never sufficient** — do not let it read as proof the guard can start. Only item 7's observed denial is that proof.

Item 7 (the `agent_type` probe) is unweakened and still the last check run. One sentence was added at its start tying it back to
item 6:

> 7. **The guard actually sees `agent_type`.** This is also the only check that runs inside the interpreter Claude Code actually
> hands the hook — item 6's version check cannot see that far. Dispatch a throwaway subagent told to read one file under
> `globs.source` while claiming no role, then confirm the guard evaluated it. [... rest unchanged ...]

Its own "silently absent" paragraph gained one clause acknowledging that a successful probe read looks identical whether the
cause is a missing `agent_type` or a guard that never launched at all:

> If that read succeeds, the guard is not seeing `agent_type` — or never launched at all, which looks identical from here — every
> subagent looks like the orchestrator, and **read isolation is silently absent**.

**Reordering, stated explicitly.** Four items moved position with unchanged text: the old 4 (suite passes) is now 3, the old 6
(spec readable) is now 4, the old 5 (glob partition) stays 5. The one behavioral consequence: the cheap Node interpreter check
now runs *after* the full suite and spec-readability checks rather than third, matching the spec's own ordering. This is a
reordering of *when* the check runs relative to the other six, not a change to what it checks.

### `commands/tdd-init.md`

**Before** (step 1, "Check prerequisites"):
> - `jq` on PATH (`command -v jq`). Missing → stop and tell the user to install it. The guard parses its input with `jq` and
> fails closed without it, which would deny every tool call mid-cycle.

**After**:
> - Node is on `PATH` and is at least the floor `hooks/lib/rules.mjs` exports as `NODE_FLOOR` — a floor, not a pin; a newer major
> is fine. Check with `node --version` through the `Bash` tool. Missing, or below the floor → stop and tell the user to install or
> upgrade it. This is a hard stop, not a degradation: with no interpreter, or too old an interpreter, there is no
> reduced-guarantee mode to fall back to — the guard cannot be trusted to run at all.
>
> **The two failures are not the same shape.** A too-old-but-*present* Node does launch `guard.mjs`, which checks its own version
> first and denies loudly with exit 2 — that path is genuinely fail-closed on its own. A missing Node never launches the guard at
> all: `PreToolUse` sees a non-2 exit and silently *permits* the call — a missing interpreter fails open, exactly like a missing
> shell did. Catching both here, at setup, is what turns the open failure into a loud one.
>
> This only proves node is on the `Bash` tool's `PATH`, not on the `PATH` Claude Code spawns the hook with — the two can disagree
> under a per-shell version manager (`fnm`, `nvm`). `/tdd`'s preflight (item 7) is what actually proves the guard can start, by
> dispatching a probe subagent and observing a denial. Report both results to the user; a green version check here is not proof
> by itself.

Placed in step 1 ("Check prerequisites") rather than the "2c. Report every degradation explicitly" table two sections below it,
per the brief's instruction that a missing/too-old interpreter is a hard stop, not a degradation — the degradation table was
left untouched.

## What a fresh orchestrator would now do differently

- Running `/tdd-init` or `/tdd` preflight against a machine with no Node on the `Bash` tool's `PATH` (or a too-old one) now stops
  at setup with an explanation, instead of checking for `jq` (which the Node guard never needed and whose absence says nothing
  about whether the guard can run).
- After a green Node-version check, the orchestrator's own prompt text now tells it explicitly not to treat that as proof the
  guard can start, and to still run and report item 7's probe — closing the gap the brief's "necessary but not sufficient"
  point describes. Previously nothing in either document connected the version check to the probe at all.
- The orchestrator now has correct language to explain *why* a stop is needed for a missing interpreter: previously (patterned on
  the old jq wording, "the guard fails closed without it") the text would have told a user something false — that a missing
  interpreter is caught by the guard. It is not; only a too-old-but-present one is. This was caught in self-review (see below)
  before committing.

## Verification

- `node --test` from the repo root: **292 pass, 2 fail, 1 todo** (295 subtests total under 215 top-level `test()` calls), both
  before and after this change. The 2 failures are exactly the known-red Task-8 baseline:
  - `not ok 90 - drift check: every key the spec declares also appears in tests/fixtures/config.json`
  - `not ok 91 - drift check: every key the spec declares also appears in the tdd-init.md Step 7 template`
  Both are the `commands.singleTerse` gap owned by Task 8; confirmed by name that no other test regressed.
- Confirmed with `git diff --stat` before staging that only `commands/tdd-init.md` and `skills/run-tdd-cycle/SKILL.md` changed,
  and that neither touched `commands/tdd-init.md`'s "## 7. Write the files" JSON block (the region `config-contract.test.mjs`
  scopes its key-presence checks to) — my edits are both above that block, in step 1 and its surrounding prose.
- "Pointing the suite at a stubbed too-old interpreter produces a refusal rather than a run" — this guarantee is enforced by
  `hooks/guard.mjs`'s own version check (`main()`, checked first before anything else can throw) and is exercised by
  `tests/guard.test.mjs:449` (`'guard: the version floor is checked FIRST, before anything else can throw — below NODE_FLOOR
  denies with a setup-pointing message'`), which passes. This is pre-existing behavior from Task 3, unchanged by this task —
  Task 4 only updates the prompts that *describe* it, not the mechanism itself. I did not add a new test; there is none to add
  under a Markdown-only task.
- `NODE_FLOOR` value read from `hooks/lib/rules.mjs:25` (`export const NODE_FLOOR = 22;`) to confirm the semantics I was
  describing (floor, not pin), but neither file states the literal number — both point at `NODE_FLOOR` as the source of truth,
  per the brief's instruction not to hardcode a number that could drift.

## Self-review findings (and what changed as a result)

Called `advisor()` before committing. It caught a real factual inversion in my first draft of both files: I had written
"`guard.mjs` runs under this interpreter and fails closed without it" for the *missing*-Node case, patterned on the retired jq
sentence ("the guard fails closed without it"). That was true for jq (the bash guard had an explicit `command -v jq` deny) and
is false for Node: a missing interpreter means the hook process never starts, `PreToolUse` sees a non-2 (not-2) exit, and the
call is *permitted* — fail-open, not fail-closed. This is exactly the failure class the whole Node-port task exists to close, so
getting it backwards in the very prompt that is supposed to explain it would have been a real defect, not a nitpick. I verified
the correction against `hooks/guard.mjs:80-91` (the `runtimeSupported` check only executes if the process has already started)
and rewrote both files to separate "too-old-but-present" (guard's own check denies, loudly, exit 2) from "missing" (guard never
runs, permits, silently) as two distinct outcomes, in both `SKILL.md` item 6 and `commands/tdd-init.md` step 1. Re-ran
`node --test` after the fix; same 292/2/1 baseline.

The advisor also flagged that my first draft never explicitly told the orchestrator to "report both" results (the version check
and the probe outcome), per the brief's "Report both, and do not let a green version check read as proof the guard can start." I
added that sentence to both files.

Other things checked in self-review, no changes needed:
- Confirmed no other file in the repository cross-references preflight items by number in a way the reorder would break
  (`grep -rn "item 6\|item 7\|preflight item"` across `*.md`/`*.mjs`/`*.sh`) — only the spec and plan do, and both already use
  the new numbering.
- Confirmed `commands.singleTerse` was not added anywhere (fixture, `tdd-init.md`'s step 7 template) — verified by re-running the
  suite and seeing the exact same 2 named failures, not fewer or different ones.
- `commands/tdd-init.md:174` still reads "`jq` returns `null`, and a `null` threshold compares as 'never exceeded'". This is a
  known residual, out of this task's scope: it's illustrating generic JSON-tooling semantics (what a `jq` query against the
  config would show), not a claim about the guard's own implementation language, and it lives well outside step 1 and step 2c,
  the two sections the brief scoped this task to. Flagging it here so the next reader doesn't read its survival as an oversight.

## Files changed

- `/Users/kbluck/Claude/code/claude-tdd/skills/run-tdd-cycle/SKILL.md` — commit `590ff6f`
- `/Users/kbluck/Claude/code/claude-tdd/commands/tdd-init.md` — commit `d57c791`

## Concerns

None blocking. The one residual noted above (`commands/tdd-init.md:174`'s `jq` reference) is intentionally left for a future
pass, not silently dropped.

---

## Fix round 1 (review: "Needs fixes")

Three items from the coordinator's review. Fixed all three, re-verified, committed as three separate commits (one per scope:
`skill`, `command`, `spec`).

### 1. The floor path did not resolve — `${CLAUDE_PLUGIN_ROOT}` required

**Problem.** Both files told the orchestrator to read the floor from a bare relative `hooks/lib/rules.mjs`. Both `/tdd` and
`/tdd-init` run with cwd set to the user's target project, not this plugin's directory — the bare path resolves nowhere in
normal use. `hooks/hooks.json:11` already establishes the fix for exactly this: `${CLAUDE_PLUGIN_ROOT}`.

**`skills/run-tdd-cycle/SKILL.md`, item 6 — before:**
> 6. **Node is on `PATH` and is at least the floor `hooks/lib/rules.mjs` exports as `NODE_FLOOR`** — a floor, not a pin; a newer
> major passes. Run `node --version` through the `Bash` tool. Missing, or below the floor → stop and tell the user to install or
> upgrade Node.

**After:**
> 6. **Node is on `PATH` and is at least the floor `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs` exports as `NODE_FLOOR`** — a
> floor, not a pin; a newer major passes. `hooks/lib/rules.mjs` is inside the plugin's own directory, not the target project you
> are running against, so read it by the `${CLAUDE_PLUGIN_ROOT}`-relative path — a bare `hooks/lib/rules.mjs` resolves against
> the wrong cwd and will not exist there. Run `node --version` through the `Bash` tool and compare it against `NODE_FLOOR`.
> Missing, or below the floor → stop and tell the user to install or upgrade Node. **If `NODE_FLOOR` itself cannot be read,
> stop** — the same as a missing interpreter. Do not skip the comparison, guess a number, or treat the miss as a pass; an
> unevaluable check must not reach `allow`.

Same change in `commands/tdd-init.md` step 1, same before/after shape (bare path → `${CLAUDE_PLUGIN_ROOT}`-relative, plus the
explicit "unreadable floor → stop" instruction).

The "unreadable floor → stop" instruction is new content, not just a path fix: previously neither file said what to do if the
floor file itself could not be read. Left unstated, a fresh orchestrator has three live (wrong) readings — skip the comparison,
guess a number, or treat the miss as a pass — which is exactly the "what reaches `allow` when the check cannot be evaluated"
trap `AGENTS.md` names. Both files now say explicitly: stop, same as a missing interpreter.

### 2. "Report both results" made no sense in `/tdd-init`'s context

**Problem.** `commands/tdd-init.md` said "Report both results to the user," but item 7's probe runs later, inside `/tdd`'s own
preflight — not during `/tdd-init`. At the point this sentence appears, there is only one result (the version check), and a
literal reader could invent an unrequested probe during init to produce a second one.

**Before:**
> This only proves node is on the `Bash` tool's `PATH`, not on the `PATH` Claude Code spawns the hook with — the two can disagree
> under a per-shell version manager (`fnm`, `nvm`). `/tdd`'s preflight (item 7) is what actually proves the guard can start, by
> dispatching a probe subagent and observing a denial. Report both results to the user; a green version check here is not proof
> by itself.

**After:**
> This only proves node is on the `Bash` tool's `PATH`, not on the `PATH` Claude Code spawns the hook with — the two can disagree
> under a per-shell version manager (`fnm`, `nvm`). This step cannot resolve that gap by itself; only `/tdd`'s preflight item 7,
> which dispatches a probe subagent and observes a denial, proves the guard can actually start. Tell the user this check is
> necessary but not sufficient, and that the first `/tdd` run is what confirms the rest.

`skills/run-tdd-cycle/SKILL.md`'s own "Report both results to the user" (item 6, last paragraph) was left unchanged and is
correct as written: unlike `/tdd-init`, all seven preflight items — including item 7's probe — run in the same `/tdd` preflight
sequence, so by the time preflight finishes both the version-check result and the probe result genuinely are available to report
together.

### 3. Spec line 197 stated the wrong fail-direction

**Problem (coordinator's own instruction override — the spec is normally off-limits for this task, with this one line
excepted).** `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:197` read: *"an interpreter too old to run the
guard fails exactly like a missing one, and both fail open."* That is false. Verified against `hooks/guard.mjs:80-91`: `main()`
checks `runtimeSupported(process.version)` as its first statement — reachable only once the process has already started — and
calls `deny(...)`, which sets `process.exitCode = 2`. A too-old-but-*present* interpreter therefore fails **closed**, loudly,
via that exit-2 deny. Only a genuinely *missing* interpreter never reaches that check at all: the hook process never starts,
`PreToolUse` sees a non-2 exit, and the call is silently permitted — that is the only case that fails open.

This is the same claim my own prompt text in `SKILL.md` and `tdd-init.md` already stated correctly (fixed in the original round
after the first `advisor()` call flagged the identical inversion in my own draft) — the spec had the same defect, uncorrected,
which is what the coordinator's reviewer caught.

**Before:**
> 6. **Node is on `PATH` and is at least the supported LTS** — `guard.mjs` runs under it. Check the version, not merely the
> presence: an interpreter too old to run the guard fails exactly like a missing one, and both fail open.

**After:**
> 6. **Node is on `PATH` and is at least the supported LTS** — `guard.mjs` runs under it. Check the version, not merely the
> presence: an interpreter too old to run the guard denies loudly on its own — `guard.mjs` checks `process.version` before
> anything else can throw and exits 2 below the floor. Only a *missing* interpreter fails open, because the hook process never
> starts at all.

Kept to that one claim, as instructed — did not restructure the surrounding section (`## Preflight`, items 1–7) or the two
paragraphs following it (lines 199–201), which already described the version-manager divergence correctly and needed no
change. Checked the rest of the spec for the same false pairing (`grep -n "fails exactly like a missing one\|fail open" ...`):
the only other occurrence, line 133 ("A missing interpreter fails open exactly as a missing shell did"), already states the
narrower, correct claim and needed no change.

### Verification

`node --test` after all three fixes: **292 pass, 2 fail, 1 todo** — identical to every prior run in this task, and the 2
failures are the same two named Task-8 items (`config-contract.test.mjs`'s two `singleTerse` drift checks). No regression.

### Commits

- `bd5561a` — `fix(skill): resolve the node floor path via CLAUDE_PLUGIN_ROOT`
- `fe76ac9` — `fix(command): resolve the node floor path via CLAUDE_PLUGIN_ROOT`
- `0d33cad` — `fix(spec): correct which node failure actually fails open`

`git show --stat` for all three names the expected file: `skills/run-tdd-cycle/SKILL.md`,
`commands/tdd-init.md`, and `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md` respectively.

---

## Fix round 2 (coordinator reversed their own round-1 ruling)

The coordinator's round-1 instruction to resolve the floor via `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs` was itself wrong:
`${CLAUDE_PLUGIN_ROOT}` is set for the *spawned hook process*, not for the orchestrator's own `Bash` tool — confirmed
empirically by the coordinator (`CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR` both `<UNSET>` from the orchestrator's shell).
The path-based fix therefore failed exactly like the original bare relative path did: unreadable from the orchestrator,
which would trip the "unreadable floor → stop" rule I'd added in round 1, at a check meant to be trivial.

**The instruction: stop trying to resolve the file at runtime. State the floor as a literal in the prose, and add a test that
keeps that literal from drifting against `hooks/lib/rules.mjs`'s `NODE_FLOOR`.**

### 1. Prompts: runtime path → plain literal

**`skills/run-tdd-cycle/SKILL.md`, item 6 — before (round 1's fix):**
> 6. **Node is on `PATH` and is at least the floor `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs` exports as `NODE_FLOOR`** — a
> floor, not a pin; a newer major passes. `hooks/lib/rules.mjs` is inside the plugin's own directory, not the target project
> you are running against, so read it by the `${CLAUDE_PLUGIN_ROOT}`-relative path — a bare `hooks/lib/rules.mjs` resolves
> against the wrong cwd and will not exist there. Run `node --version` through the `Bash` tool and compare it against
> `NODE_FLOOR`. Missing, or below the floor → stop and tell the user to install or upgrade Node. **If `NODE_FLOOR` itself
> cannot be read, stop** — the same as a missing interpreter. Do not skip the comparison, guess a number, or treat the miss as
> a pass; an unevaluable check must not reach `allow`.

**After:**
> 6. **Node is on `PATH` and is at least v22** — the floor `hooks/lib/rules.mjs` enforces on itself as `NODE_FLOOR`. A floor,
> not a pin; a newer major passes. Run `node --version` through the `Bash` tool. Missing, or below v22 → stop and tell the
> user to install or upgrade Node.

Removed: the `${CLAUDE_PLUGIN_ROOT}` path, the wrong-cwd explanation, and the "if `NODE_FLOOR` cannot be read, stop" rule —
there is nothing left to read at runtime, so that rule no longer applies. Kept unchanged (verified by diff, not just by
memory): the "two failures are not the same shape" paragraph (fail-closed-too-old vs. fail-open-missing) and the "this proves
less than it looks like it proves — item 7 is what closes the gap" paragraph, both untouched below item 6's first sentence.

**`commands/tdd-init.md` step 1 — before (round 1's fix):**
> - Node is on `PATH` and is at least the floor `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs` exports as `NODE_FLOOR` — a
> floor, not a pin; a newer major is fine. `hooks/lib/rules.mjs` lives inside the plugin's own directory, not the project you
> are initializing, so read it by the `${CLAUDE_PLUGIN_ROOT}`-relative path — a bare `hooks/lib/rules.mjs` resolves against
> the wrong cwd and will not exist there. Check with `node --version` through the `Bash` tool and compare it against
> `NODE_FLOOR`. Missing, or below the floor → stop and tell the user to install or upgrade it. **If `NODE_FLOOR` itself
> cannot be read, stop** — the same as a missing interpreter; do not skip the comparison, guess a number, or treat the miss
> as a pass. This is a hard stop, not a degradation: with no interpreter, or too old an interpreter, there is no
> reduced-guarantee mode to fall back to — the guard cannot be trusted to run at all.

**After:**
> - Node is on `PATH` and is at least v22 — the floor `hooks/lib/rules.mjs` enforces on itself as `NODE_FLOOR`. A floor, not
> a pin; a newer major is fine. Check with `node --version` through the `Bash` tool. Missing, or below v22 → stop and tell
> the user to install or upgrade it. This is a hard stop, not a degradation: with no interpreter, or too old an interpreter,
> there is no reduced-guarantee mode to fall back to — the guard cannot be trusted to run at all.

Same removals; the "hard stop, not a degradation" sentence and the "necessary but not sufficient, `/tdd`'s preflight item 7
confirms the rest" paragraph below it (reworded in round 1 for the same reason — item 7 doesn't run during `/tdd-init`) are
both unchanged.

### 2. New drift test — `tests/config-contract.test.mjs`

Added two tests plus one helper, appended after the existing schema drift checks (same file, same pattern:
`tests/fixtures/config.json`, the spec, and `commands/tdd-init.md`'s Step 7 template already get cross-checked against each
other there for exactly this "silent second copy" reason).

`extractFloorClaim(text, lineStartRe)` finds the single line matching `lineStartRe` and pulls the number out of
`/\bis at least v(\d+)\b/` on *that line only* — not a whole-file grep. This scoping matters concretely here: both prompts'
item-6/step-1 paragraphs also mention `22.23.2` (the measured `fnm`-vs-Bash-tool patch version) a few lines below the floor
claim, in the *same* prose block a whole-file regex would scan. A whole-file `/v(\d+)/` match would find "22" there too and
could pass even if the actual floor-claim line had drifted — the identical class of bug this file's own comments warn about
for the Step 7 template's key-presence checks ("a whole-file match would pass even when the key is missing from the block a
model actually copies from").

Two new tests:
- `drift check: SKILL.md preflight item 6 states the node floor as hooks/lib/rules.mjs's NODE_FLOOR`
- `drift check: tdd-init.md prerequisites state the node floor as hooks/lib/rules.mjs's NODE_FLOOR`

Both import `NODE_FLOOR` from `../hooks/lib/rules.mjs` and assert the extracted literal equals it. The file's header comment
was updated to note this one new import (the file previously claimed to not touch `hooks/lib/rules.mjs` at all, which the
new import makes literally false — updated rather than left stale).

### 3. Bite-check

Changed `hooks/lib/rules.mjs:25` from `export const NODE_FLOOR = 22;` to `export const NODE_FLOOR = 23;`, re-ran
`node --test`, and captured the two target tests' failures verbatim:

```
not ok 92 - drift check: SKILL.md preflight item 6 states the node floor as hooks/lib/rules.mjs's NODE_FLOOR
  error: |-
    SKILL.md states the Node floor as v22, but hooks/lib/rules.mjs's NODE_FLOOR is 23 — the prompt has drifted from the source of truth
    22 !== 23
  expected: 23
  actual: 22

not ok 93 - drift check: tdd-init.md prerequisites state the node floor as hooks/lib/rules.mjs's NODE_FLOOR
  error: |-
    tdd-init.md states the Node floor as v22, but hooks/lib/rules.mjs's NODE_FLOOR is 23 — the prompt has drifted from the source of truth
    22 !== 23
  expected: 23
  actual: 22
```

Both named the exact mismatch, as required. (Bumping the floor above the machine's actual `v22.23.2` also failed a cluster of
unrelated `guard.test.mjs` tests as collateral — `runtimeSupported` now correctly rejected the running interpreter itself.
That collateral is expected and is not evidence of anything wrong with the new tests; it is the guard's own floor check doing
its job against an artificially-raised floor.) Restored `hooks/lib/rules.mjs` from the `sed`-generated `.bak` file immediately
after, confirmed via `git status --short hooks/` that the restore left zero diff in `hooks/`, and confirmed the suite
returned to its prior state.

### Verification

`node --test` after the fix: **294 pass, 2 fail, 1 todo** (up from 292 pass before this round, because the two new tests
added and now passing bring the pass count up by exactly 2; the fail count and identity are unchanged — still the same two
named Task-8 `singleTerse` items).

### Commits

- `2a7fd79` — `fix(skill): state the node floor as a literal, not a runtime path`
- `247139d` — `fix(command): state the node floor as a literal, not a runtime path`
- `aa261e7` — `test(hook): pin the node floor prompts state against NODE_FLOOR`

`git show --stat` for all three names the expected file: `skills/run-tdd-cycle/SKILL.md`, `commands/tdd-init.md`, and
`tests/config-contract.test.mjs` respectively. Working tree is clean (`git status --short` empty) after this round.
