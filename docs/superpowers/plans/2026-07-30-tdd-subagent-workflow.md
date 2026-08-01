# TDD Subagent Workflow Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that drives a specification to implementation through Red/Green/Refactor subagents, where no single agent writes both a test and the code that satisfies it.

**Architecture:** The main conversation thread orchestrates, dispatching three role-constrained subagents. Role boundaries are enforced twice: a `PreToolUse` hook denies out-of-scope reads and writes in flight, and a post-dispatch `git diff` audit backstops the writes. All role state lives in `.tdd/` in the target project; the plugin itself is stateless.

**Tech Stack:** Bash 3.2+ (macOS default), `jq`, `git`, Markdown. No language runtime, no package manager, no test framework dependency.

**Spec:** `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md`

## Global Constraints

- Plugin name is `claude-tdd`, kebab-case, in `.claude-plugin/plugin.json`.
- Component directories (`agents/`, `commands/`, `skills/`, `hooks/`) live at plugin root, **not** inside `.claude-plugin/`.
- All in-plugin path references use `${CLAUDE_PLUGIN_ROOT}`.
- `hooks/hooks.json` uses the plugin wrapper format: `{"hooks": {"PreToolUse": [...]}}`. The settings format (events at top level) is wrong here.
- Hook denial is JSON on **stderr** plus **exit 2**: `{"hookSpecificOutput": {"permissionDecision": "deny"}, "systemMessage": "<reason>"}`. Exit 0 permits.
- **The hook fails closed.** Missing `jq`, unreadable config, unknown phase → deny.
- Target Bash 3.2 — no associative arrays, no `${var,,}`, no `mapfile`.
- Every shell script starts `#!/usr/bin/env bash`. Use `set -euo pipefail` **except** in `hooks/guard.sh` and `tests/run.sh`, which use `set -uo pipefail` — both branch on non-zero exits as normal control flow, and `-e` would abort them mid-decision. `hooks/lib/rules.sh` is sourced and sets nothing.
- Config schema is fixed by the spec. Do not add fields not listed there.
- Commit after every task.

---

## File Structure

| Path | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | manifest: name, version, description, author, license |
| `.claude-plugin/marketplace.json` | single-plugin marketplace for distribution |
| `hooks/lib/rules.sh` | **pure** decision functions; no I/O, no globals. Sourced by guard and tests. |
| `hooks/guard.sh` | I/O shell: read stdin JSON, map `agent_type` to a role, call rules, emit decision |
| `hooks/hooks.json` | registers `guard.sh` on `PreToolUse` for `Read\|Write\|Edit\|Bash` |
| `agents/tdd-red.md` | Red role definition + handover schema |
| `agents/tdd-green.md` | Green role definition |
| `agents/tdd-refactor.md` | Refactor role definition |
| `agents/tdd-mutate.md` | Mutation probe role; separate `agent_type` gives it a separate allowlist |
| `commands/tdd-init.md` | detect toolchain, verify partition, write + commit config |
| `commands/tdd.md` | thin entry point invoking the orchestrator skill |
| `skills/run-tdd-cycle/SKILL.md` | preflight, decompose, per-item loop, audit, triggers |
| `tests/run.sh` | zero-dep harness + runner |
| `tests/rules.test.sh` | unit tests for `rules.sh` |
| `tests/guard.test.sh` | integration tests piping JSON fixtures into `guard.sh` |
| `tests/agents.test.sh` | pins each agent's `name:` to the guard's dispatch table |
| `tests/config-contract.test.sh` | pins the `.tdd/config.json` schema init writes and the guard reads |
| `tests/fixtures/` | project skeletons and hook input JSON |

**Why `rules.sh` is split from `guard.sh`:** the decision logic is the part with real edge cases (glob semantics, delta extraction, phase matrix). Pure functions taking strings and echoing verdicts are directly unit-testable without spawning a process or building JSON. `guard.sh` then holds only the parts that are hard to test and boring to get right.

---

## Task 1: Spike the hook's behavior inside subagents

**This task must run in the main session, not a subagent** — it requires dispatching a subagent, and subagents cannot dispatch subagents.

Everything downstream assumes plugin `PreToolUse` hooks fire for tool calls made *inside* a subagent. If they do not, the hook half of the design is inert, read isolation has no enforcement mechanism, and the `git diff` audit cannot cover for it — reads leave no trace in a diff. Do not build anything else until this is answered.

**Files:**
- Create: `/tmp/tdd-spike/spike-plugin/.claude-plugin/plugin.json`
- Create: `/tmp/tdd-spike/spike-plugin/hooks/hooks.json`
- Create: `/tmp/tdd-spike/spike-plugin/hooks/probe.sh`
- Create: `docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`

**Interfaces:**
- Consumes: nothing
- Produces: a documented yes/no on both questions. Task 5 depends on Q1 being yes.

- [ ] **Step 1: Build a stub plugin that logs every PreToolUse call**

It must be a real plugin loaded via `hooks/hooks.json` and `${CLAUDE_PLUGIN_ROOT}`. A hook registered in `.claude/settings.json` loads by a different path and format, so proving that one fires would not prove this one does.

`/tmp/tdd-spike/spike-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "tdd-spike",
  "version": "0.0.1",
  "description": "Throwaway probe: does PreToolUse fire inside subagents?"
}
```

`/tmp/tdd-spike/spike-plugin/hooks/hooks.json`:

```json
{
  "description": "Probe hook",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Bash",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/probe.sh" }
        ]
      }
    ]
  }
}
```

`/tmp/tdd-spike/spike-plugin/hooks/probe.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail
input=$(cat)
{
  printf '=== %s\n' "$(date +%T)"
  printf '%s\n' "$input"
} >> /tmp/tdd-spike/probe.log

# Deny any Read of a path containing "FORBIDDEN" so we can also observe
# what a denial looks like from inside a subagent.
path=$(printf '%s' "$input" | jq -r --arg k "$path_key" '.tool_input[$k] // empty')
if [ "${path}" != "${path/FORBIDDEN/}" ]; then
  printf '%s\n' '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"probe: FORBIDDEN path"}' >&2
  exit 2
fi
exit 0
```

```bash
chmod +x /tmp/tdd-spike/spike-plugin/hooks/probe.sh
```

- [ ] **Step 2: Install the stub plugin and restart the session**

Add it as a local marketplace, install, then restart Claude Code so hooks load. Confirm it is active before proceeding — a silent load failure would produce the same empty log as "hooks don't fire in subagents", and you would draw the wrong conclusion.

```bash
rm -f /tmp/tdd-spike/probe.log
```

- [ ] **Step 3: Establish the control — confirm the hook fires in the main thread**

From the main thread, `Read` any file. Then:

```bash
wc -l /tmp/tdd-spike/probe.log
```

Expected: non-zero. If zero, the plugin is not loaded and the spike is invalid — fix installation before continuing. Do not proceed to Step 4 on an empty log.

- [ ] **Step 4: Answer Q1 — does the hook fire inside a subagent?**

```bash
: > /tmp/tdd-spike/probe.log
```

Dispatch a subagent with this exact instruction:

> Read the file `/tmp/tdd-spike/spike-plugin/hooks/probe.sh` and report its first line. Then attempt to read `/tmp/tdd-spike/FORBIDDEN-probe.txt` and report verbatim what happened, including any error text. Do not create the file. Do not retry more than once.

Then:

```bash
cat /tmp/tdd-spike/probe.log
```

Expected if hooks fire: two entries, one per Read.

- [ ] **Step 5: Answer Q2 — is a denial correctable or fatal?**

From the subagent's report in Step 4, record which happened:
- **Correctable** — the subagent received the denial as a tool error containing `probe: FORBIDDEN path`, and kept going.
- **Fatal** — the subagent aborted, or the denial surfaced as an opaque failure with no usable message.

This decides whether "deny and let the agent self-correct" is real, or whether every denial costs a full re-dispatch. Task 6 wording depends on it.

- [ ] **Step 6: Write up findings and commit**

Create `docs/superpowers/spikes/2026-07-30-hook-in-subagent.md` recording: Q1 answer, Q2 answer, the Claude Code version (`claude --version`), the verbatim denial text the subagent saw, and one sample log entry. Note whether the payload contained anything identifying the subagent — the spec assumes it does not, and a surprise here would simplify the design by removing the phase-marker file.

```bash
git add docs/superpowers/spikes/2026-07-30-hook-in-subagent.md
git commit -m "spike: determine whether plugin PreToolUse hooks fire inside subagents"
```

- [ ] **Step 7: Uninstall the stub plugin**

Leaving a deny-hook installed will interfere with every later task.

**DECISION GATE.** If Q1 is **no**, stop and return to the user. Do not proceed to Task 2. The spec's enforcement half needs redesign, not patching — the realistic fallback is to drop read isolation as a *mechanical* guarantee, demote it to agent-prompt discipline, and lean entirely on the `git diff` audit for writes. That is a materially weaker product and the user must decide whether it is still worth building.

---

## Task 2: Plugin skeleton, manifest, and test harness

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `tests/run.sh`
- Create: `tests/smoke.test.sh`

**Interfaces:**
- Consumes: nothing
- Produces: `assert_eq <expected> <actual> <name>` and `assert_contains <needle> <haystack> <name>`, available to every later `*.test.sh`. Test files are **sourced**, not executed, so they share the harness's `PASS`/`FAIL` counters and must not call `exit`.

- [ ] **Step 1: Write the failing test**

`tests/smoke.test.sh`:

```bash
# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.

assert_eq "hello" "$(printf 'hello')" "harness compares equal strings"
assert_contains "ell" "hello" "harness finds a substring"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `bash: tests/run.sh: No such file or directory`

- [ ] **Step 3: Write the harness**

`tests/run.sh`:

```bash
#!/usr/bin/env bash
# Zero-dependency test harness. Sources every *.test.sh in this directory.
set -uo pipefail

PASS=0
FAIL=0

assert_eq() { # expected actual name
  if [ "$1" = "$2" ]; then
    printf '  PASS: %s\n' "$3"; PASS=$((PASS + 1))
  else
    printf '  FAIL: %s\n    expected: %s\n    actual:   %s\n' "$3" "$1" "$2"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() { # needle haystack name
  case "$2" in
    *"$1"*) printf '  PASS: %s\n' "$3"; PASS=$((PASS + 1)) ;;
    *) printf '  FAIL: %s\n    expected to contain: %s\n    actual: %s\n' "$3" "$1" "$2"
       FAIL=$((FAIL + 1)) ;;
  esac
}

TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
export REPO_ROOT="$(cd "$TESTS_DIR/.." && pwd)"

