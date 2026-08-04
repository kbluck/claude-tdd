# Task 11 report: README.md and packaging

## What the README covers

`README.md` (new, repo root) targets an installing user, not a contributor. It has these sections, in order:

1. **One-paragraph summary** of the mechanism (role-constrained subagents, a `PreToolUse` hook), with an explicit pointer
   that the spec is authoritative and the README is a summary.
2. **What this buys you** — the three roles' stop conditions, and what the hook actually inspects (`Read`, `Write`,
   `Edit`, `MultiEdit`, `NotebookEdit`, `NotebookRead`, `Bash`) and denies.
3. **What this does not buy you** — a compressed but faithful rendering of the spec's *Threat model*: the guard stops
   incidental violation only; the three named bypass channels (permitted-runner exfiltration, `observedFailure`
   residual leakage, the unconstrained orchestrator); that two of the three get detection, not prevention, and neither
   closes the channel; and the untrusted-spec warning verbatim in spirit ("running `/tdd` against an untrusted spec
   carries the same risk as running code from that spec's author"). Links directly to the spec's `#threat-model-iteration-2`
   anchor.
4. **Requirements** — Node 22+, with the two-part explanation the spec treats as load-bearing: the requirement is on
   the process that *launches* Claude Code, not the interactive shell, and a missing interpreter fails **silently**
   (non-2 exit, `PreToolUse` permits, nothing in the transcript). Also notes `/tdd-init`'s check only proves Node is on
   the orchestrating shell's `PATH`, and only `/tdd` preflight's probe subagent confirms the guard's real spawn
   environment.
5. **Install** — `/plugin marketplace add kbluck/claude-tdd` then `/plugin install claude-tdd@claude-tdd`, derived from
   the actual `git remote` and the marketplace/plugin names in the two manifests.
6. **Usage** — `/tdd-init` then `/tdd <spec-path>`, one paragraph each, pointing at the spec's `#the-cycle` section for
   the full preflight list and per-item state machine rather than reproducing it.
7. **Configuration** — describes `commands`, `globs`, `refactorTriggers`/`limits`/`coverageGates` in prose (no JSON
   block), explains *why* the read/write asymmetry makes the glob partition load-bearing, and points at the spec's
   `#configuration` section for the field-by-field schema.
8. **Degradation table** — reproduced, per the task's explicit instruction to cover it. See "Concerns" below for the
   caveat on this being a third copy.
9. **Known limitations** — four bullets (no concurrency story, monorepos architecturally excluded, "exactly one test"
   undefined for parametrized/table tests, Windows unverified), pointing at the spec's `#limitations-iteration-2`
   section for the rest.
10. **Packaging note** — the `source: "./"` finding (below).
11. **Contributing** — one line pointing at `AGENTS.md`.
12. **License** — MIT, links `LICENSE`.

### What was deliberately left out

- **The full JSON schema block.** `tests/config-contract.test.mjs` already pins two copies of it (the fixture and
  `commands/tdd-init.md`'s template) against the spec's third. A README block would be a fourth copy nothing tests,
  and the task itself warns against this exact failure mode ("a fourth copy of the schema nobody will maintain").
  Described in prose instead, with a pointer to the spec.
- **The full preflight list, the per-item state machine diagram, commit conventions, mutation-pass mechanics, CRAP
  scoring formula.** All in scope of the spec, out of scope of "what an installing user needs before deciding to
  install and run this." Linked, not restated.
- **Contributor-facing material** (test commands, the traps in `AGENTS.md`, `.tdd/config.json`'s gitignore status in
  *this* repo). One link to `AGENTS.md`; nothing duplicated.
- **`config.version`** (the `.tdd/config.json` schema's `"version": 1` field). Investigated, decided, and documented
  below — but the decision is "leave it," so there was nothing user-facing to add to the README about it.

## Plugin-format exclusion support — finding and source

**Finding: none exists.** For a relative-path plugin `source` (the `"./"` this repo uses), Claude Code's official
marketplace documentation states the `source` has no configurable fields at all ("Fields: none") and copies the
directory wholesale into `~/.claude/plugins/cache`. There is no `.claudeignore`, no `files` allowlist analogous to
npm's `package.json` `files` field, and no glob-exclude option anywhere in the marketplace or plugin manifest schema.

**Source, and how I got it:**

- Local copy of the `plugin-dev` skill's `plugin-structure/references/manifest-reference.md` (installed marketplace
  plugin at `~/.claude/plugins/marketplaces/claude-plugins-official/...`) — covers `plugin.json` only, no exclusion
  mechanism mentioned.
- `https://code.claude.com/docs/en/plugin-marketplaces.md` (official docs, fetched directly) — the authoritative
  **Plugin sources** table: for a relative-path `source`, the `Fields` column literally reads `none`. The `github`,
  `url`, `git-subdir`, and `npm` source types each have their own field lists (`ref`, `sha`, `path`, `package`,
  `version`, `registry`) — none of them an exclude/include mechanism either.
- `https://code.claude.com/docs/en/plugins-reference.md` (official docs, fetched directly), **Plugin caching and file
  resolution** section — confirms the entire referenced directory is copied to the plugin cache; the only file-level
  behavior documented is symlink handling (preserved if the target resolves inside the plugin directory, dereferenced
  if elsewhere in the marketplace, skipped if outside it entirely) — nothing that filters which files ship.

Two things I checked and ruled out as *not* being what they might look like:

- The `skills`/`commands`/`agents`/`hooks` path fields on a marketplace entry (and the "list specific subdirectories"
  pattern the docs show for a shared `skills/` folder at `source: "./"`) control what Claude Code *loads as
  functionality*, not what gets *copied to disk*. A file outside those paths still ships in the cache; it's simply not
  registered as a skill/agent/hook. This doesn't touch `docs/`, `.superpowers/`, `tests/`, `e2e/`, or `.idea/` at all.
- `claude plugin marketplace add --sparse <paths...>` is a **user-side** flag for the person adding the marketplace
  (limits their local git checkout via sparse-checkout), not something a marketplace publisher can set for their
  users. Irrelevant to what an install actually copies.

**What I did about it:** documented it in the README's *Packaging note*, named the real fix (restructure the repo so
`source` points at a subdirectory holding only the shippable files) and explicitly deferred it as out of scope for
this task — a repo layout change is a much larger and riskier edit than "add a README," and the task's brief was
explicit not to invent a mechanism that doesn't exist. This matches how the ledger's prior "fix" for this same finding
worked (documenting in `AGENTS.md`), except this time the documentation is where an installing user will actually see
it before installing, not buried in contributor notes.

## Version duplication — decision and justification

**Finding, before deciding anything:** the official docs (`plugin-marketplaces.md`, *Version resolution and release
channels*) state the precedence rule explicitly: `plugin.json`'s `version` is resolved first, the marketplace entry's
`version` second, the git SHA third — and warn "Avoid setting `version` in both `plugin.json` and the marketplace
entry. Claude Code always uses the `plugin.json` value without warning, so a stale manifest version can mask a version
you set in `marketplace.json`." That is precisely the drift risk the task asked me to address, and the platform's own
guidance already names the fix.

**Decision: delete, don't pin.** I removed `"version": "0.1.0"` from `.claude-plugin/marketplace.json`'s plugin entry
rather than adding a test that keeps two copies equal. `plugin.json.version` is now the sole source of truth. This is
a stronger fix than the "pin the two together" mechanism the task brief suggested as precedent
(`tests/config-contract.test.mjs`): a test that asserts equality still leaves two fields for a future editor to update,
and updating only one is exactly how the drift the task describes would happen again. Removing the redundant field
means there is nothing left to drift — the property holds by construction, not by a test remembering to check it.

**What still needed a test.** The justification above depends entirely on `plugin.json` continuing to declare a
non-empty `version` — if that field is ever removed, resolution falls through silently to the marketplace entry (now
absent) and then the git commit SHA, and the reasoning inverts without anything failing. So
`tests/version-contract.test.mjs` asserts three things, each addressing a specific failure shape called out in
`AGENTS.md`'s trap list:

1. `plugin.json.version` is present and a non-empty string — the load-bearing fact, not the absence check.
2. `marketplace.json`'s `plugins` array is non-empty (a loop over zero entries would silently assert nothing about
   test 3 — the "derived loop that enumerates nothing" trap).
