# Task 8 report: truncate `observedFailure`

## Summary

`commands.singleTerse` was declared in the spec's schema block (iteration 2) and nowhere else, which is exactly the drift
`tests/config-contract.test.mjs` was extended, ahead of this task, to detect and could not close on its own (its other loops derive
expected keys *from the fixture*, so a spec-only key is structurally invisible to them). This task reconciled all three schema
copies, filled in `singleTerse` for every toolchain row where a verified terse form exists, made `publicApi`/`intent`/`expected` the
documented primary contract in both `tdd-red.md` and `tdd-green.md`, and had Red actually use the terse command to produce
`observedFailure` instead of the plain single-test command.

## Files changed

- `agents/tdd-red.md` — the actual fix. Red now runs `commands.singleTerse` (falling back to `commands.single`) as its one test
  execution, and the "Your input"/procedure/report sections were rewritten so `publicApi`/`intent`/`expected` are explicitly the
  primary contract and `observedFailure` a secondary, residual signal.
- `agents/tdd-green.md` — updated the `observedFailure` field description (was "verbatim runner output", now describes the terse
  form and the null-degradation case) and added a short paragraph naming `publicApi`/`intent`/`expected` as the specification, so
  Green isn't reading a stale contract that implies it should be getting more.
- `commands/tdd-init.md` — added a `singleTerse` column to the toolchain detection table (Step 2), a notes block explaining each
  row's reasoning, a degradation row in the Step 2c table, and the key in the Step 7 JSON template.
- `tests/fixtures/config.json`, `tests/fixtures/config-mutation.json` — added `"singleTerse": "pytest -q --tb=line {testId}"`.
- `tests/guard.test.mjs` — added one assertion pinning that Red's dispatch of the terse command is actually permitted by the guard
  at runtime (see "Why no `hooks/guard.mjs` change" below).

No change to `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md`, `skills/run-tdd-cycle/SKILL.md`, or
`hooks/guard.mjs` / `hooks/lib/rules.mjs` — reasoning for each below.

## Which schema copies got the key, and why

