## Task 7: `/tdd-init`

**Files:**
- Create: `commands/tdd-init.md`

**Interfaces:**
- Consumes: the config schema (Task 5's fixture is the reference shape)
- Produces: a committed `.tdd/config.json` and `.gitignore` entries. Task 8's preflight assumes both exist.

**Design notes:**

Three things this command must get right, each of which breaks something downstream if skipped:

1. **The glob partition must be exhaustive.** `git ls-files` must produce no file matching neither `test`, `source`, nor `ignore`. The read rule is a denylist, so an unclassified source file would be readable by Red and read isolation would quietly disappear. Refuse to write the config until the partition is complete.
2. **It must commit its own output.** It writes `.tdd/config.json` and edits `.gitignore`, leaving the tree dirty — and `/tdd`'s preflight refuses to start against a dirty tree. Without a self-commit, the first-time path fails on its own side effects.
3. **It must check for `jq`.** The guard parses its stdin with it and fails closed without it, which would deny every tool call mid-cycle. Better to fail loudly at setup.

- [ ] **Step 1: Write the command**

`commands/tdd-init.md`:

```markdown
---
description: Detect the project's toolchain and write .tdd/config.json for the TDD cycle
---

Set up `.tdd/config.json` for this project. Work through these steps in order
and do not skip the verification — a config that passes here is trusted by the
guard hook on every subsequent tool call.

## 1. Check prerequisites

- `jq` on PATH (`command -v jq`). Missing → stop and tell the user to install it. The guard parses its input with `jq` and fails closed without it, which would deny every tool call mid-cycle.
- The project is a git repository with at least one commit.

## 2. Detect the toolchain

| Marker | Toolchain | test | single | coverage |
|---|---|---|---|---|
| `pytest.ini`, or `pyproject.toml` mentioning pytest | pytest | `pytest -q` | `pytest -q {testId}` | `pytest -q --cov --cov-report=json:.tdd/coverage.json` |
| `package.json` with `jest` | jest | `npx jest` | `npx jest -t {testId}` | `npx jest --coverage --coverageReporters=json-summary` |
| `package.json` with `vitest` | vitest | `npx vitest run` | `npx vitest run -t {testId}` | `npx vitest run --coverage` |
| `Cargo.toml` | cargo | `cargo test` | `cargo test {testId}` | `cargo llvm-cov --json` |
| `go.mod` | go | `go test ./...` | `go test -run {testId} ./...` | `go test -cover ./...` |
| `*.csproj`, `*.sln` | dotnet | `dotnet test` | `dotnet test --filter {testId}` | `dotnet test --collect:"XPlat Code Coverage"` |

No marker matches, or several do → ask the user rather than guessing.

## 2c. Report every degradation explicitly

Each missing tool removes a mechanical check and silently replaces it with
prompt discipline. Tell the user which guarantees they are actually getting:

| Missing | Lost |
|---|---|
| `commands.coverage` | Red's three-way branch collapses to strict red; both coverage gates skipped; `crapMode` forced to `unavailable` |
| `crapMode: "unavailable"` | CRAP trigger gone; refactor falls back to `maxFunctionLines` |
| `commands.mutation` | hardening pass uses agent hand-mutation instead of a tool; slower, less systematic, still runs |

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
        "test": "...", "single": "...", "coverage": "...",
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
```

- [ ] **Step 1b: Pin the config schema with a contract test**

`/tdd-init` writes the file that `guard.sh` and the orchestrator both read.
Nothing else checks that what init produces is what they consume, and every
defect in this project so far has landed at exactly that kind of seam. A
missing key does not fail loudly — `jq` returns `null`, the guard's glob list
becomes empty, and `tdd_path_verdict` denies everything, or a threshold reads
as `null` and a gate silently stops comparing.

Create `tests/config-contract.test.sh`:

```bash
# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.
#
# Pins the .tdd/config.json schema that /tdd-init must produce and that
# guard.sh and the orchestrator consume. Update this list when the schema
# changes -- deliberately, not by discovering a null at runtime.

_cfg="$REPO_ROOT/tests/fixtures/config.json"

# Keys that must be present AND non-null.
for _k in version crapMode \
          commands.test commands.single \
          globs.test globs.source globs.ignore \
          refactorTriggers.maxCrap refactorTriggers.duplicateThreshold \
          refactorTriggers.maxFunctionLines \
          limits.greenAttempts limits.violationRetries \
          limits.mutationRounds limits.mutantsPerPass \
          coverageGates.greenMaxNewUncovered coverageGates.refactorMaxNewUncovered; do
  assert_eq "yes" "$(jq -r "if (.${_k} // null) == null then \"no\" else \"yes\" end" "$_cfg")" \
    "config has non-null ${_k}"
done

# Keys that must be PRESENT but may be null -- absence and null mean different
# things here. Null is "this toolchain has no such tool, degrade explicitly";
# absent means /tdd-init forgot to decide.
for _k in coverage complexity mutation; do
  assert_eq "true" "$(jq -r ".commands | has(\"${_k}\")" "$_cfg")" \
    "config declares commands.${_k} (null is allowed, absent is not)"
done

# The template inside commands/tdd-init.md is a SECOND copy of this schema, and
# two copies drift. It already did once: the template omitted crapMode,
# maxCrap, mutationRounds, mutantsPerPass, commands.complexity and
# commands.mutation, so an agent following it would have written a config whose
# primary refactor trigger threshold was null -- a comparison that never fires.
# Scope the haystack to the Step 7 JSON block, NOT the whole file. Seven of
# these key names also appear in surrounding prose (the detection table, the
# degradation table), so a whole-file grep passes even when the key is missing
# from the template a model actually copies from. Verified: deleting crapMode
# from the JSON block alone left the suite fully green under a whole-file
# match. That is the same defect this test exists to catch, one level up.
_init="$REPO_ROOT/commands/tdd-init.md"
_init_text=$(sed -n '/^## 7\. Write the files/,/^Append to/p' "$_init")

# Both anchors have to be checked, and they fail differently.
#
# Start anchor broken -> sed returns empty -> every assertion below fails in a
# heap, which is loud but confusing. The first assertion names the real cause.
#
# End anchor broken -> sed runs to EOF instead, silently re-widening the
# haystack toward the whole-file behaviour this scoping was added to remove.
# That one passes quietly, so it needs its own check: nothing from step 8
# onward may appear in the extracted block.
assert_contains "version" "$_init_text" "the Step 7 JSON block was located at all"
case "$_init_text" in
  *"## 8"*) _bounded=no ;;
  *)        _bounded=yes ;;
esac
assert_eq "yes" "$_bounded" "the extracted block stops before step 8 (end anchor still matches)"
# DERIVE the expected keys from the fixture instead of hand-maintaining a
# second list. The previous hardcoded list was a strict SUBSET of the keys the
# fixture-side loop requires -- commands.test, commands.single,
# commands.coverage, globs.test and globs.source were never pinned on the
# template side at all, and both loops were green throughout. Renaming
# `"coverage":` in the template left the suite fully passing, and that is the
# key whose loss cascades into all three coverage gates.
#
# Two hand-maintained lists of the same thing drift. One derived from the other
# cannot.
#
# Multiplicity matters: "test" occurs twice (commands.test and globs.test), so
# a presence check would not prove both are declared.
# Count the iterations. A derived loop that enumerates nothing -- a broken jq
# filter, an unreadable fixture -- contributes zero assertions and the suite
# stays green while the check has silently disappeared. Verified: typing
# `strnig` for `string` in this filter dropped 46 assertions and the run
# reported 122 passed, 0 failed.
_tpl_seen=0
for _k in $(jq -r 'paths | .[-1] | select(type=="string")' "$_cfg" | sort -u); do
  _want=$(jq -r --arg k "$_k" '[paths | .[-1] | select(. == $k)] | length' "$_cfg")
  _have=$(printf '%s' "$_init_text" | grep -o "\"${_k}\":" | wc -l | tr -d ' ')
  assert_eq "$_want" "$_have" "tdd-init's template declares ${_k} (${_want}x)"
  _tpl_seen=$((_tpl_seen + 1))
done
# Floor, not an exact count: the fixture currently has 23 distinct key names,
# and a floor of 19 leaves room for the schema to shrink legitimately while
# still catching collapse. Do NOT derive the expected count from the same jq
# filter the loop uses -- one broken filter would then corrupt both sides of
# the comparison identically and the check would pass.
assert_eq "yes" "$([ "$_tpl_seen" -ge 19 ] && echo yes || echo no)" \
  "the derived template loop enumerated at least 19 keys (saw ${_tpl_seen})"

# The spec holds a THIRD copy of this schema. Drift there misleads whoever
# reads the design next, which is how the template drifted in the first place.
_spec="$REPO_ROOT/docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md"
_spec_text=$(sed -n '/"version": 1,/,/^}/p' "$_spec")
assert_contains "crapMode" "$_spec_text" "the spec's schema block was located at all"
# Same end-anchor hazard the template block has: if `^}` stops matching, sed
# runs to EOF and silently sweeps in trailing prose, widening the haystack and
# corrupting the counts. Asserting the last line IS the closing brace is
# stronger than a content marker, because it does not depend on what happens to
# follow the block.
assert_eq "}" "$(printf '%s' "$_spec_text" | tail -1)" \
  "the spec's schema block ends at its closing brace (end anchor still matches)"
_spec_seen=0
for _k in $(jq -r 'paths | .[-1] | select(type=="string")' "$_cfg" | sort -u); do
  _want=$(jq -r --arg k "$_k" '[paths | .[-1] | select(. == $k)] | length' "$_cfg")
  _have=$(printf '%s' "$_spec_text" | grep -o "\"${_k}\":" | wc -l | tr -d ' ')
  assert_eq "$_want" "$_have" "the spec's schema declares ${_k} (${_want}x)"
  _spec_seen=$((_spec_seen + 1))
done
assert_eq "yes" "$([ "$_spec_seen" -ge 19 ] && echo yes || echo no)" \
  "the derived spec loop enumerated at least 19 keys (saw ${_spec_seen})"

# The three glob lists must be arrays. A bare string would word-split in the
# guard into per-character globs and match almost nothing -- denying every
# write and, worse, permitting every read.
for _k in test source ignore; do
  assert_eq "array" "$(jq -r ".globs.${_k} | type" "$_cfg")" \
    "globs.${_k} is an array"
done
```

Run `bash tests/run.sh`, then verify it bites: delete `globs.source` from the
fixture, confirm the suite fails, restore.

- [ ] **Step 2: Verify the command file is well-formed**

```bash
head -3 commands/tdd-init.md
```

Expected: opens with `---`, then a `description:` line, then `---`.

- [ ] **Step 3: Commit**

```bash
git add commands/tdd-init.md
git commit -m "feat: /tdd-init toolchain detection and config setup"
```

---