FILES=0
for t in "$TESTS_DIR"/*.test.sh; do
  [ -e "$t" ] || continue
  printf '\n--- %s ---\n' "$(basename "$t")"
  FILES=$((FILES + 1))
  _before=$((PASS + FAIL))
  # shellcheck disable=SC1090
  . "$t"
  # A file that records NO assertions did not run: it failed to parse, or every
  # loop in it iterated zero times. Without this the harness reports
  # "N passed, 0 failed" for a suite that silently shrank -- which has already
  # happened here, when a one-character typo in a jq filter removed 46
  # assertions and the run stayed green.
  #
  # Note the limit: this catches a file that produces nothing, not one that
  # dies partway. A syntax error before the first assertion is caught; the same
  # error after assertion 3 leaves those 3 recorded, the guard sees movement,
  # and the assertions that never ran are still invisible. Using `. "$t"`'s exit
  # status instead would over-fire, since `.` returns whatever the file's last
  # command returned.
  if [ "$((PASS + FAIL))" -eq "$_before" ]; then
    printf '  FAIL: %s contributed no assertions\n' "$(basename "$t")"
    FAIL=$((FAIL + 1))
  fi
done

if [ "$FILES" -eq 0 ]; then
  printf '  FAIL: no test files matched %s/*.test.sh\n' "$TESTS_DIR"
  FAIL=$((FAIL + 1))
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
```

```bash
chmod +x tests/run.sh
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash tests/run.sh`
Expected: `2 passed, 0 failed`, exit 0.

- [ ] **Step 5: Write the manifests**

`.claude-plugin/plugin.json`:

```json
{
  "name": "claude-tdd",
  "version": "0.1.0",
  "description": "Red-Green-Refactor TDD via role-constrained subagents that never write both a test and the code that satisfies it",
  "author": { "name": "kbluck", "email": "kevin.bluck@gmail.com" },
  "license": "MIT",
  "keywords": ["tdd", "testing", "subagents", "red-green-refactor"]
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-tdd",
  "description": "TDD subagent workflow",
  "owner": { "name": "kbluck", "email": "kevin.bluck@gmail.com" },
  "plugins": [
    {
      "name": "claude-tdd",
      "description": "Red-Green-Refactor TDD via role-constrained subagents",
      "version": "0.1.0",
      "source": "./"
    }
  ]
}
```

- [ ] **Step 6: Verify both manifests are valid JSON**

Run: `jq empty .claude-plugin/plugin.json && jq empty .claude-plugin/marketplace.json && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add .claude-plugin tests
git commit -m "feat: plugin manifest and zero-dependency test harness"
```

---

## Task 3: Path decision rules

The phase × mode × path matrix. Pure functions, no I/O.

**Files:**
- Create: `hooks/lib/rules.sh`
- Create: `tests/rules.test.sh`

**Interfaces:**
- Consumes: `assert_eq`, `assert_contains` (Task 2)
- Produces:
  - `tdd_glob_match <pattern> <path>` → exit 0 on match, 1 otherwise
  - `tdd_matches_any <path> <glob-string>` → exit 0 if any glob in the space-separated string matches
  - `tdd_path_verdict <role> <mode> <path> <test_globs> <source_globs>` → echoes `allow` or `deny: <reason>`. Glob arguments are **space-separated strings**, not arrays — Bash 3.2 has no associative arrays and passing arrays through function boundaries is not worth the complexity here.

**Design notes the implementer needs:**

*Glob semantics.* Inside `[[ ]]`, an unquoted pattern's `*` matches `/` as well as any other character — unlike shell filename globbing. So `tests/*` already matches `tests/a/b.py`. Config files write `tests/**` for readability; normalize `**` to `*` before matching. Write the substitution as `${1//\*\*/*}` — in `${var//pattern/replacement}` the replacement half is *not* a pattern, so writing `\*` there can leave a literal backslash on some Bash versions.

*Why writes are an allowlist and reads a denylist.* A write must match the role's permitted globs. A read must merely not match the forbidden ones, because agents legitimately read `README.md`, `pyproject.toml`, and type stubs, and an allowlist would fight them constantly. This is only sound because `/tdd-init` (Task 7) proves the test/source/ignore globs partition every tracked file — otherwise an unclassified source file would be readable by Red.

*Splitting the glob string is the one dangerous operation in this file, and it is confined to `tdd_matches_any`.* An unquoted `$globs` in bash undergoes word splitting **and pathname expansion**. Pathname expansion is the hazard: `src/**` would be replaced by whatever files happen to exist on disk, so `tdd_path_verdict red read src/pkg/module.py` returns `allow` when run from a directory containing `src/`, and `deny` when run from anywhere else. Same arguments, different answer, and the wrong answer is the permissive one — a silent fail-open on exactly the read isolation nothing else can enforce.

So `tdd_matches_any` takes the glob **string** (quoted at every call site) and does the splitting internally with `set -f` in force, saving and restoring the caller's flag. Callers cannot reintroduce the bug by forgetting to quote, because quoting is now correct everywhere.

`tdd_glob_match` needs no such guard: inside `[[ ]]`, bash does not perform pathname expansion on the right-hand pattern.

*Every parameter defaults to empty, and an empty governing glob list denies.* `tests/run.sh` sources this file under `set -u`, where an unset positional would abort the script rather than return a verdict — and an aborted guard exits non-zero-but-not-2, which Claude Code treats as a non-blocking error, letting the tool call proceed. A caller bug must degrade to `deny`, never to a crash that permits.

*The matrix:*

| phase | mode | rule |
|---|---|---|
| `red` | `write` | allow iff matches test globs |
| `red` | `read` | deny iff matches source globs |
| `green` | `write` | allow iff matches source globs |
| `green` | `read` | deny iff matches test globs |
| `refactor` | `write` | allow iff matches source globs |
| `refactor` | `read` | deny iff matches test globs |
| `mutation` | `write` | allow iff matches source globs |
| `mutation` | `read` | deny iff matches test globs |
| anything else | any | deny — fail closed |

`mutation` (agent `tdd-mutate`) shares Refactor's path rules. Its distinguishing
rule — every write must be reverted before handover — is a *temporal* property
the guard cannot see from a single tool call. The orchestrator enforces it with a
diff check after the dispatch returns.

Role names here are the guard's internal vocabulary; `guard.sh` maps
`agent_type` (`tdd-red`, `tdd-green`, `tdd-refactor`, `tdd-mutate`) onto them.

- [ ] **Step 1: Write the failing tests**

`tests/rules.test.sh`:

```bash
# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.
# shellcheck disable=SC1091
. "$REPO_ROOT/hooks/lib/rules.sh"

TG="tests/** **/test_*.py"
SG="src/**"

# --- glob matching ---
tdd_glob_match "tests/**" "tests/a/b.py" && r=yes || r=no
assert_eq "yes" "$r" "** normalizes and matches across directories"

tdd_glob_match "src/**" "tests/a.py" && r=yes || r=no
assert_eq "no" "$r" "non-matching glob returns 1"

tdd_glob_match "**/test_*.py" "pkg/sub/test_thing.py" && r=yes || r=no
assert_eq "yes" "$r" "leading ** matches nested path"

# --- red ---
assert_eq "allow" "$(tdd_path_verdict red write tests/test_a.py "$TG" "$SG")" \
  "red may write a test file"
assert_contains "deny" "$(tdd_path_verdict red write src/a.py "$TG" "$SG")" \
  "red may not write source"
assert_contains "deny" "$(tdd_path_verdict red read src/a.py "$TG" "$SG")" \
  "red may not read source"
assert_eq "allow" "$(tdd_path_verdict red read README.md "$TG" "$SG")" \
  "red may read an unclassified file"
assert_eq "allow" "$(tdd_path_verdict red read tests/test_a.py "$TG" "$SG")" \
  "red may read its own tests"

# --- green ---
assert_eq "allow" "$(tdd_path_verdict green write src/a.py "$TG" "$SG")" \
  "green may write source"
assert_contains "deny" "$(tdd_path_verdict green write tests/test_a.py "$TG" "$SG")" \
  "green may not write tests"
assert_contains "deny" "$(tdd_path_verdict green read tests/test_a.py "$TG" "$SG")" \
  "green may not read tests"
assert_eq "allow" "$(tdd_path_verdict green read src/a.py "$TG" "$SG")" \
  "green may read source"

# --- refactor ---
assert_eq "allow" "$(tdd_path_verdict refactor write src/a.py "$TG" "$SG")" \
  "refactor may write source"
assert_contains "deny" "$(tdd_path_verdict refactor read tests/test_a.py "$TG" "$SG")" \
  "refactor may not read tests"

# --- mutation: same path rules as refactor; the revert discipline is the
# agent's and the orchestrator's job, not the guard's ---
assert_eq "allow" "$(tdd_path_verdict mutation write src/a.py "$TG" "$SG")" \
  "mutation may write source"
assert_contains "deny" "$(tdd_path_verdict mutation write tests/test_a.py "$TG" "$SG")" \
  "mutation may not write tests"
assert_contains "deny" "$(tdd_path_verdict mutation read tests/test_a.py "$TG" "$SG")" \
  "mutation may not read tests"

# --- fail closed ---
assert_contains "deny" "$(tdd_path_verdict "" write src/a.py "$TG" "$SG")" \
  "empty role denies"
assert_contains "deny" "$(tdd_path_verdict bogus write src/a.py "$TG" "$SG")" \
  "unknown role denies"
assert_contains "deny" "$(tdd_path_verdict red read src/a.py "$TG" "")" \
  "empty source globs deny a read rather than permitting it"
assert_contains "deny" "$(tdd_path_verdict green read tests/test_a.py "" "$SG")" \
  "empty test globs deny a read rather than permitting it"
assert_contains "deny" "$(tdd_path_verdict red write tests/test_a.py "" "$SG")" \
  "empty test globs deny a write"

# --- REGRESSION: alternative spellings of the same path must agree ---
#
# guard.sh strips the project root by literal prefix, so an un-normalised
# `./x` or `x//y` fails to strip and then matches no glob. On a READ that
# means ALLOW, because reads are a denylist. Verified live before the fix:
# red was denied `e2e/src/calc/__init__.py` and permitted the identical file
# spelled `./e2e/src/calc/__init__.py`.
assert_eq "e2e/src/a.py" "$(tdd_normalize_path "./e2e/src/a.py")" \
  "leading ./ is stripped"
assert_eq "e2e/src/a.py" "$(tdd_normalize_path "e2e//src/a.py")" \
  "repeated slashes collapse"
assert_eq "e2e/src/a.py" "$(tdd_normalize_path "e2e/./src/a.py")" \
  "/./ segments collapse"
assert_eq "e2e/src/a.py" "$(tdd_normalize_path ".//e2e/./src//a.py")" \
  "all three at once"
assert_eq "/abs/e2e/src/a.py" "$(tdd_normalize_path "/abs//e2e/./src/a.py")" \
  "an absolute path keeps its leading slash"
assert_eq "" "$(tdd_normalize_path "")" \
  "empty input stays empty rather than erroring"

# --- REGRESSION: the verdict must not depend on what is on disk ---
#
# An unquoted glob string undergoes pathname expansion as well as word
# splitting, so `src/**` would be replaced by whatever files exist. That made
# `red read src/pkg/module.py` return "allow" from a directory containing
# src/, and "deny" from anywhere else -- a silent fail-open on the one rule
# nothing else in the design can enforce.
#
# These run inside a scratch tree whose shape would trigger the bug.
_glob_sandbox="$(mktemp -d)"
mkdir -p "$_glob_sandbox/src/pkg" "$_glob_sandbox/tests"
touch "$_glob_sandbox/src/a.py" "$_glob_sandbox/src/pkg/module.py" \
      "$_glob_sandbox/tests/test_a.py"
_glob_prevpwd="$PWD"
cd "$_glob_sandbox" || return

assert_contains "deny" "$(tdd_path_verdict red read src/pkg/module.py "$TG" "$SG")" \
  "red may not read nested source even when src/ exists on disk"
assert_contains "deny" "$(tdd_path_verdict red read src/a.py "$TG" "$SG")" \
  "red may not read top-level source even when it exists on disk"
assert_contains "deny" "$(tdd_path_verdict green read tests/test_a.py "$TG" "$SG")" \
  "green may not read an existing test file"
assert_eq "allow" "$(tdd_path_verdict green write src/pkg/module.py "$TG" "$SG")" \
  "green may write nested source that exists on disk"
assert_eq "allow" "$(tdd_path_verdict green write src/pkg/brand_new.py "$TG" "$SG")" \
  "green may write nested source that does NOT exist yet"

cd "$_glob_prevpwd" || return
rm -rf "$_glob_sandbox"

# The caller's noglob setting must survive unchanged.
set +f
tdd_matches_any "src/a.py" "$SG" || true
case "$-" in *f*) _noglob_leaked=yes ;; *) _noglob_leaked=no ;; esac
assert_eq "no" "$_noglob_leaked" "tdd_matches_any restores the caller's noglob flag"
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash tests/run.sh`
Expected: FAIL — `hooks/lib/rules.sh: No such file or directory`

- [ ] **Step 3: Write the implementation**

`hooks/lib/rules.sh`:

```bash
# Pure decision functions for the TDD guard hook.
# Sourced, never executed. No load-time side effects, no globals.

# tdd_glob_match <pattern> <path>
# Returns 0 on match. `**` is normalized to `*` because inside [[ ]] a
# pattern's `*` already crosses `/`. Safe without `set -f`: bash does not
# perform pathname expansion on the right-hand pattern of [[ == ]].
tdd_glob_match() {
  local pat="${1//\*\*/*}"
  local path="${2:-}"
  [[ "$path" == $pat ]]
}

# tdd_matches_any <path> <glob-string>
# Splits the space-separated glob string and tests each against the path.
#
# The split MUST run with pathname expansion disabled. Unquoted `$globs`
# would otherwise be expanded against the real filesystem -- `src/**` would
# become whatever files happen to exist -- making the verdict depend on the
# current directory and silently failing OPEN on reads. This function is the
# only place that split happens, so this is the only place that needs the
# guard.
tdd_matches_any() {
  local path="${1:-}" globs="${2:-}"
  local g rc=1 restore=0

  case "$-" in
    *f*) ;;                       # caller already had noglob on
    *) restore=1; set -f ;;
  esac

  for g in $globs; do
    if tdd_glob_match "$g" "$path"; then rc=0; break; fi
  done

  if [ "$restore" = 1 ]; then set +f; fi
  return "$rc"
}

# tdd_normalize_path <path>
# Collapses repeated slashes, leading `./`, and `/./` segments.
#
# Without this the guard is trivially bypassable. guard.sh strips the project
# root by literal prefix match, and the glob match then needs the relative path
# to start with the glob's literal prefix. A path spelled `./e2e/src/a.py`
# strips to nothing and matches no glob -- and because reads are a DENYLIST,
# no-match means ALLOW. Verified against the live config: red was denied
# `e2e/src/calc/__init__.py` and permitted `./e2e/src/calc/__init__.py`, the
# same file. `e2e//src/...` bypassed identically.
#
# Uses `tr -s` rather than `${p//\/\//\/}` deliberately: the replacement half
# of a bash substitution is not a pattern, so `\/` there leaves a literal
# backslash -- the same trap that produced the `**` normalization bug in this
# file's own history.
tdd_normalize_path() {
  local p="${1:-}"
  [ -n "$p" ] || { printf ''; return; }
  p=$(printf '%s' "$p" | tr -s '/')
  while :; do
    case "$p" in
      ./*)   p="${p#./}" ;;
      */./*) p="${p%%/./*}/${p#*/./}" ;;
      *)     break ;;
    esac
  done
  printf '%s' "$p"
}

# tdd_path_verdict <role> <mode> <path> <test_globs> <source_globs>
# Echoes "allow" or "deny: <reason>".
#
# Every parameter defaults to empty rather than tripping `set -u`: this file
# is sourced under `set -u`, where an unset positional aborts the whole
# script. An aborted guard exits non-zero-but-not-2, which is treated as a
# non-blocking error and lets the tool call through. A caller bug must
# degrade to deny, never to a crash that permits.
tdd_path_verdict() {
  local role="${1:-}" mode="${2:-}" path="${3:-}"
  local test_globs="${4:-}" source_globs="${5:-}"

  case "$role:$mode" in
    red:write)
      if [ -z "$test_globs" ]; then
        echo "deny: no test globs are configured, so no write can be verified; the guard fails closed"; return
      fi
      if tdd_matches_any "$path" "$test_globs"; then echo "allow"
      else echo "deny: Red may only write test files; $path is not under the configured test globs"; fi ;;
    red:read)
      if [ -z "$source_globs" ]; then
        echo "deny: no source globs are configured, so $path cannot be shown not to be source; the guard fails closed"; return
      fi
      if tdd_matches_any "$path" "$source_globs"; then
        echo "deny: Red may not read source files; $path is under the configured source globs"
      else echo "allow"; fi ;;
    green:write|refactor:write|mutation:write)
      if [ -z "$source_globs" ]; then
        echo "deny: no source globs are configured, so no write can be verified; the guard fails closed"; return
      fi
      if tdd_matches_any "$path" "$source_globs"; then echo "allow"
      else echo "deny: ${role} may only write source files; $path is not under the configured source globs"; fi ;;
    green:read|refactor:read|mutation:read)
      if [ -z "$test_globs" ]; then
        echo "deny: no test globs are configured, so $path cannot be shown not to be a test; the guard fails closed"; return
      fi
      if tdd_matches_any "$path" "$test_globs"; then
        echo "deny: ${role} may not read test files; $path is under the configured test globs. Work from the handover report and the test runner's output."
      else echo "allow"; fi ;;
    *)
      echo "deny: unknown role '${role}' or mode '${mode}'; the guard fails closed" ;;
  esac
}
```

Every call site quotes its glob string. The splitting is `tdd_matches_any`'s job and happens under `set -f`.

- [ ] **Step 4: Run to verify they pass**

Run: `bash tests/run.sh`
Expected: all `rules.test.sh` assertions PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/rules.sh tests/rules.test.sh
git commit -m "feat: phase-aware path decision rules"
```

