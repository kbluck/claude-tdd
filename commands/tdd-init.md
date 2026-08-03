---
description: Detect the project's toolchain and write .tdd/config.json for the TDD cycle
---

Set up `.tdd/config.json` for this project. Work through these steps in order
and do not skip the verification — a config that passes here is trusted by the
guard hook on every subsequent tool call.

## 1. Check prerequisites

- Node is on `PATH` and is at least v22 — the floor `hooks/lib/rules.mjs` enforces on itself as `NODE_FLOOR`. A floor, not a pin;
  a newer major is fine. Check with `node --version` through the `Bash` tool. Missing, or below v22 → stop and tell the user to
  install or upgrade it. This is a hard stop, not a degradation: with no interpreter, or too old an interpreter, there is no
  reduced-guarantee mode to fall back to — the guard cannot be trusted to run at all.

  **The two failures are not the same shape.** A too-old-but-*present* Node does launch `guard.mjs`, which checks its own version
  first and denies loudly with exit 2 — that path is genuinely fail-closed on its own. A missing Node never launches the guard at
  all: `PreToolUse` sees a non-2 exit and silently *permits* the call — a missing interpreter fails open, exactly like a missing
  shell did. Catching both here, at setup, is what turns the open failure into a loud one.

  This only proves node is on the `Bash` tool's `PATH`, not on the `PATH` Claude Code spawns the hook with — the two can disagree
  under a per-shell version manager (`fnm`, `nvm`). This step cannot resolve that gap by itself; only `/tdd`'s preflight item 7,
  which dispatches a probe subagent and observes a denial, proves the guard can actually start. Tell the user this check is
  necessary but not sufficient, and that the first `/tdd` run is what confirms the rest.
- The project is a git repository with at least one commit.

## 2. Detect the toolchain

| Marker | Toolchain | test | single | singleTerse | coverage |
|---|---|---|---|---|---|
| `pytest.ini`, or `pyproject.toml` mentioning pytest | pytest | `pytest -q` | `pytest -q {testId}` | `pytest -q --tb=line {testId}` | `pytest -q --cov --cov-report=json:.tdd/coverage.json` |
| `package.json` with `jest` | jest | `npx jest` | `npx jest -t {testId}` | `null` | `npx jest --coverage --coverageReporters=json-summary` |
| `package.json` with `vitest` | vitest | `npx vitest run` | `npx vitest run -t {testId}` | `null` | `npx vitest run --coverage` |
| `Cargo.toml` | cargo | `cargo test` | `cargo test {testId}` | `cargo test {testId}` | `cargo llvm-cov --json` |
| `go.mod` | go | `go test ./...` | `go test ./... -run {testId}` | `go test ./... -run {testId}` | `go test -cover ./...` |
| `*.csproj`, `*.sln` | dotnet | `dotnet test` | `dotnet test --filter {testId}` | `null` | `dotnet test --collect:"XPlat Code Coverage"` |

No marker matches, or several do → ask the user rather than guessing.

**`singleTerse` notes — do not invent a flag you have not verified.** Each row above is one of three cases. Say which kind of
evidence backs the row when you present it — a documented flag and an inferred default are not the same confidence, and the user
should not read them as identical just because both landed in the same column:

- **pytest — doc-verified.** `--tb=line` is a documented traceback style that prints one line per failure instead of reproducing
  the source of the failing test function. This is the case the field exists for.
- **cargo and go — inferred, not doc-verified; say so.** These reuse the *same* command as `single`, not a distinct flag, on the
  reasoning that Rust's default test-failure output (a panic message plus `file:line`, backtrace off unless `RUST_BACKTRACE=1`) and
  Go's default non-`-v` failure output (the `t.Errorf`/`t.Fatalf` message plus `file:line`) do not reproduce the test function's
  source the way pytest's default traceback does. That is general knowledge of how the two toolchains behave, not a flag pinned to
  a doc page the way `--tb=line` is. Tell the user this explicitly: "cargo/go's default failure output is already terse — reusing
  `single` is deliberate, not a copy-paste mistake — but this wasn't verified against your specific test setup the way the pytest
  flag was; watch the first `observedFailure` this produces and flag it if it's carrying more than a failure line and location."
  Setting `singleTerse` to `null` here would trigger the degradation warning below ("carries the full traceback") for a toolchain
  where that claim is probably false, which is worse than a hedged inference.