| Copy | Got `singleTerse`? | Why |
|---|---|---|
| Spec's schema block | Already had it (iteration 2) — this was the one deliberately-correct copy the task exists to reconcile the others against | — |
| `tests/fixtures/config.json` | Yes | Named directly in the task brief; `config-contract.test.mjs` derives its "every fixture key must be declared elsewhere" checks from this file, so it is the source of truth the other two copies are checked against |
| `commands/tdd-init.md` Step 7 template | Yes | Named directly in the task brief; this is what `/tdd-init` actually writes into a target project's `.tdd/config.json` |
| `tests/fixtures/config-mutation.json` | Yes | Not named in the brief or the "Done when" criterion, and no test currently reads `commands.singleTerse` from it (`tdd-mutate`'s `BASH_COMMAND_KEYS` is `['test', 'mutation']`, not `['single', 'singleTerse']`). Added anyway: this fixture exists (Task 2) specifically so the mutation Bash branch isn't structurally dead in every other test, and it is otherwise a byte-for-byte copy of `config.json`'s schema except for `commands.mutation`. Letting it diverge on this one key would make it a fifth silently-drifting copy of the schema — the exact class of defect this task is closing two instances of. The cost of adding it is one line; the cost of not adding it is a config-mutation.json that looks stale the next time someone reads it next to config.json. |

## Toolchain rows: filled vs. null, and why

Filled with a **verified, distinct** flag:
- **pytest** — `pytest -q --tb=line {testId}`. `--tb=line` is pytest's documented "one line per failure" traceback style; this is
  the case the field was designed around, and it's the spec's own worked example.

Filled with the **same command as `single`** (not a distinct flag — a fact about default behavior):
- **cargo** — `cargo test {testId}`. Rust's default test-failure output is the panic message plus `file:line`; it never reproduces
  the test function's source the way pytest's default traceback does, and backtraces are off unless `RUST_BACKTRACE=1` is set in
  the environment. There is nothing to truncate that isn't already truncated.
- **go** — `go test ./... -run {testId}`. Same reasoning: non-`-v` failure output is the `t.Errorf`/`t.Fatalf` message plus
  `file:line`, no source reproduction.
- I considered leaving these `null` instead (no *distinct* flag exists), but rejected it: `null` triggers the Step 2c degradation
  warning ("carries the full traceback... hands Green the test body"), which is factually false for these two toolchains. A false
  degradation warning is worse than a value that looks redundant, so I documented the reasoning directly in the table (Step 2's
  notes block) rather than leaving it only in this report — "fixing the document about the artifact is not fixing the artifact"
  cuts the other way too: an artifact that looks unmotivated to the next reader invites a "just null it out" cleanup that
  reintroduces the false-degradation problem.

Left **`null`**, with the degradation reported:
- **jest** — the only candidate I found was `--noStackTrace`, documented only as "Disables stack trace in test results output."
  I could not verify from Jest's own docs (fetched directly) whether that also suppresses the source code-frame snippet Jest prints
  around a failing assertion, which is the actual thing this field exists to suppress. Not confident enough to ship.
- **vitest** — the `minimal` reporter is documented to suppress console logs and the summary section, not specifically the source
  code frame. No reporter's docs mention code-frame suppression by name.
- **dotnet** — `--verbosity minimal` is already the default, and I found no flag that trims xUnit/NUnit/MSTest's default failure
  output (which includes a multi-frame stack trace through test-framework internals) down to a single line. `--verbosity quiet`
  would suppress per-test failure detail entirely, which breaks Red's ability to report *any* `observedFailure`, so it isn't a
  substitute.

I did not invent a flag for any of these three. Per the task's instruction ("if unsure, use null and say so"), I searched official
docs (WebSearch + WebFetch against `jestjs.io/docs/cli` and `vitest.dev/guide/reporters`) rather than reasoning from memory, and
both fetches came back explicitly unable to confirm code-frame suppression.

## Why no `hooks/guard.mjs` / `hooks/lib/rules.mjs` change

I initially expected Red's Bash allowlist (`BASH_COMMAND_KEYS['tdd-red'] = ['single', 'coverage']`) would need a `singleTerse`
entry, since Red now runs a command that isn't literally `commands.single`. It doesn't, and I verified this empirically rather than
trusting the reasoning (per this repo's own "verification instruments lie" trap):

`bashVerdict` only checks that the actual command **starts with** the configured template's static prefix (everything before the
first `{`). `commands.single`'s prefix is `pytest -q`; `pytest -q --tb=line tests/test_a.py::test_x` starts with that prefix, and
its delta (` --tb=line tests/test_a.py::test_x`) contains no banned metacharacters and no `..`. So the existing `single` allowlist
entry already permits the terse command structurally, with zero guard changes. I confirmed this by spawning
`node hooks/guard.mjs` directly against a `tdd-red` Bash payload for the terse command before writing anything, then pinned it as a
permanent assertion in `tests/guard.test.mjs` (see below) so a future narrowing of the prefix-match contract would fail loudly here
instead of leaving Red's terse dispatch silently dead.

## Bite-check

Removed `"singleTerse": "..."` from the Step 7 JSON template only (leaving the Step 2 table, the 2c degradation row, and the
fixtures untouched), reran `node --test tests/config-contract.test.mjs`:

```
not ok 44 - tdd-init.md's template declares singleTerse (1x)
not ok 79 - drift check: every key the spec declares also appears in the tdd-init.md Step 7 template
```

Exactly those two failed — nothing else. Restored the file and reran: 81/81 pass.

## Before / after

**Before** (`node --test tests/*.test.mjs`, on the branch before this task's changes):
```
# tests 297
# pass 294
# fail 2
# todo 1
```
Failing identities:
- `drift check: every key the spec declares also appears in tests/fixtures/config.json`
- `drift check: every key the spec declares also appears in the tdd-init.md Step 7 template`

**After**:
```
# tests 300
# pass 299
# fail 0
# todo 1
```
The count moved from 297 to 300 (+3): +2 auto-generated by the fixture-derived loops now that `singleTerse` is a fixture key
(`tdd-init.md's template declares singleTerse (1x)`, `spec's schema declares singleTerse (1x)`), +1 the guard assertion I added by
hand. Both previously-failing tests now pass; nothing else changed identity. `npm test` (the project's actual `test` script)
confirms the same 300/299/0/1.

## Self-review findings

- Re-read the diff against the pre-task HEAD (`git diff 1701615..HEAD`) rather than trusting my own edit history — confirmed no
  stray duplicate paragraph was left behind in `tdd-red.md`'s `publicApi` section when I replaced the single closing paragraph with
  the three-field bullet list.
- Confirmed the Step 7 scan range (`## 7. Write the files` through `Append to`) does not contain a second `"singleTerse":`
  occurrence in prose — the advisor flagged this as a specific risk (the "Write every key" paragraph sits inside that range), so I
  deliberately kept the toolchain-table reasoning in Step 2 and the degradation row in 2c, both outside the scanned range, and
  referred to the key elsewhere only as `commands.singleTerse` (no trailing colon/quotes).
- Confirmed `SKILL.md` needs no change: "Dispatch `tdd-red` with... the configured commands" (line 250) already covers
  `singleTerse` generically, and the orchestrator's own re-verification (line 294, "run the configured single-test command against
  `testId` yourself") correctly still means `commands.single`, not the terse form — the orchestrator isn't read-constrained and
  gets no benefit from the terse variant.
- Confirmed the spec was read, not edited, per the brief's explicit instruction.
- Ran `npm test` (not just `node --test tests/*.test.mjs`) to match the project's actual CI entrypoint exactly.

## Concerns

- The `jest`/`vitest`/`dotnet` degradation is real and will show up for any user on those toolchains: `/tdd-init` will report it per
  the new 2c row, but until someone verifies an actual code-frame-suppressing flag for one of them, Green on those projects will
  keep receiving a full multi-frame traceback (though not, notably, pytest's specific "whole function body" failure mode — none of
  these three frameworks reproduce the entire test function's source the way pytest's default does, so the residual leak there is
  bounded differently, not identically, to the pytest case this task was written against). Flagging this in case a future task
  wants to research it further rather than treating today's `null` as final.
- `cargo`/`go` reusing the `single` command for `singleTerse` is a judgment call, not a table lookup — I'm confident in the
  reasoning (verified general knowledge of both toolchains' default panic/failure-message format, not a flag I looked up), but
  unlike the pytest row it isn't something I could point at a single doc page and confirm mechanically. Worth a second look if
  someone with a real Rust or Go project runs `/tdd-init` and the proposed values look wrong in practice.

## Fix round 1

External review returned "Approved" with two Important findings, both instances of this repository's signature defect — a document
asserting more confidence than the evidence behind it — plus one minor finding folded into the same round.

### Finding 1: cargo/go rows read with pytest's confidence but had none

`commands/tdd-init.md`'s notes block stated the cargo/go inference in the same flat register as pytest's doc-verified `--tb=line`
row, with no signal to the next reader (or to `/tdd-init`'s own user) that one is a citation and the other is general knowledge of
toolchain defaults never checked against a doc page. Fixed by restructuring the notes block into three explicitly labeled evidence
tiers — **doc-verified** (pytest), **inferred, not doc-verified** (cargo/go), **verified absence** (jest/vitest/dotnet) — and adding
an instruction for `/tdd-init` to say the hedge out loud to the user: reuse the `single` command, but flag that it wasn't checked
against their specific setup the way `--tb=line` was, and to watch the first `observedFailure` it produces.

Per the coordinator's explicit instruction, I did not attempt to actually verify cargo/go's default failure format against a real
project or a doc page in this round — the fix is disclosure, not verification.

### Finding 2: `singleTerse === single` had no rationale that travels with the artifact

Once `/tdd-init` writes `.tdd/config.json`, a cargo/go project's committed config shows two identical command strings with the
reasoning living only in `commands/tdd-init.md`'s prose — nothing forces a later reader of the config itself to consult it, and an
unmotivated-looking duplicate invites a "clean it up to null" edit that silently changes the meaning (from "already terse by
default" to "no terse form exists," which also turns on the full-traceback degradation warning). Since JSON carries no comments,
the fix has to live in what the user reads at the moment of confirmation, not in the file: added a paragraph to Step 5 ("Show the
user the proposed config and get confirmation") instructing `/tdd-init` to state the one-sentence reason for the duplication right
there, before the user approves and it gets written.

### Finding 3 (minor): `commands.singleTerse` was missing from the presence-required loop

`tests/config-contract.test.mjs`'s `REQUIRED_PRESENT`-style loop (declares `commands.coverage`/`complexity`/`mutation` must be
present even when null) did not include `singleTerse`, which now carries identical "null has a defined meaning, absence means
nobody decided" semantics. Added `'singleTerse'` to that loop's key list.

### Bite-check (finding 3)

Removed `commands.singleTerse` from `tests/fixtures/config.json` entirely (not just set to null) and reran
`node --test tests/config-contract.test.mjs`:

```
not ok 20 - config fixture declares commands.singleTerse (null is allowed, absent is not)
not ok 77 - drift check: every key the spec declares also appears in tests/fixtures/config.json
```

Both failures are correct and expected together: deleting the key from the fixture entirely trips the new presence assertion
directly, and it also breaks the pre-existing spec-to-fixture drift check from the original round (the spec still declares the key;
the fixture no longer does), since that check does not distinguish "missing" from "null" — it only checks presence. This is two
independent, correctly-firing assertions catching the same single deletion from two different angles, not scope creep in the
bite-check. Restored the file (`git diff` confirmed byte-identical afterward) and reran: 82/82 pass.

### Before / after (fix round 1)

**Before this round:** 300 tests, 299 pass, 0 fail, 1 todo.

**After:** 301 tests, 300 pass, 0 fail, 1 todo. The one new test is `config fixture declares commands.singleTerse (null is allowed,
absent is not)`, generated by adding `'singleTerse'` to the existing loop; it passes because the fixture already declares the key
(added in the original round). No previously-passing test changed identity or outcome.

`npm test` confirms the same 301/300/0/1.

### Files changed (fix round 1)

- `commands/tdd-init.md` — evidence-tiered notes block; Step 5 disclosure paragraph.
- `tests/config-contract.test.mjs` — added `'singleTerse'` to the presence-required key loop.

### Commits (fix round 1)

- `fix(command): mark cargo/go singleTerse rows as inferred, not verified`
- `test(hook): require commands.singleTerse be declared, null or not`

### Concerns (fix round 1)

None new. The jest/vitest/dotnet `null` degradation and the cargo/go inference-not-citation status remain open exactly as
described above — this round changed how confidently they're presented, not what was verified.