---

## Task 4: Bash command allowlist

**Files:**
- Modify: `hooks/lib/rules.sh` (append)
- Modify: `tests/rules.test.sh` (append)

**Interfaces:**
- Consumes: nothing from Task 3's functions
- Produces: `tdd_bash_verdict <command> <template>` → echoes `allow` or `deny: <reason>`

**Design notes:**

Detecting mutation by parsing shell commands is unbounded — `sed -i`, `cat >`, `mv`, a codegen script, and arbitrarily many more. Invert it: the agents only ever legitimately run the commands in `config.json`.

The rule has two parts:

1. The command must start with the template's **static prefix** — everything before the first `{` placeholder, trailing whitespace trimmed. For `pytest -q {testId}` the prefix is `pytest -q`.
2. The **delta** — what the agent supplied beyond that prefix — must contain none of `;` `|` `&` `>` `` ` `` `$(` `<` `\n`.

**A template with no static prefix must deny.** If everything before the first `{` is empty or whitespace, the prefix test degenerates to `case "$cmd" in *)`, which matches every string — leaving only the metacharacter ban, so `cp -r /etc /tmp/exfil` would be permitted. This is the one input that turns the allowlist off entirely, and it must fail closed.

The metacharacter ban applies to the delta, *not* the template. A configured command is trusted: the user confirmed it at init, and some toolchains genuinely need a redirect to emit coverage. Banning metacharacters in the template itself would make those toolchains unexpressible, and the failure would surface as an unexplained rejection at init.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rules.test.sh`:

```bash
# --- bash allowlist ---
T_SINGLE="pytest -q {testId}"
T_FULL="pytest -q"
T_COV="pytest -q --cov --cov-report=json:.tdd/coverage.json"

assert_eq "allow" "$(tdd_bash_verdict "pytest -q tests/test_a.py::test_x" "$T_SINGLE")" \
  "substituted test id is allowed"
assert_eq "allow" "$(tdd_bash_verdict "pytest -q" "$T_FULL")" \
  "exact template match is allowed"
assert_eq "allow" "$(tdd_bash_verdict "$T_COV" "$T_COV")" \
  "template containing a colon path is allowed verbatim"

assert_contains "deny" "$(tdd_bash_verdict "rm -rf src" "$T_FULL")" \
  "unrelated command is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q; rm -rf src" "$T_FULL")" \
  "semicolon in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q | tee out.txt" "$T_FULL")" \
  "pipe in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q > out.txt" "$T_FULL")" \
  "redirect in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict 'pytest -q $(whoami)' "$T_FULL")" \
  "command substitution in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q && rm -rf src" "$T_FULL")" \
  "and-chain in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "sed -i s/a/b/ src/a.py" "$T_SINGLE")" \
  "in-place edit via bash is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q" "")" \
  "empty template denies"

# --- REGRESSION: a template with no static prefix must not wave everything
# through. An empty prefix makes the prefix test `case "$cmd" in *)`, which
# matches any string, leaving only the metacharacter ban -- so an arbitrary
# command with clean punctuation would be permitted.
assert_contains "deny" "$(tdd_bash_verdict "cp -r /etc /tmp/exfil" "   ")" \
  "whitespace-only template denies rather than allowing any clean command"
assert_contains "deny" "$(tdd_bash_verdict "rm -rf /tmp/pwned" "{cmd}")" \
  "placeholder-only template denies"
assert_contains "deny" "$(tdd_bash_verdict "anything at all" "{a} {b}")" \
  "template starting with a placeholder denies"

# A tab before the placeholder must be trimmed like a space, or every normal
# invocation would fail the prefix match.
assert_eq "allow" "$(tdd_bash_verdict "pytest -q tests/t.py::x" "$(printf 'pytest -q\t{testId}')")" \
  "trailing tab is trimmed from the static prefix"
```

The redirect case is the one that matters most: `T_COV`'s template contains `:` and is allowed verbatim, while an agent-appended `>` is denied. That is the delta rule doing its job.

- [ ] **Step 2: Run to verify they fail**

Run: `bash tests/run.sh`
Expected: FAIL — `tdd_bash_verdict: command not found`

- [ ] **Step 3: Write the implementation**

Append to `hooks/lib/rules.sh`:

```bash
# tdd_bash_verdict <command> <template>
# Echoes "allow" or "deny: <reason>".
#
# The command must begin with the template's static prefix (everything
# before the first `{` placeholder). Whatever the agent added beyond that
# prefix — the delta — must contain no shell metacharacters. The template
# itself is trusted and may contain them.
tdd_bash_verdict() {
  local cmd="$1" template="$2"

  if [ -z "$template" ]; then
    echo "deny: no command is configured for this phase; the guard fails closed"
    return
  fi

  local prefix="${template%%\{*}"

  # Trim trailing whitespace. [[:space:]] rather than a literal space, so a
  # tab before the placeholder does not survive into the prefix and cause
  # every normal space-separated invocation to fail the match.
  while :; do
    case "$prefix" in
      *[[:space:]]) prefix="${prefix%?}" ;;
      *) break ;;
    esac
  done

  # An empty static prefix would make the prefix test `case "$cmd" in *)`,
  # which matches everything -- silently degrading the allowlist to "any
  # command without shell metacharacters". `cp -r /etc /tmp/exfil` would be
  # permitted. A template that is whitespace-only, or that starts with its
  # placeholder, must deny rather than wave everything through.
  if [ -z "$prefix" ]; then
    echo "deny: the configured command for this phase has no static prefix, so it cannot constrain anything; the guard fails closed"
    return
  fi

  case "$cmd" in
    "$prefix"*) ;;
    *) echo "deny: only the configured command for this phase may be run; expected it to start with '${prefix}'"
       return ;;
  esac

  local delta="${cmd#"$prefix"}"
  case "$delta" in
    *";"*|*"|"*|*"&"*|*">"*|*"<"*|*'`'*|*'$('*|*"
"*)
      echo "deny: shell metacharacters are not permitted in arguments; got '${delta}'"
      return ;;
  esac

  echo "allow"
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bash tests/run.sh`
Expected: all assertions PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/rules.sh tests/rules.test.sh
git commit -m "feat: bash command allowlist with delta-scoped metacharacter ban"
```

---

## Task 5: The guard hook

Wires the rules to Claude Code's hook protocol.

**Files:**
- Create: `hooks/guard.sh`
- Create: `hooks/hooks.json`
- Create: `tests/guard.test.sh`
- Create: `tests/fixtures/config.json`

**Interfaces:**
- Consumes: `tdd_path_verdict`, `tdd_bash_verdict` (Tasks 3–4)
- Produces: the executable hook. No functions consumed by later tasks.

**Design notes:**

`guard.sh` reads `TDD_PROJECT_DIR` if set (tests use it), else `CLAUDE_PROJECT_DIR`, else `cwd` from the payload. Config lives at `$root/.tdd/config.json`. There is no phase file.

**The caller is identified by the payload's `agent_type`** — verified empirically in Task 1's spike (`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md`):

```
agent_type absent            → exit 0   main thread / orchestrator
agent_type not a tdd-* role  → exit 0   unrelated subagent
tdd-red                      → role red
tdd-green                    → role green
tdd-refactor                 → role refactor
tdd-mutate                   → role mutation
```

**Why identity and not a marker file.** The orchestrator runs `git diff --name-only` from the main thread to audit each dispatch. A phase-marker guard would judge that call against the current role's Bash allowlist and deny the orchestrator's own audit. A file cannot distinguish orchestrator from agent; `agent_type` can.

**The two early exits are the only places the guard permits without evaluating**, and both are unambiguous — no `agent_type` means no constrained agent is calling. Everything after them fails closed.

Tool → mode mapping: `Read` → `read`; `Write`, `Edit` → `write`; `Bash` → allowlist check. Any other tool → permit (the matcher should not deliver them; defensive).

Paths from the payload are absolute; strip the `$root/` prefix before matching, since globs are repo-relative. Three cases need care, and two of them fail open if missed:

- **No `file_path` at all** — deny. A `Read`/`Write`/`Edit` the guard cannot classify is precisely the call it most needs to judge; permitting it leaves a hole the exact shape of the threat.
- **A `..` segment** — deny before stripping. `$root/../<repo>/src/a.py` resolves back inside the project but does not begin with `$root/`, so it would survive the strip as an absolute path, match no glob, and be permitted on a read. Same silent fail-open shape as the Task 3 defect.
- **Already-relative or genuinely outside the project** — pass through unstripped. An outside path matches no source glob, so a write is denied by the allowlist and a read is permitted, which is correct: the isolation being enforced is about *this* project's tests and source.

**Known limitation, not fixed here:** an agent that could create a symlink inside its writable globs pointing at the other role's tree would read through it undetected. Creating one requires `Bash` (allowlisted to the test runner) or `Write` (cannot create symlinks), so it is not reachable today. Record it rather than building path-resolution machinery the threat model does not yet need.

- [ ] **Step 1: Write the failing tests**

`tests/fixtures/config.json`:

```json
{
  "version": 1,
  "commands": {
    "test": "pytest -q",
    "single": "pytest -q {testId}",
    "coverage": "pytest -q --cov --cov-report=json:.tdd/coverage.json",
    "complexity": "radon cc -j -s src",
    "mutation": null
  },
  "globs": {
    "test": ["tests/**", "**/test_*.py"],
    "source": ["src/**"],
    "ignore": ["docs/**", "*.md"]
  },
  "crapMode": "computed",
  "refactorTriggers": { "maxCrap": 30, "duplicateThreshold": 3, "maxFunctionLines": 40 },
  "limits": { "greenAttempts": 3, "violationRetries": 1, "mutationRounds": 2, "mutantsPerPass": 20 },
  "coverageGates": { "greenMaxNewUncovered": 2, "refactorMaxNewUncovered": 0 }
}
```

`tests/guard.test.sh`:

```bash
# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.

GUARD="$REPO_ROOT/hooks/guard.sh"
SANDBOX="$(mktemp -d)"
mkdir -p "$SANDBOX/.tdd"
cp "$REPO_ROOT/tests/fixtures/config.json" "$SANDBOX/.tdd/config.json"

# AGENT is the payload's agent_type. Empty means a main-thread call, which
# omits the key entirely -- matching what the spike observed.
#
# Real dispatches carry the NAMESPACED form, "claude-tdd:tdd-red". Tests below
# exercise both that and the bare name: the bare name is what a hand-written
# payload or a differently-packaged install might send, and the namespaced one
# is what actually arrives. Testing only the bare form is how the namespace
# defect survived five tasks with a green suite.
AGENT=""

payload() { # <tool> <key> <value>
  if [ -n "$AGENT" ]; then
    printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"%s","tool_name":"%s","tool_input":{"%s":"%s"}}' \
      "$AGENT" "$1" "$2" "$3"
  else
    printf '{"hook_event_name":"PreToolUse","tool_name":"%s","tool_input":{"%s":"%s"}}' "$1" "$2" "$3"
  fi
}
payload_read()  { payload Read  file_path "$1"; }
payload_write() { payload Write file_path "$1"; }
payload_bash()  { payload Bash  command   "$1"; }

# run_guard <agent_type-or-empty> <payload-fn> <arg> ; echoes "<exit>|<stderr>"
run_guard() {
  AGENT="$1"
  local body err rc
  body=$("$2" "$3")
  err=$(printf '%s' "$body" | TDD_PROJECT_DIR="$SANDBOX" bash "$GUARD" 2>&1 >/dev/null)
  rc=$?
  printf '%s|%s' "$rc" "$err"
}

# --- inert unless a constrained agent is calling ---
out=$(run_guard "" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "main thread (no agent_type): permits silently"

out=$(run_guard "general-purpose" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "unrelated agent type: permits silently"

out=$(run_guard "" payload_read "$SANDBOX/tests/test_a.py")
assert_eq "0|" "$out" "orchestrator may read tests"

out=$(run_guard "" payload_bash "git diff --name-only")
assert_eq "0|" "$out" "orchestrator may run its own audit command"

# red
out=$(run_guard "tdd-red" payload_write "$SANDBOX/tests/test_a.py")
assert_eq "0|" "$out" "red writing a test is permitted"

out=$(run_guard "tdd-red" payload_write "$SANDBOX/src/a.py")
assert_contains "2|" "$out" "red writing source exits 2"
assert_contains "\"permissionDecision\":\"deny\"" "$out" "denial JSON has deny decision"
assert_contains "only write test files" "$out" "denial names the violated rule"

out=$(run_guard "tdd-red" payload_read "$SANDBOX/src/a.py")
assert_contains "2|" "$out" "red reading source is denied"

# green
out=$(run_guard "tdd-green" payload_read "$SANDBOX/tests/test_a.py")
assert_contains "2|" "$out" "green reading a test is denied"

out=$(run_guard "tdd-green" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "green writing source is permitted"

# bash
out=$(run_guard "tdd-green" payload_bash "pytest -q tests/test_a.py::test_x")
assert_eq "0|" "$out" "green running the configured single-test command is permitted"

out=$(run_guard "tdd-green" payload_bash "rm -rf src")
assert_contains "2|" "$out" "green running an arbitrary command is denied"

out=$(run_guard "tdd-refactor" payload_bash "pytest -q")
assert_eq "0|" "$out" "refactor running the full suite is permitted"

# every role may measure its own coverage
COV="pytest -q --cov --cov-report=json:.tdd/coverage.json"
out=$(run_guard "tdd-red" payload_bash "$COV")
assert_eq "0|" "$out" "red may run the coverage command"
out=$(run_guard "tdd-green" payload_bash "$COV")
assert_eq "0|" "$out" "green may run the coverage command"
out=$(run_guard "tdd-refactor" payload_bash "$COV")
assert_eq "0|" "$out" "refactor may run the coverage command"

# but the phase's own test command is still scoped
out=$(run_guard "tdd-green" payload_bash "pytest -q --cov; rm -rf src")
assert_contains "2|" "$out" "metacharacters after a coverage prefix are still denied"

# phase-scoped measurement commands
out=$(run_guard "tdd-refactor" payload_bash "radon cc -j -s src")
assert_eq "0|" "$out" "refactor may run the complexity command"
out=$(run_guard "tdd-green" payload_bash "radon cc -j -s src")
assert_contains "2|" "$out" "green may not run the complexity command"

# tdd-mutate writes source like refactor does
out=$(run_guard "tdd-mutate" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "tdd-mutate may write source"
out=$(run_guard "tdd-mutate" payload_read "$SANDBOX/tests/test_a.py")
assert_contains "2|" "$out" "tdd-mutate may not read tests"
out=$(run_guard "tdd-mutate" payload_bash "pytest -q")
assert_eq "0|" "$out" "tdd-mutate may run the full suite"

# --- the namespaced form is what real dispatches actually send ---
out=$(run_guard "claude-tdd:tdd-red" payload_write "$SANDBOX/src/a.py")
assert_contains "2|" "$out" "namespaced tdd-red writing source is denied"
out=$(run_guard "claude-tdd:tdd-red" payload_write "$SANDBOX/tests/test_a.py")
assert_eq "0|" "$out" "namespaced tdd-red writing a test is allowed"
out=$(run_guard "claude-tdd:tdd-green" payload_read "$SANDBOX/tests/test_a.py")
assert_contains "2|" "$out" "namespaced tdd-green reading a test is denied"
out=$(run_guard "claude-tdd:tdd-mutate" payload_bash "pytest -q")
assert_eq "0|" "$out" "namespaced tdd-mutate may run the full suite"

# An agent this plugin does not own is none of our business, even if its
# name happens to start with tdd-. Permitting is correct here; the guard
# constrains exactly the four roles it defines and nothing else.
out=$(run_guard "tdd-bogus" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "unrecognized tdd-* agent permits"

# --- every file-writing tool must be judged, not just Write/Edit ---
#
# Hook matchers are unanchored regex, so `Edit` also delivers `MultiEdit` and
# `NotebookEdit`. A tool that fell through to `exit 0` would let Red write
# source with no check at all -- invisible, because nothing downstream can
# tell a permitted write from one that was never attempted.
for _t in Write Edit MultiEdit; do
  out=$(AGENT="tdd-red"; printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"%s","tool_input":{"file_path":"%s"}}' "$_t" "$SANDBOX/src/a.py" \
        | TDD_PROJECT_DIR="$SANDBOX" bash "$GUARD" 2>&1 >/dev/null; printf '%s' "|$?")
  assert_contains "|2" "$out" "red writing source via $_t is denied"
done

# The path key must be chosen by tool. A NotebookEdit payload carrying a
# benign file_path alongside a real-target notebook_path must be judged on the
# field the tool actually acts on -- otherwise the guard validates something
# the tool ignores and permits the write it should have caught.
out=$(printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"NotebookEdit","tool_input":{"file_path":"%s","notebook_path":"%s"}}' "$SANDBOX/tests/test_a.py" "$SANDBOX/src/nb.ipynb" \
      | TDD_PROJECT_DIR="$SANDBOX" bash "$GUARD" 2>&1 >/dev/null; printf '%s' "|$?")
assert_contains "|2" "$out" "NotebookEdit is judged on notebook_path, not a decoy file_path"

# NotebookEdit carries notebook_path, not file_path.
out=$(printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"NotebookEdit","tool_input":{"notebook_path":"%s"}}' "$SANDBOX/src/nb.ipynb" \
      | TDD_PROJECT_DIR="$SANDBOX" bash "$GUARD" 2>&1 >/dev/null; printf '%s' "|$?")
assert_contains "|2" "$out" "red writing source via NotebookEdit is denied"

out=$(printf '{"hook_event_name":"PreToolUse","agent_id":"a123","agent_type":"tdd-red","tool_name":"SomeFutureTool","tool_input":{"file_path":"%s"}}' "$SANDBOX/src/a.py" \
      | TDD_PROJECT_DIR="$SANDBOX" bash "$GUARD" 2>&1 >/dev/null; printf '%s' "|$?")
assert_contains "|2" "$out" "an unrecognized tool denies rather than passing through"

# --- a payload the guard cannot classify must deny, not pass ---
out=$(run_guard "tdd-red" payload_write "")
assert_contains "2|" "$out" "empty file_path denies rather than permitting"

# Traversal: this resolves back inside the project but does not start with
# "$root/", so an unguarded strip would leave it absolute, match no glob, and
# permit the read.
out=$(run_guard "tdd-red" payload_read "$SANDBOX/../$(basename "$SANDBOX")/src/a.py")
assert_contains "2|" "$out" "a .. segment denies rather than escaping classification"
# Use a SOURCE path for green's traversal case. A traversal to a *test* path
# would be denied by the ordinary "green may not read tests" rule even with the
# traversal guard removed, so it would not prove the guard is live.
out=$(run_guard "tdd-green" payload_read "$SANDBOX/../$(basename "$SANDBOX")/src/a.py")
assert_contains "2|" "$out" "a .. segment denies for green even on a path it could otherwise read"

# Repo-relative paths must classify identically to absolute ones.
out=$(run_guard "tdd-red" payload_read "src/a.py")
assert_contains "2|" "$out" "relative source path is still denied to red"
out=$(run_guard "tdd-red" payload_write "tests/test_a.py")
assert_eq "0|" "$out" "relative test path is still allowed to red"

# --- fails closed once a role IS recognized ---
mv "$SANDBOX/.tdd/config.json" "$SANDBOX/.tdd/config.json.bak"
out=$(run_guard "tdd-red" payload_write "$SANDBOX/tests/test_a.py")
assert_contains "2|" "$out" "missing config denies even for an otherwise-legal write"
out=$(run_guard "" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "missing config still permits the main thread"
mv "$SANDBOX/.tdd/config.json.bak" "$SANDBOX/.tdd/config.json"

rm -rf "$SANDBOX"
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash tests/run.sh`
Expected: FAIL — `hooks/guard.sh: No such file or directory`

- [ ] **Step 3: Write the implementation**

`hooks/guard.sh`:

```bash
#!/usr/bin/env bash
# PreToolUse guard for the TDD subagent workflow.
#
# Identifies the caller from the payload's agent_type. Main-thread calls
# carry no agent_type and are permitted untouched, so installing this
# plugin does not perturb unrelated sessions. Once a constrained tdd-*
# agent IS identified, any condition the guard cannot evaluate denies: a
# guard that fails open would silently disable read isolation, the one
# property nothing else in this design can enforce.
set -uo pipefail

deny() {
  printf '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"%s"}\n' \
    "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')" >&2
  exit 2
}

input=$(cat)

# jq is needed even to read agent_type. Absent jq, we cannot tell whether
# the caller is constrained — so we cannot safely permit or usefully deny
# every call in the session. Deny only once we know a tdd-* agent is
# calling; use a cheap grep to make that determination without jq.
if ! command -v jq >/dev/null 2>&1; then
  # Match the role names themselves rather than a compact-JSON key/value
  # spelling: `"agent_type": "tdd-red"` with a space would slip past a
  # pattern anchored on `"agent_type":"tdd-`, and slipping past means
  # permitting. A false positive here only denies during an already-broken
  # setup, so err wide.
  case "$input" in
    *tdd-red*|*tdd-green*|*tdd-refactor*|*tdd-mutate*)
      deny "tdd guard: jq is not on PATH; cannot evaluate tool calls safely. Run /tdd-init." ;;
    *) exit 0 ;;
  esac