- **jest, vitest, dotnet — verified absence.** `null`. Each has flags that reduce *some* output (`--noStackTrace` for jest,
  alternate reporters for vitest, `--verbosity` for dotnet), but none is documented to suppress the source-code frame or the
  multi-frame stack trace specifically — the part of the output this field exists to cut. Do not configure one of these
  speculatively; confirm the degradation with the user instead (see 2c).

## 2c. Report every degradation explicitly

Each missing tool removes a mechanical check and silently replaces it with
prompt discipline. Tell the user which guarantees they are actually getting:

| Missing | Lost |
|---|---|
| `commands.coverage` | Red's three-way branch collapses to strict red; both coverage gates skipped; `crapMode` forced to `unavailable` |
| `crapMode: "unavailable"` | CRAP trigger gone; refactor falls back to `maxFunctionLines` |
| `commands.mutation` | hardening pass uses agent hand-mutation instead of a tool; slower, less systematic, still runs |
| `commands.singleTerse` | `observedFailure` falls back to `commands.single` and carries the full traceback — for most tests that traceback reproduces the whole failing test function, which is handed to Green as required input despite Green being denied `Read` on the test file |

Coverage is the one worth pressing on — losing it cascades into all three
gates. Recommend installing it rather than proceeding without it.

The command must report **uncovered line counts**, not just a percentage —
`--cov-report=json`, `--coverageReporters=json-summary`, and equivalents. The
gates count uncovered lines because percentage moves with the denominator and
cannot distinguish a large tested addition from a small untested one.

## 2b. Detect complexity and mutation tooling

**Complexity**, for CRAP scores:

| Toolchain | Command | Notes |
|---|---|---|
| pytest | `radon cc -j -s src` | JSON, per-function complexity |
| jest / vitest | `npx eslint --format json --rule '{"complexity":["error",0]}' src` | complexity reported as violations |
| cargo | `cargo clippy --message-format=json` | `cognitive_complexity` lint |
| dotnet | native CRAP via Cobertura report | set `crapMode: "native"` |
| go | `gocyclo -json ./...` | |

Set `crapMode`:

- `native` if the coverage report already carries CRAP (Cobertura, PHPUnit)
- `computed` if both a complexity command and line-level coverage are available
- `unavailable` otherwise

**Run the complexity command before setting `computed`.** A command that is
configured but not installed produces no scores, and a CRAP computation over no
scores yields no triggers — indistinguishable from healthy code. If it does not
run, set `unavailable` and tell the user which tool to install.