3. No entry in that array declares a `version` key at all (checked with `hasOwnProperty` against every entry, not just
   the first).

Both JSON files are parsed **inside each test body**, not cached at module scope, matching
`config-contract.test.mjs`'s `parseSpecBlock` precedent and its stated reason: a throw during collection reports zero
failures, not a failing test.

**Bite-check performed:** re-added `"version": "0.1.0"` to the marketplace entry, ran
`node --test tests/version-contract.test.mjs`, confirmed test 3 failed with the expected message (`pass 2, fail 1`),
then restored the file from a backup and re-ran to confirm it was clean. Also confirmed `claude plugin validate .`
still passes against the edited `marketplace.json` (no schema requires `version` on a plugin entry).

Full suite moved from 304 tests / 303 pass before this task to 307 tests / 306 pass after (3 new, all passing, same 1
pre-existing `todo`), confirming the new tests actually ran rather than silently contributing nothing.

## `config.version` — decision and justification

**Finding:** confirmed by direct search — `.tdd/config.json`'s `"version": 1` field is written by `/tdd-init`
(`commands/tdd-init.md`'s Step 7 template) and never read anywhere in `hooks/guard.mjs` or `hooks/lib/rules.mjs`. The
only `version`-named symbol either file touches is `process.version` (Node's own runtime version, checked against
`NODE_FLOOR`), which is unrelated. `tests/config-contract.test.mjs` asserts the field is present and non-null in the
schema, but that's a schema-shape assertion, not evidence of any consumer.

**Decision: leave it, don't remove it, don't wire it up.** Three reasons, in order of how much each one binds:

1. **Removing it isn't available to this task.** The field is declared in the spec's own schema block
   (`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md`, the `.tdd/config.json` example under
   *Configuration*), and this task was explicitly told not to edit the spec. `config-contract.test.mjs`'s drift check
   ("every key the spec declares also appears in `tests/fixtures/config.json`" and in `tdd-init.md`'s template) would
   turn red if I dropped the field from the fixture or the template while it stayed in the spec — so partial removal
   isn't a clean option either; it would just relocate the drift the test exists to catch.
2. **Wiring it up (having the guard actually check it) is a hook-logic change, not a packaging or documentation one.**
   That's a materially larger change than this task's scope (new runtime behavior in `hooks/lib/rules.mjs`, new test
   coverage for a version-mismatch-deny path, a decision about what "unsupported schema version" should mean for a
   role that's mid-cycle) — a defensible Task 13/14 item, not something to fold into "README and packaging."
3. **It is genuinely inert, not silently dangerous.** This project's own established pattern (from `AGENTS.md`'s
   "Reads fail open; writes fail closed" framing) is to worry about fields whose *absence or mismatch* changes an
   allow/deny outcome without anyone noticing. `config.version` isn't in that class: I confirmed
   `tests/guard.test.mjs`'s existing missing-config and degenerate-config-shape tests (lines ~332-395, including the
   Task 10 "empty sandbox" case) exercise fail-closed behavior for `.tdd/config.json` being absent or malformed, and
   none of that fail-closed behavior is gated on `version` being present, correct, or even inspected — the guard's
   protection here comes entirely from the required `commands`/`globs` shape, not from a schema-version check. An
   unread `version` field creates no fail-open path; it's dead weight, not a live risk.

Because the decision is "no change, and no user-facing consequence," nothing about `config.version` appears in the
README itself — an installing user doesn't interact with `.tdd/config.json`'s internal schema version, and the README
correctly doesn't reproduce the schema at all (see above). This paragraph in this report is the record of the
decision the task asked for.

## Files changed

- `README.md` — new.
- `.claude-plugin/marketplace.json` — removed the redundant `version` field from the `claude-tdd` plugin entry.
- `tests/version-contract.test.mjs` — new. Pins `plugin.json.version` as the sole source of truth and guards against
  the duplicate field being reintroduced.

## Self-review (sceptical-user pass over the README)

Read the whole file once more specifically hunting for oversell, then grepped it for
`enforce|guarantee|prevent|ensure|block|never|isolat|sandbox|safe|secure|trust|always|completely|fully` and checked
every hit against the spec:

- **Caught and fixed:** an earlier draft's *What this buys you* section originally read "Green genuinely cannot open
  the test file it's implementing against" — a flat claim that the very next section (*What this does not buy you*)
  immediately contradicts by describing exactly how Green can obtain test content indirectly (the permitted-runner
  channel). That is precisely the internal-contradiction shape AGENTS.md warns about. Rewrote it to scope the claim to
  what's actually true: "A direct `Read` on the file a role isn't supposed to see gets blocked and logged as a rule
  violation" — accurate (the `Read` tool call is genuinely denied) without implying the broader property the design
  itself disclaims.
- **Caught and fixed:** a broken anchor link. `#threat-model` does not match the spec's actual generated heading id
  for `## Threat model *(iteration 2)*`, which is `#threat-model-iteration-2` (confirmed against the pattern already
  correctly used for the sibling `## Limitations *(iteration 2)*` → `#limitations-iteration-2`). Verified all four
  anchor links in the README (`#threat-model-iteration-2`, `#the-cycle`, `#configuration`, `#limitations-iteration-2`)
  against `grep -n "^## " docs/.../2026-07-30-tdd-subagent-workflow-design.md` after the fix.
- **Checked and kept:** "never" appears twice describing role design (Green working only from the handover report,
  never the test file) — this mirrors the spec's own Roles section wording exactly ("Never reads or writes test
  files") and is a description of the intended contract, immediately followed by the section that states what's
  actually enforced versus not. Reads the same way the spec itself is structured (design section, then threat-model
  section), not as an unqualified security claim.
- **Checked and kept:** "guarantees" (degradation table intro) and "blocking" (Node requirement, coverage table)
  both match the spec's own word choice in the same context and are correctly scoped to measurement/mechanical checks,
  not the core read-isolation claim.
- **Checked and kept:** every filesystem/file path referenced in the README (`docs/superpowers/specs/...`, `AGENTS.md`,
  `LICENSE`, `hooks/guard.mjs`) verified to exist via direct `ls`/`test -e`.
- **Checked and kept:** the *Packaging note* is stated as a finding with a named remedy explicitly deferred, not as
  "nothing can be done" (per review feedback during this task) — it names the two adjacent-but-different features
  (`skills`/`commands`/`agents` path scoping; `--sparse`) that could be mistaken for an exclude mechanism and explains
  why neither is one, so a reader who half-remembers one of those features doesn't think the finding is wrong.

## Concerns

- **The degradation table is now a third copy** of the same five rows (spec's *Configuration* section, `tdd-init.md`
  §2c, and now the README), and nothing tests agreement across all three the way `config-contract.test.mjs` pins the
  full schema. The task explicitly named "the degradation table" as something the README must cover, so I reproduced
  it rather than only linking to it — but this is worth a follow-on decision (extend `config-contract.test.mjs`'s
  drift-checking pattern to this table, or accept prose drift here as lower-stakes than schema drift). Not fixed in
  this task; flagging per the brief's own "decide and justify, don't gold-plate" instruction rather than silently
  expanding scope.
- **Commit scope deviation.** The task instructions said "any test is scope `hook`." `tests/version-contract.test.mjs`
  tests `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` exclusively — no hook code, no `.tdd/`
  config, nothing under `hooks/`. `AGENTS.md`'s scope table puts "the whole project, or the plugin config" under
  `plugin`, which is a closer match than `hook`. I used `plugin` for that commit and am recording the deviation here
  rather than silently picking one.
- **Install command is untested.** `/plugin marketplace add kbluck/claude-tdd` / `/plugin install claude-tdd@claude-tdd`
  is derived correctly from the manifest names and the actual git remote, and matches the documented `owner/repo`
  shorthand pattern, but I did not (and could not, inside this task) actually run it against a fresh Claude Code
  session to confirm the install succeeds end to end.