fi

agent=$(printf '%s' "$input" | jq -r '.agent_type // empty')
[ -n "$agent" ] || exit 0        # main thread / orchestrator — never constrained

# Plugin-provided agents arrive NAMESPACED: "<plugin>:<agent>", verified
# empirically as "claude-tdd:tdd-red" on Claude Code 2.1.220. Matching the
# bare name alone misses every real dispatch, falls through to `*) exit 0`,
# and renders the guard entirely inert -- while every test using a bare-name
# payload still passes. Strip the namespace before matching.
#
# Stripping is deliberately broad: another plugin shipping its own `tdd-red`
# would also be constrained here. That is a false denial -- loud and safe --
# whereas matching too narrowly permits silently, which is the failure this
# guard exists to prevent.
case "${agent##*:}" in
  tdd-red)      role=red ;;
  tdd-green)    role=green ;;
  tdd-refactor) role=refactor ;;
  tdd-mutate)   role=mutation ;;
  *) exit 0 ;;                   # some other agent's work — not ours
esac

# From here on, every failure denies.
root="${TDD_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-}}"
if [ -z "$root" ]; then
  root=$(printf '%s' "$input" | jq -r '.cwd // empty')
fi
[ -n "$root" ] || deny "tdd guard: cannot determine the project root for ${agent}"

config="$root/.tdd/config.json"
[ -f "$config" ] || deny "tdd guard: .tdd/config.json is missing; run /tdd-init"

# shellcheck disable=SC1090
. "$(dirname "${BASH_SOURCE[0]}")/lib/rules.sh" || deny "tdd guard: cannot load rules.sh"

test_globs=$(jq -r '.globs.test | join(" ")' "$config" 2>/dev/null) \
  || deny "tdd guard: .tdd/config.json is malformed (globs.test)"
source_globs=$(jq -r '.globs.source | join(" ")' "$config" 2>/dev/null) \
  || deny "tdd guard: .tdd/config.json is malformed (globs.source)"

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

# Every file-writing tool must map to a mode. Hook matchers are unanchored
# regex, so `Edit` in the matcher also delivers `MultiEdit` and
# `NotebookEdit` -- and an unmapped tool that fell through to `exit 0` would
# be silently permitted to write source. Unknown tools deny: if the matcher
# delivered something this case does not know, the safe answer is no.
# `path_key` names which tool_input field actually carries the target. Select
# it by tool rather than falling back through `file_path // notebook_path`:
# that precedence would validate `file_path` on a NotebookEdit call, which
# acts on `notebook_path` -- checking a field the tool ignores is the
# permissive kind of wrong.
case "$tool" in
  Read)                  mode=read;  path_key=file_path ;;
  NotebookRead)          mode=read;  path_key=notebook_path ;;
  Write|Edit|MultiEdit)  mode=write; path_key=file_path ;;
  NotebookEdit)          mode=write; path_key=notebook_path ;;
  Bash)                  mode=bash;  path_key= ;;
  *) deny "tdd guard: ${agent} called an unrecognized tool '${tool}'; the guard cannot classify it and fails closed" ;;
esac

if [ "$mode" = "bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

  # Each role gets its own runner command plus the measurement commands it is
  # judged on. Red, Green, and Refactor are gated on coverage and may measure
  # themselves. Mutate is not -- it is judged on whether mutants survive the
  # suite -- so it gets the mutation command instead.
  case "$role" in
    red|green) extra="single coverage" ;;
    refactor)  extra="test coverage complexity" ;;
    mutation)  extra="test mutation" ;;
    *)         deny "tdd guard: unmappable role for agent '${agent}'" ;;
  esac

  verdict="deny: no configured command for ${agent} matches"
  for key in $extra; do
    template=$(jq -r ".commands.${key} // \"\"" "$config")
    [ -n "$template" ] && [ "$template" != "null" ] || continue
    v=$(tdd_bash_verdict "$cmd" "$template")
    if [ "$v" = "allow" ]; then verdict="allow"; break; fi
  done
  [ "$verdict" = "allow" ] && exit 0
  deny "$verdict"
fi

path=$(printf '%s' "$input" | jq -r --arg k "$path_key" '.tool_input[$k] // empty')

# A Read/Write/Edit with no file_path cannot be classified. Permitting it
# would be a hole shaped exactly like the tool call we most need to judge,
# so an unreadable payload denies.
[ -n "$path" ] || deny "tdd guard: this ${tool} call from ${agent} carries no file_path, so it cannot be checked; the guard fails closed"