**Mutation**, for the hardening pass: `mutmut` (Python), `Stryker` (JS/TS/C#),
`PIT` (Java), `cargo-mutants` (Rust), `go-mutesting` (Go). Set
`commands.mutation` if one is installed; `null` otherwise — the pass falls back
to agent-driven hand-mutation, which still works but is slower and less
systematic.

## 3. Propose globs

Infer `test`, `source`, and `ignore` from the layout. Typical shapes:

- `test`: `tests/**`, `**/test_*.py`, `**/*_test.go`, `**/*.test.ts`, `spec/**`
- `source`: `src/**`, `lib/**`, or the package directory at repo root
- `ignore`: `docs/**`, `*.md`, manifests, lockfiles, CI config, `.gitignore`

**`ignore` must include `.tdd/**`.** Step 8 commits `.tdd/config.json`, which
makes it a tracked file — so a partition verified in step 4 without it is
invalidated by this command's own commit, and `/tdd`'s preflight then fails on
drift immediately after a successful init. Classify the config you are about to
write, not just the files that existed before you ran.

## 4. Verify the partition is exhaustive — do not skip this

Every tracked file must match exactly one of the three lists.

    git ls-files

For each path, check it against `test`, then `source`, then `ignore`. Report
every unclassified file to the user and extend the globs until none remain.

Check the files this command is about to add, not only `git ls-files` as it
stands now — `.tdd/config.json` does not exist yet on a first run and will not
appear in that listing.

**This is a point-in-time check.** It classifies the files that exist right
now. A new top-level directory added later matches none of the three globs, and
because the read rule is a denylist, an unclassified source file is silently
readable by Red. `/tdd`'s preflight re-runs this same check on every run and
stops if drift appeared — so the guarantee is maintained there, not here. Say
so, so the user knows re-running `/tdd-init` is needed after restructuring.

**If `git ls-files` returns nothing, this check proved nothing.** An empty or
freshly-initialised repo makes the partition vacuously exhaustive, and you
would write a config whose globs have never been tested against a single real
path. Say so explicitly and ask the user to confirm the globs by hand — do not
report the partition as verified.

This matters more than it looks. Writes are checked against an allowlist, so a
bad glob merely blocks a legal write — noisy but safe. Reads are checked against
a denylist, so an unclassified source file is *readable by Red*, and read
isolation disappears with no error and no trace in any diff. The partition check
is what makes the denylist sound.

Also report any file matching **two** lists — an overlap means the same path is
both writable and forbidden depending on phase, which is almost always a
mistake in the globs.

## 5. Show the user the proposed config and get confirmation

Present every field. Let them correct anything. Do not write until they agree.

**If `commands.singleTerse` equals `commands.single`, say so explicitly.** The
committed JSON cannot carry a comment explaining why two fields hold the same
string, and a later reader who does not know the reasoning will read it as a
copy-paste mistake and "clean it up" to `null` — which is not equivalent: it
changes the meaning from "this toolchain's default output is already terse"
to "no terse form exists" and turns on the full-traceback degradation
warning. State the one-sentence reason now, while the user is looking at the
proposal, not only in this command's own prose.

## 6. Verify each command parses under the guard's Bash rule

For each configured command, the static prefix is everything before the first
`{`. Three checks, in order of severity:

1. **Refuse any command whose static prefix is empty or whitespace-only** — one
   that starts with its placeholder, or is only a placeholder. The guard would
   have nothing to match against and its allowlist would degrade to "any
   command without shell metacharacters", which is the single input that turns
   the whole Bash guard off. The guard denies this at runtime, so such a
   config would break every dispatch; catch it here where the error is
   explainable.
2. **Warn if a template has content *after* its placeholder** — e.g.
   `pytest -q {testId} --cov`. Only the static prefix constrains, and the guard
   never checks the template's trailing text again. So that text is **not
   enforced**: the agent may omit or alter `--cov` freely and the guard will not
   notice. Move flags you actually want guaranteed to *before* the placeholder,
   where they become part of the prefix the command must match.
3. **Warn if a template contains shell metacharacters.** Those are trusted in
   the template itself, but the agent will not be able to append anything
   without tripping the metacharacter ban on the delta.

Confirm each command is actually runnable as written.

## 7. Write the files

`.tdd/config.json`:

    {
      "version": 1,
      "commands": {
        "test": "...", "single": "...", "singleTerse": "...", "coverage": "...",
        "complexity": "...", "mutation": null
      },
      "crapMode": "computed",
      "globs": { "test": [...], "source": [...], "ignore": [...] },
      "refactorTriggers": { "maxCrap": 30, "duplicateThreshold": 3, "maxFunctionLines": 40 },
      "limits": {
        "greenAttempts": 3, "violationRetries": 1,
        "mutationRounds": 2, "mutantsPerPass": 20
      },
      "coverageGates": { "greenMaxNewUncovered": 2, "refactorMaxNewUncovered": 0 }
    }

**Write every key, including the ones whose value is `null`.** An omitted key is
not a smaller config, it is a broken one: `jq` returns `null`, and a `null`
threshold compares as "never exceeded". Omit `refactorTriggers.maxCrap` and the
primary refactor trigger silently never fires; omit `limits.mutantsPerPass` and
the mutation pass has no bound. A `null` value means "this project has no such
tool, degrade explicitly"; an absent key means nobody decided.

Append to `.gitignore` if not already present:

    .tdd/checklist.json
    .tdd/coverage.json

## 8. Commit

    git add .tdd/config.json .gitignore
    git commit -m "chore: configure TDD subagent workflow"

Commit is mandatory, not optional. `/tdd`'s preflight refuses to start against
a dirty tree, so leaving these files uncommitted makes the very next command
fail on this command's side effects.

## 9. Confirm

Tell the user the config is written and committed, and that `/tdd <spec-path>`
is ready to run.