# Reject traversal BEFORE stripping the root prefix. "$root/../<repo>/src/a.py"
# resolves back inside the project but does not start with "$root/", so it
# would survive as an absolute path, match no glob, and be permitted on a
# read -- the same silent fail-open shape as the Task 3 defect.
case "/$path/" in
  */../*) deny "tdd guard: path contains a '..' segment and cannot be classified safely: $path" ;;
esac

# Normalise BOTH sides before the prefix strip. An un-normalised `./x`, `x//y`,
# or a root with a trailing slash fails to strip, then matches no glob, and a
# no-match on a read means allow.
root=$(tdd_normalize_path "$root"); root="${root%/}"
path=$(tdd_normalize_path "$path")

case "$path" in
  "$root"/*) rel="${path#"$root"/}" ;;   # inside the project
  *)         rel="$path" ;;              # already relative, or outside the project
esac

verdict=$(tdd_path_verdict "$role" "$mode" "$rel" "$test_globs" "$source_globs")
[ "$verdict" = "allow" ] && exit 0
deny "$verdict"
```

```bash
chmod +x hooks/guard.sh
```

`hooks/hooks.json`:

```json
{
  "description": "Enforces Red/Green/Refactor role boundaries during a TDD cycle",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `bash tests/run.sh`
Expected: all assertions PASS, exit 0.

- [ ] **Step 5: Prove the path assertions can actually fail**

A guard that permits everything passes no test you have written *unless* those
assertions genuinely bite. Verify by mutation — the same technique the plugin
itself will use — rather than by trusting a green suite.

Disable the verdict entirely — the canonical "guard is inert" mutation:

```bash
cp hooks/guard.sh hooks/guard.sh.bak
sed -i '' 's/\[ "\$verdict" = "allow" \] && exit 0/exit 0/' hooks/guard.sh
bash tests/run.sh; echo "exit=$?"
```

That line appears **twice** — once in the Bash branch, once in the path branch
— so the pattern is deliberately unanchored to hit both. Verify with
`grep -c 'exit 0' hooks/guard.sh` that both were replaced.

Expected: **failures**, specifically every deny assertion reporting `0|`
instead of `2|`, and a non-zero exit. A guard that always permits is the exact
failure mode nothing else in the design detects — reads leave no trace in a
diff, so an inert guard looks identical to a well-behaved run.

Then confirm the traversal and missing-path guards are individually live:

```bash
mv hooks/guard.sh.bak hooks/guard.sh
cp hooks/guard.sh hooks/guard.sh.bak
sed -i '' '/\*\/\.\.\/\*) deny/d' hooks/guard.sh
bash tests/run.sh; echo "exit=$?"
```

Expected: the `..` assertion fails.

If the suite still passes, the assertions are not testing what they claim and
must be fixed before proceeding.

Restore:

```bash
mv hooks/guard.sh.bak hooks/guard.sh
bash tests/run.sh
```

Expected: all passing again. Confirm `git status --porcelain` shows no `.bak`
file left behind.

- [ ] **Step 6: Verify hooks.json is valid and correctly shaped**

Run: `jq -e '.hooks.PreToolUse[0].hooks[0].command' hooks/hooks.json`
Expected: `"${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh"`

- [ ] **Step 7: Commit**

```bash
git add hooks/guard.sh hooks/hooks.json tests/guard.test.sh tests/fixtures/config.json
git commit -m "feat: PreToolUse guard enforcing role boundaries"
```

---

## Task 6: The three agent definitions

**Files:**
- Create: `agents/tdd-red.md`
- Create: `agents/tdd-green.md`
- Create: `agents/tdd-refactor.md`
- Create: `agents/tdd-mutate.md`

**Interfaces:**
- Consumes: nothing at runtime
- Produces: the handover schema below. Task 8's orchestrator constructs Green's prompt from it, so the field names must match exactly.

```json
{
  "item": 1,
  "outcome": "failing",
  "testId": "tests/test_parser.py::test_rejects_empty",
  "testFile": "tests/test_parser.py",
  "publicApi": "parse(text: str) -> Node",
  "intent": "empty input is an error, not an empty tree",
  "expected": "raises ParseError('empty input')",
  "observedFailure": "<verbatim runner output>"
}
```

`outcome` is one of `failing`, `passing-covered`, `passing-flat`, `blocked`. `publicApi` is load-bearing — Green cannot read the test, so without an explicit signature it cannot know what to implement.

All four files use frontmatter `name`, `description`, `tools`, `model`, `color`. `tools` is `Read, Write, Edit, Bash` for all of them — path scoping is the hook's job, not the frontmatter's.

**`Grep` and `Glob` are deliberately not granted.** The `PreToolUse` matcher covers `Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Bash`; a `Grep` call would never reach the guard at all — not even its fail-closed arm — and `Grep` returns file *content*, so Red could read source wholesale through it. Widening the matcher is not a simple fix either: `Grep` and `Glob` are scoped to a directory rather than a file, and the guard classifies file paths against globs. Granting a tool the guard cannot classify is how a boundary becomes decorative, so the roles get file-level tools only.

**The `name:` field is load-bearing.** The guard's dispatch table matches on it via the payload's `agent_type`, so `name: tdd-red` must be exact. A typo does not fail loudly — it makes the guard fall through to "not our agent" and permit everything that agent does.

Mutation ships as its own agent rather than a mode on `tdd-refactor` precisely because the guard keys on identity: a separate `agent_type` gets a separate Bash allowlist for free. `tdd-refactor` needs the complexity command, `tdd-mutate` needs the mutation command, and neither should have the other's.

Word Q2's guidance from Task 1's spike into each agent's prompt: if denials are correctable, tell the agent a denial means "you strayed, adjust and continue"; if fatal, tell it to check its boundaries before acting rather than probing.

- [ ] **Step 1: Write `agents/tdd-red.md`**

```markdown
---
name: tdd-red
color: red
description: Authors exactly one failing test from a specification. Never reads or writes source code. Use only as part of the TDD cycle.
tools: Read, Write, Edit, Bash
model: sonnet
---

You author tests. You never author, read, or modify source code.

A `PreToolUse` guard enforces this. If a file-path denial comes back, you have
strayed outside your role — do not work around it, adjust and continue.

**Your `Bash` access is limited to the commands configured for your role.**
Anything else — `git`, `rm`, `mv`, `sed` — is denied by design, not because you
did something wrong. Use `Read` to inspect, and `Edit` or
`Write` to change files within your permitted paths.

## Your input

- A specification file path.
- One checklist item: the single behavior to test this cycle.
- The configured test and coverage commands.

## Your objective

Author **exactly one** test for that one behavior, determine its outcome, and
stop. Do not write a second test. Do not test behavior beyond the item.

## Procedure

1. Read the spec and any existing tests to match conventions and avoid duplicating coverage.
2. Write one test for the assigned behavior.
3. Run it with the configured single-test command.
4. Classify:
   - **Fails** → `outcome: "failing"`. This is the normal, desired result.
   - **Passes** → run the coverage command. Compare against the baseline you were given.
     - Coverage increased → `outcome: "passing-covered"`. The behavior already worked; your test now pins it down. Keep it.
     - Coverage unchanged → `outcome: "passing-flat"`. The test adds nothing. **Report it; do not try to delete the file.** You cannot run `rm`, and you do not need to — the orchestrator discards your working-tree changes on this outcome.
   - **Cannot write a test at all** (the behavior is untestable as specified, or you cannot express it) → `outcome: "blocked"` with the reason. Do not guess.
5. Report and stop.

If no coverage command is configured, treat any passing test as `passing-flat`.

## Report exactly this JSON

    {
      "item": <int>,
      "outcome": "failing" | "passing-covered" | "passing-flat" | "blocked",
      "testId": "<runner-addressable id>",
      "testFile": "<path>",
      "publicApi": "<exact signature the test calls>",
      "intent": "<what behavior this pins down>",
      "expected": "<what the code must do to satisfy it>",
      "observedFailure": "<verbatim runner output, or empty>",
      "reason": "<only when blocked>"
    }

`publicApi` must be the exact signature — name, parameters, types, return type.
The agent that implements this cannot read your test. That field is the entire
interface contract between you.

## Stop conditions

Stop the moment you have classified one test. Do not implement source to make
it pass. Do not refactor. Do not start the next item.
```

- [ ] **Step 2: Write `agents/tdd-green.md`**

```markdown
---
name: tdd-green
color: green
description: Writes the minimum source code to turn one failing test green. Never reads or writes test code. Use only as part of the TDD cycle.
tools: Read, Write, Edit, Bash
model: sonnet
---

You write source code. You never author, read, or modify test code.

A `PreToolUse` guard enforces this. If a file-path denial comes back, you have
strayed outside your role — do not work around it, adjust and continue.

**Your `Bash` access is limited to the commands configured for your role.**
Anything else — `git`, `rm`, `mv`, `sed` — is denied by design, not because you
did something wrong. Use `Read` to inspect, and `Edit` or
`Write` to change files within your permitted paths.

## Your input

A handover report describing one failing test:

- `testId` — how to run it
- `publicApi` — the exact signature your code must expose
- `intent` — the behavior being pinned down
- `expected` — what your code must do
- `observedFailure` — verbatim runner output

**You cannot open the test file.** You may read what the runner prints —
test names, assertion diffs, tracebacks. That is your only window into the
test, and it is enough.

## Your objective

Write the **minimum** code that turns that one test green. Stop when it passes.

Minimum means minimum. If returning a constant satisfies the test, return a
constant. Generality is the next cycle's job, driven by the next test. Do not
anticipate. Do not add error handling the test does not demand. Do not build
abstractions for one caller.

## You are measured on coverage

**Every line you write should be a line the test executes.** After your change,
the orchestrator counts how many *uncovered* lines you added. More than a small
allowance means you wrote code no test drives — speculative generality,
unrequested error handling, a branch nobody asked for. You will be sent back
with the specific line numbers and told to delete them.

You may run the configured coverage command yourself to check before handing
over. That is cheaper for everyone than a re-dispatch.

A small number of uncovered lines is legitimate and expected. Satisfying a
divide-by-zero test requires writing the happy-path `return a / b`, which that
test never executes. That is fine. A dozen uncovered lines is not.

## Procedure

1. Read the handover report.
2. Read whatever source you need to place the change correctly.
3. Implement the smallest change satisfying `expected`, exposing exactly `publicApi`. The orchestrator passes you the attempt limit from `limits.greenAttempts`.
4. Run the configured single-test command against `testId`.
5. Not passing → revise and rerun, up to the attempt limit you were given. Then stop and report `stuck` with what you tried and what the runner said.
6. Passing → optionally run coverage and delete anything uncovered that the test does not require. Then report and stop.

## Report

    {
      "item": <int>,
      "outcome": "passing" | "stuck",
      "filesChanged": ["<path>", ...],
      "summary": "<one sentence on what you implemented>",
      "mess": "<duplication or shortcuts you knowingly left, or empty>",
      "newUncoveredLines": <int, or null if you did not measure>,
      "attempts": <int>,
      "reason": "<only when stuck>"
    }

`mess` feeds the refactor trigger check. Be honest — you are not penalized for
deliberate duplication, and hiding it produces worse code two cycles later.

## Stop conditions

Stop the moment the test passes. Do not improve unrelated code. Do not write
tests. Do not start the next item.
```

- [ ] **Step 3: Write `agents/tdd-refactor.md`**

```markdown
---
name: tdd-refactor
color: blue
description: Improves existing source code while holding public interfaces and test results constant. Never reads or writes test code, never adds behavior. Use only as part of the TDD cycle.
tools: Read, Write, Edit, Bash
model: sonnet
---

You improve existing source code. You add no behavior and no public interface.

A `PreToolUse` guard enforces this. If a file-path denial comes back, you have
strayed outside your role — do not work around it, adjust and continue.

**Your `Bash` access is limited to the commands configured for your role.**
Anything else — `git`, `rm`, `mv`, `sed` — is denied by design, not because you
did something wrong. Use `Read` to inspect, and `Edit` or
`Write` to change files within your permitted paths.

## Your input

- The trigger that caused your dispatch (duplication, function length, naming drift).
- The source paths in scope.
- The configured full-suite command.

## Your window into the tests

**You may never open a test file.** You may read everything the runner prints —
test names, failure messages, assertion diffs, tracebacks that quote source
lines. That is not a violation; it is your only feedback channel, and it is
sufficient.

## Your objective

Leave every public interface byte-identical and every test result unchanged,
while making the code better along the axis the trigger named.

Permitted: extracting a helper, renaming a local, collapsing duplication,
simplifying control flow, moving a private function.

Not permitted: new public functions, changed signatures, new parameters (even
optional), new behavior, new error cases, performance work that changes
observable results.

## Coverage must not move at all

**Your gate is zero new uncovered lines.** A behavior-preserving change moves,
renames, or collapses code — covered lines stay covered. If your change adds
even one uncovered line, you added a path no test reaches, which means you
added behavior. That is the one thing you are categorically forbidden from
doing, and it reverts.

This is stricter than the rule the implementing agent works under, deliberately.
It has an allowance for driving out new code; you have none, because you are not
supposed to be producing any.

Run the configured coverage command before and after. Check it yourself rather
than discovering it at audit.

## Procedure

0. **Record the exact original contents of every file you intend to touch.** You cannot run `git checkout`, so this text is your only way back.
1. Run the full suite. Record the exact pass/fail counts. Your dispatch includes a `knownRed` list of tests that were already failing before this run began; those are expected and are not yours. **If anything fails that is NOT in `knownRed`, stop and report `blocked`** — you cannot distinguish your breakage from breakage you inherited.
2. Run the coverage command. Record the uncovered line count.
3. Make the improvement the trigger calls for. Nothing else.
4. Run the full suite again, then coverage again.
5. Counts differ, any test that passed in step 1 now fails, or uncovered lines increased → **restore the original contents with `Edit`/`Write`** and report `reverted`. You cannot run `git checkout`; restore from the original text, which is why step 0 tells you to record it. Do not attempt a fix — a refactor that breaks tests or adds uncovered code is a failed refactor, and the orchestrator will reset the tree as a backstop.
6. All identical → report and stop.

## Report

    {
      "outcome": "improved" | "no-change-needed" | "reverted" | "blocked",
      "filesChanged": ["<path>", ...],
      "summary": "<what you changed and why it is better>",
      "suiteBefore": "<pass/fail counts>",
      "suiteAfter": "<pass/fail counts>",
      "uncoveredBefore": <int, or null if coverage is unavailable>,
      "uncoveredAfter": <int, or null>,
      "reason": "<only when reverted or blocked>"
    }

`no-change-needed` is a perfectly good outcome. Do not invent work to justify
the dispatch — a gratuitous refactor is worse than none.

## Stop conditions

Stop when the suite matches its starting state and the trigger is addressed.
Do not expand scope to code the trigger did not name.
```

- [ ] **Step 3b: Write `agents/tdd-mutate.md`**

Its own agent, not a mode flag on `tdd-refactor`. The guard keys on
`agent_type`, so a separate identity gets a separate Bash allowlist for free:
`tdd-refactor` needs the complexity command, `tdd-mutate` needs the mutation
command, and neither should hold the other's.

```markdown
---
name: tdd-mutate
color: magenta
description: Probes test strength by deliberately breaking source code and observing whether tests notice. Reverts every change. Never reads or writes test code, never fixes anything. Use only as part of the TDD cycle's hardening pass.
tools: Read, Write, Edit, Bash
model: sonnet
---

You break source code on purpose to find tests that do not actually test.

A `PreToolUse` guard enforces your boundaries. If a file-path denial comes
back, you have strayed outside your role — do not work around it, adjust and
continue.

**Your `Bash` access is limited to the commands configured for your role** —
the test command and, if one is configured, the mutation command. Anything
else — `git`, `rm`, `mv`, `sed` — is denied by design, not because you did
something wrong. This is why your revert discipline below is built on `Edit`
and `Write` rather than `git checkout`: restoring recorded text is the only
mechanism you actually have.

## What you are doing and why

Coverage proves a line *ran*. It does not prove any test would notice if that
line were wrong — a test that executes code without asserting on its result
gives full coverage and zero protection. You are going to find those tests by
breaking the source on purpose and seeing whether anything complains.

## The contract

**Every mutation you make, you revert.** You are the only role that can write
source and is forbidden from keeping a behavior change, which is why this job
is yours. Mutate, run, record, revert. The tree you hand back must be
byte-identical to the tree you received.

**You detect; you never fix.** A surviving mutant is a defect in a *test*, and
you may not read or write tests. Report it and stop. The orchestrator turns
each survivor into a new item for the agent that writes tests.

## Procedure

1. Run the full suite. Your dispatch includes a `knownRed` list of tests that were already failing before this run began. Every other test must pass. If any test outside `knownRed` fails, stop and report `blocked` — you cannot tell a killed mutant from a failure you inherited.
2. The orchestrator has already verified the working tree is clean before dispatching you, and verifies it again when you return. You cannot run `git status` yourself and do not need to.
3. If a mutation tool is configured, run it and collect results. Otherwise hand-mutate, working through the target methods you were given in CRAP order, highest first — that is where untested complexity is concentrated.
4. For each mutant, up to the cap you were given:
   - **Read the file and record its exact original contents first.** This text is your only way back — you cannot run `git checkout`, and your `Bash` access covers only the test and mutation commands.
   - Apply exactly one small semantic change with `Edit`: flip a comparison (`>` ↔ `>=`), invert a boolean, swap an operator (`+` ↔ `-`), replace a return value with a constant, remove a statement.
   - Run the full suite.
   - A test outside `knownRed` fails → **killed**. The tests caught it. Good.
   - Only `knownRed` tests fail, or none do → **survived**. Record file, line, the original code, the mutation, and which method it was in.
   - **Restore the original contents with `Edit`/`Write` before the next mutant. Always.** Do not batch mutations, and never move on with a mutation still in place.
5. After the last mutant, confirm every file matches the original text you recorded, and run the full suite once more to confirm it is green. Report.

## Report

    {
      "outcome": "completed" | "blocked",
      "mutantsAttempted": <int>,
      "killed": <int>,
      "survivors": [
        {
          "file": "<path>",
          "line": <int>,
          "method": "<name>",
          "original": "<the code as written>",
          "mutation": "<what you changed it to>",
          "missingBehavior": "<one sentence: what a test would have to assert to catch this>"
        }
      ],
      "treeClean": true,
      "reason": "<only when blocked>"
    }

`missingBehavior` is the field that matters. It becomes a checklist item for the
agent that writes tests, and that agent cannot see your work — write it as a
testable behavior, not as a description of your mutation.

## Stop conditions

Stop at the mutant cap, or when the target methods are exhausted. Never leave a
mutation in place. Never write a test. Never fix a survivor.
```

- [ ] **Step 4: Validate all four**

```bash
V=/Users/kbluck/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/agent-development/scripts/validate-agent.sh
for a in agents/*.md; do bash "$V" "$a" || echo "FAILED: $a"; done
```

Expected: **exit 0** for all four, with warnings only.

The validator treats `color` as required and runs under `set -euo pipefail`, so a file without it dies on the failed `grep '^color:'` at line 142 — before it can even print "Missing required field: color". It exits 1 with no explanation of why. That is why each agent carries a `color:` field: without one this step is a gate that can never pass, which is worse than no gate.

Two warnings are expected and acceptable — the validator wants `<example>` blocks and a description starting with "Use this agent when". Our descriptions are written for the dispatch table's benefit, not the validator's. An **error** on `name`, `description`, `model`, or frontmatter structure must be fixed.

- [ ] **Step 5: Verify the handover contract is consistent across files**

```bash
grep -c 'publicApi' agents/tdd-red.md agents/tdd-green.md
```

Expected: non-zero for both. Red produces the field, Green consumes it; a rename in one file without the other silently breaks the handoff.

- [ ] **Step 5b: Pin the agent-name/guard coupling with a test**

The `name:` in each agent file and the dispatch table in `hooks/guard.sh` are a
contract with no compiler behind it. A typo or a later rename does not fail
loudly — it makes `guard.sh` fall through to `*) exit 0` and **permit
everything that agent does**, silently. Assert the coupling so it cannot drift.

Create `tests/agents.test.sh`:

```bash
# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.
#
# The guard identifies callers by agent_type, which is the agent file's `name:`
# field. If the two ever disagree, the guard stops constraining that role and
# says nothing. This test is the only thing standing between a rename and a
# silently disabled guard.

_agent_dir="$REPO_ROOT/agents"
_guard="$REPO_ROOT/hooks/guard.sh"

for _f in "$_agent_dir"/*.md; do
  [ -e "$_f" ] || continue
  _name=$(sed -n 's/^name:[[:space:]]*//p' "$_f" | head -1)
  assert_contains "$_name)" "$(cat "$_guard")" \
    "$(basename "$_f") declares name '$_name', which guard.sh dispatches on"
done

# And the reverse: every role the guard knows about must have an agent file.
for _role in tdd-red tdd-green tdd-refactor tdd-mutate; do
  _found=no
  for _f in "$_agent_dir"/*.md; do
    [ -e "$_f" ] || continue
    [ "$(sed -n 's/^name:[[:space:]]*//p' "$_f" | head -1)" = "$_role" ] && _found=yes
  done
  assert_eq "yes" "$_found" "guard role $_role has an agent definition"
done
```

Run `bash tests/run.sh` and confirm the new assertions pass. Then verify they
bite: change one agent's `name:` to `tdd-typo`, confirm the suite fails, and
restore.

- [ ] **Step 6: Verify a custom agent reports its own name in `agent_type`**

**This is the load-bearing assumption of the entire guard, and it is untested.**
Task 1's spike dispatched the built-in `general-purpose` and got
`agent_type: "general-purpose"` back. The guard's dispatch table assumes
dispatching `tdd-red` yields `agent_type: "tdd-red"`. Plausible — but if custom
plugin agents report something else, every lookup falls through to "not our
agent" and the guard **permits everything**, silently.

Install the plugin locally, restart, then dispatch `tdd-red` with a probe hook
temporarily in place — or simply add one line at the top of `guard.sh`:

```bash
printf '%s\n' "$input" >> /tmp/tdd-agent-type-check.log
```

Dispatch `tdd-red` with a trivial instruction, then:

```bash
jq -r '.agent_type' /tmp/tdd-agent-type-check.log | sort -u
```

Expected: `tdd-red`.

If it reports anything else — `general-purpose`, a UUID, empty — **stop and
report**. The guard's identification strategy needs rework, and the fallback
(reinstating a phase marker) reintroduces the orchestrator-audit bug the spike
found. Record the actual value in
`docs/superpowers/spikes/2026-07-30-hook-in-subagent.md` under *Open*.

Remove the logging line and confirm `git diff` on `hooks/guard.sh` is empty
before committing.

- [ ] **Step 7: Commit**

```bash
git add agents
git commit -m "feat: Red, Green, Refactor, and Mutate agent definitions"
```

---

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

## Task 8: The orchestrator skill and `/tdd`

**Files:**
- Create: `skills/run-tdd-cycle/SKILL.md`
- Create: `commands/tdd.md`

**Interfaces:**
- Consumes: the handover schemas from Task 6; `.tdd/config.json` from Task 7
- Produces: the complete workflow. Task 9 exercises it.

- [ ] **Step 1: Write the orchestrator skill**

`skills/run-tdd-cycle/SKILL.md`:

```markdown
---
name: run-tdd-cycle
description: Use when driving a specification to implementation through Red/Green/Refactor subagents - orchestrates the cycle, enforces role boundaries, and tracks progress in .tdd/checklist.json
---

# Running the TDD Cycle

You are the orchestrator. You are **not** one of the three constrained roles —
you read spec, tests, source, and diffs freely. That asymmetry is deliberate:
the guarantee is that no *agent* couples a test to its implementation, not that
no *participant* has full visibility.

Announce: "Using run-tdd-cycle to implement `<spec>`."

## Preflight — all seven, in order, before any dispatch

1. **Git repo, clean tree.** Reverting a dispatch destroys working-tree state — see *Reverting a dispatch* for what that actually runs. Dirty → stop, ask the user to commit or stash.
2. **`.tdd/config.json` exists.** Missing → tell the user to run `/tdd-init`. Do not write one yourself.
3. **`jq` on PATH.** Missing → stop. The guard fails closed without it and would deny every tool call.
4. **The full suite passes.** Run the configured test command. Green's stop condition is "this test now passes" and Refactor's is "all tests still pass" — both are meaningless against an already-red suite. If red, list the failing test IDs, ask the user whether to proceed, and if so record them in `checklist.json` as `knownRed`.

   **`knownRed` is not a note to yourself; it must be threaded or it is a lie.** Every later suite comparison is against "the baseline you were given", never against zero failures — and `tdd-refactor` and `tdd-mutate` both stop on a suite that is not green, so they must receive the list or they will refuse to run for the rest of the session. Pass `knownRed` in every Refactor and Mutate dispatch. When you check a suite yourself, subtract it before judging. If you find yourself unable to thread it somewhere, stop and say so rather than proceeding with an allowlist that only exists in the file.
5. **The glob partition is still exhaustive.** `git ls-files`; every path must match `test`, `source`, or `ignore`. Drift since init → stop and tell the user to re-run `/tdd-init`. This is what makes the guard's read denylist sound.
6. **Spec file readable and non-empty.** Unreadable or empty → stop; there is nothing to decompose.
7. **The guard actually sees `agent_type`.** Dispatch a throwaway subagent told to read one file under `globs.source` while claiming no role, then confirm the guard evaluated it. Cheaper equivalent: dispatch `tdd-red` with the instruction "read `<a source file>` and report the first line" and confirm it comes back **denied**.

   If that read succeeds, the guard is not seeing `agent_type`, every subagent looks like the orchestrator, and **read isolation is silently absent**. Stop. Do not run unenforced — reads leave no trace in a diff, so nothing downstream would ever notice. `agent_type` is undocumented (found empirically on Claude Code 2.1.220) and this is the check that catches it disappearing.

   **Only an observed denial passes this check.** If the probe cannot be dispatched, errors, or returns something you cannot interpret, that is not a pass — it is the same unknown state as a missing denial, and it fails closed. The one outcome that clears preflight is the agent reporting back that the read was denied, with the guard's message in it.

There is no phase marker to clear — the guard identifies callers from the
payload's `agent_type`.

## Decompose

Read the spec once. Write `.tdd/checklist.json`:

    {
      "spec": "<path>",
      "knownRed": ["<test ids excluded from comparisons>"],
      "mutationRoundsRun": 0,
      "items": [
        { "id": 1, "behavior": "<one testable behavior>", "status": "pending" }
      ]
    }

Write `mutationRoundsRun` at decompose time, initialised to `0`. Every other
field the loop reads is declared here; leaving this one to be created later by
the mutation pass is the shape `knownRed` had before it turned out nothing read
it — a value that exists in prose but not in the schema is one nobody has to
account for.

Items may also carry `"overbuilt": true`, set by the Green coverage gate. It is
a flag for review, not a status — the item still reaches `done`.

Each item is **one** behavior, small enough for a single test. Order them so
earlier items do not depend on later ones.

**Show the checklist to the user and get approval before the first dispatch.**
Bad decomposition is cheap to fix here and expensive to fix on cycle 9.

**A checklist with no items is a failed decomposition, not a finished run.**
Completion below is "no item is `pending`", which an empty list satisfies
immediately — so a spec you could not decompose would report success having
built nothing. Require at least one item, state the count when you present it,
and if the spec yields none, say so and stop rather than proceeding.

`status`: `pending` → `red` → `green` → `done`, or terminating at `redundant`
or `blocked`. Write the file after every transition — an interrupted run
resumes from this file, not from your context.

## Reverting a dispatch

Several branches below say to discard an agent's work. **`git checkout -- .` is
not sufficient on its own** — it restores tracked files but leaves untracked
ones in place, and Red's tests are almost always new files. Verified during the
first live run: after `git checkout -- .`, a rejected `passing-flat` test was
still sitting in the tree, where the next item's commit would have swept it up.

Revert means both:

    git checkout -- <the role's write globs>     # restore tracked edits
    git clean -fd -- <the role's write globs>    # remove new files

**`git reset --hard HEAD` has the identical blind spot** and appears wherever a
branch resets to the last commit rather than discarding working-tree edits —
Refactor's coverage gate, Refactor's incomplete-restore check, and the mutation
pass's tree-clean recovery. Verified: `reset --hard` leaves untracked files
exactly as `checkout` does. Those sites mean:

    git reset --hard HEAD
    git clean -fd -- <the role's write globs>

The mutation-pass case is the sharpest: that reset is the safety net for an
agent that failed to revert its own mutations. It detects the problem with
`git status --porcelain`, which *does* show untracked files, and then applies a
command that cannot remove them.

**Only the `clean` half takes a pathspec.** Scope it to the globs that role may
write — `globs.test` for Red, `globs.source` for Green, Refactor and Mutate — because
an unscoped `git clean -fd` would delete legitimately untracked work elsewhere in
the tree. (`clean` without `-x` spares gitignored paths, so the venv, the
checklist and the coverage report survive either way; do not add `-x`.)

`git reset --hard` is tree-wide and **cannot** be scoped: `git reset --hard -- <path>`
fails with `fatal: Cannot do hard reset with paths.` That is safe here only because
preflight requires a clean tree and exactly one agent writes per dispatch, so the
only tracked changes to discard are that dispatch's own.

Branches below say **revert** or **reset and clean** and point here. They do not
name the bare git command, deliberately: an orchestrator reading
`git checkout -- .` at the point of use will run exactly that, which is the
defect this section exists to fix.

## Coverage baselines

All three roles are gated on coverage, and every gate compares against a
baseline you capture. Skip all of this if `commands.coverage` is null.

**A measurement you cannot parse is unavailable, never zero.** Every gate in
this workflow compares a number against a threshold, so an extractor that
returns `0` on a report shape it does not recognise silently satisfies all of
them: Green's overbuild check passes, Refactor's hard-zero check passes, and
CRAP finds no triggers. Nothing else in the design would notice. If a report
cannot be parsed, say so, skip the gate explicitly, and record it in the run
summary as unenforced — do not let a parse failure read as a clean result.

Run the coverage command and record the uncovered-line count:

- **at preflight**, as the run's starting baseline
- **immediately before each Green dispatch** (after Red's commit)
- **immediately before each Refactor dispatch**

Compare after each dispatch. If a baseline reports zero total lines — an empty
project, a first implementation — skip that cycle's gate; there is nothing
meaningful to compare against.

**Red is the one role that measures for its own branch decision.** It needs the
coverage delta to distinguish `passing-covered` from `passing-flat`, and it needs
that answer before it can report at all — so you pass it the current baseline and
it runs coverage itself. You then re-measure to confirm, exactly as you re-run
Green's test rather than trusting its word.

For Green and Refactor, measuring is your job. They may check themselves to
self-correct before handing over, which is cheaper than a re-dispatch, but your
measurement is the one that decides.

## Per item

### Red

1. Dispatch `tdd-red` with: the spec path, the one item, the configured commands, and the current coverage baseline.
2. On return, **audit**: `git diff --name-only` plus `git status --porcelain`. Every touched path must match `globs.test`. Violation → **revert** (see *Reverting a dispatch*), re-dispatch quoting the rule and the offending path, up to `limits.violationRetries` times. Beyond that → stop, escalate.

   **An empty diff is not a passing audit.** "Every touched path matched" is vacuously true when nothing was touched. If Red reports `failing`, `passing-covered`, or `passing-flat`, it claims to have written a test — so at least one path must have changed. Zero changed paths alongside any of those outcomes means the agent reported work it did not do: treat it as `blocked` and escalate rather than committing an empty commit and moving on. The same applies to Green's audit below.
3. Branch on `outcome`:
   - `failing` → commit `red: <behavior>`, status `red`, continue to Green.
   - `passing-covered` → **re-measure coverage yourself before committing.** This branch writes a commit and skips Green entirely on the strength of a number the agent computed about its own work; it is the one place nothing else would catch a wrong answer. Delta confirmed → commit `test: <behavior>`, status `done`, next item. Delta not confirmed → treat as `passing-flat`.
   - `passing-flat` → **revert** (see *Reverting a dispatch*), status `redundant`, next item — **unless the item has `origin: "mutation"`**, in which case see below.

   **Mutation-origin items are judged on killing the mutant, not on coverage.** A surviving mutant means the source is *correct* and the test is weak, so a Red test for that behavior necessarily passes, and it necessarily moves no coverage — the line was already executed by the assertion-free test that let the mutant survive in the first place. Applying the three-way rule unchanged classifies every such item `passing-flat`, discards the test, and the next round rediscovers the identical survivors: the loop runs to `limits.mutationRounds` having closed nothing.

   So for an item carrying `origin: "mutation"`, ignore the coverage delta and verify the kill yourself. For each mutation recorded in the item's `mutant` field: apply it to the source, run Red's new test, confirm it **fails**, then restore. You can do this because you are unconstrained; Red cannot, since it may not write source.

   - Every recorded mutation now fails the test → commit `test: <behavior>`, status `done`, next item. This is a real fix even though nothing went red first and coverage did not move.
   - Any mutation still passes → the test does not close the gap. Re-dispatch once, naming the mutation that survived it. Still surviving → status `blocked`, escalate.
   - `blocked` → status `blocked`, record the reason, **stop and escalate**.

`blocked` is not `redundant`. `redundant` means a test was written, passed, and
moved no coverage — the behavior is genuinely already covered. `blocked` means
Red failed to do its job. Collapsing them would silently drop a spec item as
"already covered" when nothing verified it.

### Green

1. Dispatch `tdd-green` with **only** Red's handover report. Do not paste the test source — that is the whole point of the separation.
2. On return, audit as above against `globs.source`.
3. `outcome: stuck` → record the reason on the item, write the checklist, then stop and escalate with the agent's attempts.
4. Independently verify: run the configured single-test command against `testId` yourself. Do not take the agent's word for it. **Not passing → revert (see *Reverting a dispatch*), treat it as `stuck`, and escalate.** An agent reporting a pass the orchestrator cannot reproduce is worse than one reporting failure, and committing on its word would bury it.
5. **Run the full suite**, subtracting `knownRed`. Green only ever runs one test, so nothing else in the loop would notice it regressing a previously-passing test elsewhere — the next signal would be a Refactor dispatch that may never fire, or the mutation pass after every item is done. New failure → **revert** (see *Reverting a dispatch*), re-dispatch once naming the regressed tests. Still failing → stop and escalate.
6. **Coverage gate** (skip entirely if `commands.coverage` is null, or if the baseline reports zero total lines):
   - Run the coverage command. Compute new uncovered lines against the pre-dispatch baseline.
   - Within `coverageGates.greenMaxNewUncovered` → commit `green: <behavior>`, status `green`.
   - Over → **revert** (see *Reverting a dispatch*) and re-dispatch once, naming the specific uncovered file:line ranges and instructing Green to implement only what the test drives.
   - Over a second time → accept it, commit, and set `"overbuilt": true` on the checklist item. Do not grind. The rule has honest exceptions — satisfying a divide-by-zero test requires writing the happy path, which that test never executes — and a flagged item is more useful to the user than a stalled run.

`overbuilt` is a flag on the item, not a status; the item still reaches `done`.

### Refactor trigger check

Dispatch `tdd-refactor` only on a hit:

- **any method scores above `refactorTriggers.maxCrap`** — the primary trigger. Scope the dispatch to that method.
- the same shape appears `refactorTriggers.duplicateThreshold` times
- a name drifted from the spec's vocabulary
- Green reported a non-empty `mess`
- a function exceeds `refactorTriggers.maxFunctionLines` — **only** when `crapMode` is `unavailable`

**Computing CRAP.** `CRAP(m) = comp(m)² × (1 − cov(m))³ + comp(m)`, with `cov`
as a fraction. At full coverage it reduces to plain complexity; as coverage
falls the penalty grows cubically. Threshold 30 means a 5-complexity untested
method and a 30-complexity fully-tested one rank equally — which is the point.

By `crapMode`:

- `native` — read the score straight from the coverage report (PHPUnit, Cobertura).
- `computed` — run `commands.complexity` for per-method cyclomatic complexity, take per-file line coverage from the coverage report, map covered lines onto each method's line range to get `cov(m)`, then apply the formula.
- `unavailable` — skip; use `maxFunctionLines`.

The line-range mapping is the fiddly part and the most likely thing to be
quietly wrong. If a method's computed coverage is `1.0` for every method in a
file you know is partly untested, the mapping is broken — say so rather than
reporting no triggers.

No hit → status `done`, next item. This avoids paying for a subagent to
conclude "nothing to do", which is the common case in early cycles.

On dispatch: pass the trigger, the source paths in scope, and `knownRed`. Audit
against `globs.source`.

Then apply the **hard coverage gate**: run coverage yourself and compare against
the pre-dispatch baseline. Any increase in uncovered lines beyond
`coverageGates.refactorMaxNewUncovered` (default 0) → **reset and clean** (see *Reverting a dispatch*)
and record `reverted`, regardless of what the agent reported. New uncovered
lines mean new behavior, and Refactor adding behavior is a boundary violation,
not a quality issue. There is no re-dispatch — reverting is the correct outcome.

Branch on all four outcomes:

- `improved` and the gate passed → commit `refactor: <behavior>`.
- `no-change-needed` → commit nothing, record it, continue. This is a good outcome, not a failure; the trigger fired and the agent judged there was nothing worth doing.
- `reverted` → record it and continue. A refactor that backed out cleanly is not a failed cycle.
- `blocked` → **stop and escalate.** Refactor reports `blocked` when it could not evaluate its own work — typically a suite that was already failing. That is a broken precondition, not a judgement call, and continuing past it means every later Refactor dispatch hits the same wall silently. This is the same rule as the Escalation section below; there is no Refactor exemption.

**On `reverted`, verify the tree rather than trusting the report.** Refactor restores by rewriting recorded text with `Edit`/`Write`, not `git checkout`, so an imperfect restore is possible and the coverage gate would not catch one whose uncovered-line count happened to match. Require `git status --porcelain` and `git diff HEAD` to both be empty; if either is not, **reset and clean** (see *Reverting a dispatch*) yourself and record that the agent's restore was incomplete.

Then status `done`, next item.

## Mutation pass

**An empty checklist does not end the run.** When no item is `pending`, run the
hardening pass — unless you have already run `limits.mutationRounds` of them.

Coverage gates prove code was executed. They cannot prove any test would notice
if that code were wrong. This pass finds the tests that execute without
asserting.

1. Rank the targets. With `crapMode` `native` or `computed`, compute CRAP per method and rank descending. With `crapMode: "unavailable"` there are no scores to rank by — fall back to the source files changed since the last mutation round, longest function first, and say in the report that ranking was unguided. Do not dispatch with an empty target list; that guarantees `mutantsAttempted: 0`.
2. **Verify the tree is clean before dispatching**: `git status --porcelain` and `git diff HEAD` must both be empty. `tdd-mutate`'s prompt tells it you have already done this, and it skips its own check on that basis — so if you skip it too, nobody checks. A mutate run started on a dirty tree cannot distinguish its own mutations from pre-existing edits, and its restore step would silently revert your work along with its own. Dirty → stop and report; do not dispatch.
3. Dispatch **`tdd-mutate`** with the ranked target list, `limits.mutantsPerPass`, `knownRed`, and the mutation command if one is configured.
**Restoring source is not enough — invalidate the language's compiled cache too.**
`git status` will call the tree clean, because caches are gitignored, while the
interpreter still holds bytecode compiled from the *mutated* source. Observed on
the first live pass: after a kill verification the suite reported a failure whose
traceback showed source that could not produce it, and clearing `__pycache__`
returned it to green. A false red is the lucky outcome; the same mechanism can
serve a false green from a cache compiled before a bad restore, and step 5 below
is exactly where that would be believed.

For Python, prefix the configured commands with `PYTHONDONTWRITEBYTECODE=1` so no
cache is written at all — verified to suppress `__pycache__` and to still satisfy
the guard's Bash allowlist. Other toolchains have their own caches; whatever the
language, the rule is that a restore is not complete until the cache is too.

4. On return, **verify the tree is clean**: `git status --porcelain` must be empty and `git diff HEAD` must be empty. Not clean → **reset and clean** (see *Reverting a dispatch*), record it, and do not trust the report — an agent that failed to revert may also have failed to run the suite honestly between mutants.
5. Re-run the full suite, **subtracting `knownRed`**. Every test outside that list must pass. This is the last orchestrator-side suite check that did not subtract it, and leaving it flat would dead-end every mutation pass on any run where preflight recorded a non-empty `knownRed` — reproducing the exact failure the threading rule above was added to prevent.
6. **Group survivors by `missingBehavior` first**, then append one checklist item per distinct behavior. Several mutants routinely map to a single gap — the first live pass returned four survivors of which three were "nothing asserts divide's error message" (mutated to `None`, to an `XX`-wrapped string, and to upper case). One test closes all three, so queueing three Red cycles wastes two of them. Keep every mutant in the item's `mutant` field as evidence, and report the survivor count, not the item count.

   For each distinct behavior, append:

       { "id": <next>, "behavior": "<the survivor's missingBehavior>",
         "status": "pending", "origin": "mutation",
         "mutant": { "file": ..., "line": ...,
                     "mutations": [ ...every mutant that revealed this gap... ] } }

7. Survivors found → report the count and **resume the per-item loop**. The new items run as ordinary Red→Green cycles.
8. No survivors, or `mutationRoundsRun` (read from `checklist.json`) has reached `limits.mutationRounds` → done. Read the count from the file, not from memory of this session — on a resumed run your context has no record of passes already spent.

9. Increment `mutationRoundsRun` in `checklist.json` and write the file.

That increment is a numbered step rather than trailing advice because it is the
one piece of loop state nothing else reconstructs.

If the pass skipped mutants because of `mutantsPerPass`, say how many. A capped
pass that reports "no survivors" without mentioning the cap reads as a clean
bill of health it did not earn.

**`mutantsAttempted: 0` is a failed pass, not a clean one.** No targets ranked,
a mutation tool that did not run, a CRAP computation that produced no scores —
each yields zero survivors and looks identical to a suite whose tests are
genuinely strong. Check `mutantsAttempted` before believing `survivors`, and if
it is zero, report the pass as unable to run rather than as passing.

## Completion

Done when no item is `pending`, **no item is `blocked`**, and the mutation pass
has either produced no survivors or exhausted `limits.mutationRounds`.

`blocked` is not `pending`, so a completion test that only looks for `pending`
reports success with real work outstanding. That cannot happen mid-run, because
`blocked` stops immediately — but a resumed run loading a checklist that already
contains one would sail past it. On resume, re-surface every `blocked` item and
ask the user before continuing.

Report the tally: how many items went red→green, how many were
`passing-covered`, how many `redundant`, how many originated from mutation
survivors, and how many mutants were skipped by the cap.

Note that "every item went red then green" was never the completion condition —
the `passing-covered` branch completes an item without Green ever running.

The guard needs no teardown — it is inert for any call that carries no
`tdd-*` `agent_type`.

## Escalation

Stop and return to the user on: a guardrail violation by the same agent beyond
`limits.violationRetries` re-dispatches,
Green stuck after `limits.greenAttempts`, any `blocked` outcome, or a suite that
goes red in a way Refactor did not cause. Do not loop. A stuck agent is
information the user needs, not a problem to grind on.
```

- [ ] **Step 2: Write the command entry point**

Refer to the argument in prose rather than by a substitution token. The first
live run invoked this command with the spec path arriving as a trailing
`ARGUMENTS:` line and `$1` left as the literal two characters — so
`If $1 is empty, ask the user` could never fire, because `$1` was never empty.
Whether `$1` interpolates correctly for a user typing `/tdd <path>` was not
verified either way; wording that reads the argument from context works under
both behaviours and depends on neither.

`commands/tdd.md`:

```markdown
---
description: Drive a specification to implementation through Red/Green/Refactor subagents
argument-hint: <spec-path>
---

Implement the specification whose path was given as this command's argument,
using the TDD subagent workflow.

Use the `run-tdd-cycle` skill and follow it exactly. Do not skip
preflight. Do not implement any code yourself — every line of test and source
must come from a dispatched `tdd-red`, `tdd-green`, or `tdd-refactor` agent.

If no path was given, ask the user which spec to implement.
```

- [ ] **Step 3: Verify frontmatter on both**

```bash
head -5 skills/run-tdd-cycle/SKILL.md && echo "---8<---" && head -5 commands/tdd.md
```

Expected: SKILL.md has `name` and `description`; tdd.md has `description`.

- [ ] **Step 4: Commit**

```bash
git add skills commands/tdd.md
git commit -m "feat: orchestrator skill and /tdd entry point"
```

---

## Task 9: End-to-end run against a fixture project

The first time every part runs together. Unit tests cover the guard's logic; nothing so far has verified that the loop, the agents, and the hook actually compose.

**Files:**
- Create: `e2e/` (a plain directory in THIS repo — not a nested git repo)
- Create: `e2e/spec.md`
- Create: `.tdd/config.json` (written by `/tdd-init`, committed by it)
- Create: `docs/superpowers/spikes/2026-07-30-e2e-findings.md`

**Interfaces:**
- Consumes: everything
- Produces: findings; no code consumed downstream

- [ ] **Step 1: Build the fixture project**

**The fixture lives at `e2e/` in this repo, not in a nested git repo of its own.**

An earlier draft put it at `tests/fixtures/e2e-project/` with its own `git init`. That does not work, and it was only discoverable by running it: `hooks/guard.sh` resolves the project root from `CLAUDE_PROJECT_DIR`, falling back to the payload's `cwd` — both of which are the *session's* project directory, never a subdirectory a dispatch happens to be working in. Verified with a live `tdd-red` dispatch against this repo: the guard looked for `.tdd/config.json` at the repo root and denied with "run /tdd-init". A config written inside a nested fixture is a config the guard will never read, so every agent call would be denied for the whole run.

So: one git repo (this one), `.tdd/config.json` at its root, and globs scoped to the fixture. `e2e/` rather than `tests/fixtures/…` because our own `tests/**` would otherwise collide with the fixture's test glob — `*` crosses `/` in the matcher, so `tests/**` would match both our `rules.test.sh` and the fixture's `test_calc.py`, and the partition check requires each tracked file to match exactly one list.

The `red:`/`green:` commits this produces land in this branch's history. That is intended — they are the run's evidence.

A Python project with pytest, and — critically — **one behavior already implemented**, so the `passing-covered` or `passing-flat` branch actually executes. A fixture where every item goes red→green would leave the branch that most complicates the orchestrator completely untested.

```bash
mkdir -p e2e/src/calc e2e/tests
```

`e2e/src/calc/__init__.py`:

```python
def add(a, b):
    return a + b
```

`tests/test_smoke.py`:

```python
from calc import add


def test_add_exists():
    assert add(1, 1) == 2
```

`pyproject.toml`:

```toml
[project]
name = "calc"
version = "0.1.0"

[tool.pytest.ini_options]
pythonpath = ["src"]
```

`spec.md`:

```markdown
# Calculator

1. `add(a, b)` returns the sum of two numbers.
2. `subtract(a, b)` returns the difference.
3. `divide(a, b)` raises `ValueError` when `b` is zero.
```

Item 1 is already implemented — that is deliberate.

```bash
git add e2e && git commit -q -m "test(plugin): add e2e fixture project"
python -m pytest -q e2e
```

Expected: 1 passed. No `git init` — this repo is the git context, and the audit,
the revert, and the per-phase commits all operate on it.

- [ ] **Step 2: Install the plugin locally and restart**

Add `claude-tdd` as a local marketplace, install it, restart Claude Code so `hooks/hooks.json` loads. Confirm `/tdd` and `/tdd-init` appear.

**`/plugin install` copies the repo into a cache snapshot at
`~/.claude/plugins/cache/claude-tdd/claude-tdd/<version>/`. Edits to the repo do
not take effect until you reinstall — `/reload-plugins` re-reads the cache, it
does not refresh it.** Verified during Task 6 step 6, where a fixed `guard.sh`
sat in the repo while the stale copy ran. Before trusting any live run in this
task, confirm the two agree:

```bash
diff -rq hooks "$HOME/.claude/plugins/cache/claude-tdd/claude-tdd/0.1.0/hooks"
```

Silence means they match. Any output means you are testing code you did not
write, and a passing run proves nothing.

- [ ] **Step 3: Run `/tdd-init` and check the partition**

Run it from the repo root. The partition covers **every tracked file in this
repo**, not just the fixture, because that is the set `git ls-files` returns and
the set the guard's read denylist is judged against.

Expected globs:

- `test`: `e2e/tests/**`
- `source`: `e2e/src/**`
- `ignore`: everything else — `agents/**`, `commands/**`, `hooks/**`, `skills/**`, `tests/**`, `docs/**`, `.claude/**`, `*.md`, `.gitignore`, `e2e/*.toml`, `e2e/*.md`

Expected behaviour: it detects pytest, proposes globs, and **refuses to write
until every tracked file is classified**. That refusal is the partition check
working. If it writes a config while leaving files unclassified, Task 7 step 4
was not implemented correctly.

Watch for the collision the layout was chosen to avoid: `*` crosses `/` in the
matcher, so a `tests/**` test-glob would also swallow our own `tests/rules.test.sh`
and the partition check should report the overlap.

Confirm it committed its own output:

```bash
git status --porcelain
```

Expected: empty.

- [ ] **Step 4: Run `/tdd spec.md` and observe all three branches**

Watch for:
- **Item 1** resolves via `passing-covered` or `passing-flat` with **no Green dispatch**. This is the branch most likely to be implemented wrong.
- **Items 2 and 3** go red → green, each producing two commits.
- No `.tdd/phase` file is ever created; the guard keys off `agent_type`.
- The orchestrator runs coverage before each Green dispatch and after each return.

Item 3 (`divide` raising on zero) is the deliberate coverage-gate probe. A
minimal implementation must write `return a / b` to make the module importable
and the error branch reachable, and the divide-by-zero test never executes that
line. Expect roughly one new uncovered line — **within** the default allowance
of 2, so it should pass the gate. If the orchestrator rejects it, the threshold
or the counting is wrong. If Green instead writes type checks, negative-number
handling, or a docstring-driven general implementation, expect a rejection and
a re-dispatch — which is the gate working.

- [ ] **Step 4b: Verify the coverage gate rejects, not just accepts**

The gate is the newest logic and Step 4 only exercised its passing path. Test
the rejection deterministically rather than hoping an agent overbuilds.

Capture the baseline:

```bash
python -m pytest -q --cov --cov-report=json:.tdd/coverage.json >/dev/null
jq '[.files[].summary.missing_lines] | add' .tdd/coverage.json
```

Record that number. Now append a function no test calls:

```bash
cat >> src/calc/__init__.py <<'EOF'


def unused(a, b, c):
    if a > b:
        return c
    if b > c:
        return a
    if a == b:
        return b
    return None
EOF
python -m pytest -q --cov --cov-report=json:.tdd/coverage.json >/dev/null
jq '[.files[].summary.missing_lines] | add' .tdd/coverage.json
```

Expected: the second number exceeds the first by clearly more than
`greenMaxNewUncovered` of 2. Do not hard-code an expected delta — `missing_lines`
counts executable body lines only, and the `def` line runs at import so it is
never missing. The exact figure depends on how coverage.py counts the branches;
what matters is that the delta is unambiguously above the threshold. Confirm the
orchestrator's extraction produces the same delta by hand-running the comparison
it performs.

**This step exists to catch a silent parser failure.** Reading uncovered lines
out of a coverage report is the most toolchain-specific piece of the design. An
extractor that returns `0` on a JSON shape it does not recognize would disable
all three gates while every other check in this plan still passes. If both
numbers come back `0` or `null`, the extraction is broken — fix it before
shipping, and record the working `jq` expression in the orchestrator skill.

```bash
git checkout -- src/calc/__init__.py
```

- [ ] **Step 5: Verify the guard actually fired**

The single highest-value check in this task. Everything else can pass while the hook sits inert, and an inert hook means read isolation was never enforced.

```bash
git log --oneline
git log --format='%s' | grep -c '^red:'
git log --format='%s' | grep -c '^green:'
python -m pytest -q
```

Expected: alternating `red:`/`green:` commits, at least one `test:` or a `redundant` item, and all tests passing.

Then confirm the hook is live rather than merely installed:

```bash
printf '{"hook_event_name":"PreToolUse","agent_type":"tdd-red","agent_id":"probe","tool_name":"Read","tool_input":{"file_path":"%s/src/calc/__init__.py"}}' "$PWD" \
  | TDD_PROJECT_DIR="$PWD" bash ../../../hooks/guard.sh; echo "exit=$?"
```

Expected: `exit=2` with a denial mentioning that Red may not read source.

If Task 1 found denials are *correctable*, also confirm from the transcript that at least one agent hit a denial and recovered. If no agent ever tripped the guard, you have not observed it working in situ — note that explicitly rather than assuming.

- [ ] **Step 6: Record findings and commit**

Write `docs/superpowers/spikes/2026-07-30-e2e-findings.md`: which branches executed, whether the guard fired in situ, any denial text agents saw, and every point where the orchestrator needed judgment the skill did not specify. That last list is the backlog for v0.2.

```bash
git add e2e docs/superpowers/spikes
git commit -m "test: end-to-end fixture run and findings"
```

- [ ] **Step 7: Full suite green**

```bash
bash tests/run.sh
```

Expected: all passing, exit 0.

---

## Task 10: Mutation hardening pass end-to-end

Task 9 verified the Red/Green/Refactor loop. This verifies the pass that runs
after it, and the CRAP trigger that targets it.

**Files:**
- Modify: `e2e/tests/test_calc.py`
- Create: `docs/superpowers/spikes/2026-07-30-mutation-findings.md`

**Interfaces:**
- Consumes: everything, plus a completed Task 9 run
- Produces: findings only

- [ ] **Step 1: Plant a test that covers without asserting**

This is the exact defect mutation testing exists to find, and the one coverage
cannot see. In the fixture, replace the `divide` test with one that executes the
happy path but asserts nothing about it:

```python
def test_divide_runs():
    divide(10, 2)          # executes the line, asserts nothing


def test_divide_by_zero():
    with pytest.raises(ValueError):
        divide(1, 0)
```

```bash
python -m pytest -q --cov --cov-report=json:.tdd/coverage.json
jq '.files["src/calc/__init__.py"].summary.percent_covered' .tdd/coverage.json
```

Expected: coverage reports the `return a / b` line as **covered**, because
`test_divide_runs` executes it. Coverage is satisfied; the behavior is
unprotected. Record this number — it is the baseline claim the mutation pass is
about to refute.

- [ ] **Step 2: Confirm CRAP ranks the right method**

```bash
radon cc -j -s src | jq .
```

Cross-reference with per-method coverage and compute
`comp² × (1 − cov)³ + comp` by hand for `divide`. Confirm the orchestrator's
computation matches yours.

**If every method comes back at coverage 1.0**, the line-range mapping is
broken — that is the specific failure this step exists to catch, and it would
otherwise present as "no triggers fired," indistinguishable from healthy code.

- [ ] **Step 3: Run the mutation pass and confirm the survivor**

Run `/tdd spec.md` to completion. When the checklist empties, the mutation pass
should fire.

Expected: mutating `return a / b` to `return a * b` (or similar) **survives** —
`test_divide_runs` calls it and asserts nothing, `test_divide_by_zero` never
reaches that line. The pass reports one survivor with a `missingBehavior` along
the lines of "divide returns the quotient."

- [ ] **Step 4: Verify the revert discipline**

The single most important check in this task. An agent that mutates and fails
to revert corrupts the source tree, and the corruption looks like ordinary
implementation drift.

```bash
git status --porcelain
git diff HEAD --stat
```

Expected: both empty after the pass returns, before any new items are worked.

- [ ] **Step 5: Confirm the survivor becomes a Red item and closes the loop**

Expected: a new checklist item with `"origin": "mutation"`, which then runs a
normal Red→Green cycle. Red writes a test asserting the quotient; Green may need
no change at all, since the code was already correct — so this item plausibly
resolves via `passing-covered`.

That outcome is correct and worth confirming rather than treating as a bug: the
mutant proved the *test* was weak, not the code. The workflow's response to a
weak test is a better test, not new source.

- [ ] **Step 6: Verify termination**

Run the pass again. Expected: no survivors, and the run completes. Confirm the
orchestrator stops rather than looping, and that it respects
`limits.mutationRounds` if survivors persist.

Also confirm it reports how many mutants `mutantsPerPass` skipped. A capped pass
reporting "no survivors" without naming the cap is a clean bill of health it did
not earn.

- [ ] **Step 7: Record findings and commit**

Write `docs/superpowers/spikes/2026-07-30-mutation-findings.md`: whether the
planted weak test was caught, whether CRAP ranked it, whether the tree stayed
clean, wall-clock for the pass, and whether hand-mutation or a tool was used.

Wall-clock matters most for whether this ships enabled by default. If a
three-function fixture takes minutes, the pass needs to be opt-in on real
projects.

```bash
git add e2e docs/superpowers/spikes
git commit -m "test: mutation hardening pass end-to-end"
```

- [ ] **Step 8: Full suite green**

```bash
bash tests/run.sh
```

Expected: all passing, exit 0.

---

## Deferred to v0.2

Named here so they are visible decisions rather than oversights:

- **Parallel cycles.** Now unblocked in principle — dropping the phase marker for `agent_type` removed the shared mutable state that made concurrency unsafe. Still unimplemented: the checklist, the git baseline, and the coverage baselines are all single-valued and would need per-cycle scoping.
- **Resume UX.** `checklist.json` makes resume *possible*; `/tdd` does not yet detect a partial run and offer to continue.
- **Coverage baseline caching.** Coverage now runs several times per cycle — preflight, before and after each Green, before and after each Refactor. On a large suite that dominates wall-clock. Incremental or per-file coverage would fix it.
- **Portable coverage and complexity parsing.** Each toolchain reports uncovered lines, and per-method complexity, in its own JSON shape. v0.1 handles both ad hoc in the orchestrator skill; a small extractor per toolchain, unit-tested against captured fixtures, belongs in `hooks/lib/`. This is the largest single source of silent-failure risk in the design.
- **Mutation pass cost control.** `mutantsPerPass` is a blunt cap. Incremental mutation — only methods whose source changed since the last pass — would make the pass affordable on a real codebase.
- **Mutation operators as config.** v0.1 hardcodes the operator list in the agent prompt. Projects with domain-specific invariants may want their own.
- **Non-git projects.** The audit requires git. No fallback is planned.
