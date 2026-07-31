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
        "matcher": "Read|Write|Edit|Bash",
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
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
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

for t in "$TESTS_DIR"/*.test.sh; do
  [ -e "$t" ] || continue
  printf '\n--- %s ---\n' "$(basename "$t")"
  # shellcheck disable=SC1090
  . "$t"
done

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
  - `tdd_matches_any <path> <glob1> [glob2 ...]` → exit 0 if any glob matches
  - `tdd_path_verdict <phase> <mode> <path> <test_globs> <source_globs>` → echoes `allow` or `deny: <reason>`. Glob arguments are **space-separated strings**, not arrays — Bash 3.2 has no associative arrays and passing arrays through function boundaries is not worth the complexity here.

**Design notes the implementer needs:**

*Glob semantics.* Inside `[[ ]]`, an unquoted pattern's `*` matches `/` as well as any other character — unlike shell filename globbing. So `tests/*` already matches `tests/a/b.py`. Config files write `tests/**` for readability; normalize `**` to `*` before matching. Write the substitution as `${1//\*\*/*}` — in `${var//pattern/replacement}` the replacement half is *not* a pattern, so writing `\*` there can leave a literal backslash on some Bash versions.

*Why writes are an allowlist and reads a denylist.* A write must match the role's permitted globs. A read must merely not match the forbidden ones, because agents legitimately read `README.md`, `pyproject.toml`, and type stubs, and an allowlist would fight them constantly. This is only sound because `/tdd-init` (Task 7) proves the test/source/ignore globs partition every tracked file — otherwise an unclassified source file would be readable by Red.

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
  "empty phase denies"
assert_contains "deny" "$(tdd_path_verdict bogus write src/a.py "$TG" "$SG")" \
  "unknown phase denies"
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash tests/run.sh`
Expected: FAIL — `hooks/lib/rules.sh: No such file or directory`

- [ ] **Step 3: Write the implementation**

`hooks/lib/rules.sh`:

```bash
# Pure decision functions for the TDD guard hook.
# Sourced, never executed. No I/O, no globals, no side effects.

# tdd_glob_match <pattern> <path>
# Returns 0 on match. `**` is normalized to `*` because inside [[ ]] a
# pattern's `*` already crosses `/`.
tdd_glob_match() {
  local pat="${1//\*\*/*}"
  local path="$2"
  [[ "$path" == $pat ]]
}

# tdd_matches_any <path> <glob>...
tdd_matches_any() {
  local path="$1"; shift
  local g
  for g in "$@"; do
    tdd_glob_match "$g" "$path" && return 0
  done
  return 1
}

# tdd_path_verdict <phase> <mode> <path> <test_globs> <source_globs>
# Echoes "allow" or "deny: <reason>".
tdd_path_verdict() {
  local phase="$1" mode="$2" path="$3"
  local test_globs="$4" source_globs="$5"

  case "$phase:$mode" in
    red:write)
      if tdd_matches_any "$path" $test_globs; then echo "allow"
      else echo "deny: Red may only write test files; $path is not under the configured test globs"; fi ;;
    red:read)
      if tdd_matches_any "$path" $source_globs; then
        echo "deny: Red may not read source files; $path is under the configured source globs"
      else echo "allow"; fi ;;
    green:write|refactor:write|mutation:write)
      if tdd_matches_any "$path" $source_globs; then echo "allow"
      else echo "deny: ${phase} may only write source files; $path is not under the configured source globs"; fi ;;
    green:read|refactor:read|mutation:read)
      if tdd_matches_any "$path" $test_globs; then
        echo "deny: ${phase} may not read test files; $path is under the configured test globs. Work from the handover report and the test runner's output."
      else echo "allow"; fi ;;
    *)
      echo "deny: unknown phase '${phase}' or mode '${mode}'; the guard fails closed" ;;
  esac
}
```

Note the deliberately unquoted `$test_globs` / `$source_globs` at the call sites — word splitting is how the space-separated string becomes multiple arguments.

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
  # trim trailing whitespace from the prefix
  while [ "${prefix% }" != "$prefix" ]; do prefix="${prefix% }"; done

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

Paths from the payload are absolute; strip the `$root/` prefix before matching, since globs are repo-relative.

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

# An agent this plugin does not own is none of our business, even if its
# name happens to start with tdd-. Permitting is correct here; the guard
# constrains exactly the four roles it defines and nothing else.
out=$(run_guard "tdd-bogus" payload_write "$SANDBOX/src/a.py")
assert_eq "0|" "$out" "unrecognized tdd-* agent permits"

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
  case "$input" in
    *'"agent_type":"tdd-'*)
      deny "tdd guard: jq is not on PATH; cannot evaluate tool calls safely. Run /tdd-init." ;;
    *) exit 0 ;;
  esac
fi

agent=$(printf '%s' "$input" | jq -r '.agent_type // empty')
[ -n "$agent" ] || exit 0        # main thread / orchestrator — never constrained

case "$agent" in
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

case "$tool" in
  Read)        mode=read ;;
  Write|Edit)  mode=write ;;
  Bash)        mode=bash ;;
  *)           exit 0 ;;
esac

if [ "$mode" = "bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

  # The phase's own runner command, plus the coverage command — every role is
  # measured on coverage, so every role may measure itself.
  # Each phase gets its own runner command plus the measurement commands it
  # is judged on. Every role is measured on coverage, so every role may
  # measure itself.
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

path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -n "$path" ] && exit 0   # no path to judge

rel="${path#"$root"/}"
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
        "matcher": "Read|Write|Edit|Bash",
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

Flip exactly one condition in `hooks/guard.sh`:

```bash
sed -i.bak 's/\[ -z "\$path" \] && exit 0/[ -n "$path" ] \&\& exit 0/' hooks/guard.sh
bash tests/run.sh; echo "exit=$?"
```

Expected: **failures**, specifically the deny assertions (`red writing source
exits 2` reporting `0|`), and a non-zero exit. That inversion permits every
path instead of skipping only empty ones — a silently-disabled guard, and the
exact failure mode nothing else in the design detects, since reads leave no
trace in a diff.

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

All four files use frontmatter `name`, `description`, `tools`, `model`. `tools` is `Read, Write, Edit, Bash, Grep, Glob` for all of them — path scoping is the hook's job, not the frontmatter's.

**The `name:` field is load-bearing.** The guard's dispatch table matches on it via the payload's `agent_type`, so `name: tdd-red` must be exact. A typo does not fail loudly — it makes the guard fall through to "not our agent" and permit everything that agent does.

Mutation ships as its own agent rather than a mode on `tdd-refactor` precisely because the guard keys on identity: a separate `agent_type` gets a separate Bash allowlist for free. `tdd-refactor` needs the complexity command, `tdd-mutate` needs the mutation command, and neither should have the other's.

Word Q2's guidance from Task 1's spike into each agent's prompt: if denials are correctable, tell the agent a denial means "you strayed, adjust and continue"; if fatal, tell it to check its boundaries before acting rather than probing.

- [ ] **Step 1: Write `agents/tdd-red.md`**

```markdown
---
name: tdd-red
description: Authors exactly one failing test from a specification. Never reads or writes source code. Use only as part of the TDD cycle.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

You author tests. You never author, read, or modify source code.

A `PreToolUse` guard enforces this. If a tool call is denied, you have strayed
outside your role — do not work around it, adjust and continue.

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
     - Coverage unchanged → `outcome: "passing-flat"`. The test adds nothing. Delete it and report.
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
description: Writes the minimum source code to turn one failing test green. Never reads or writes test code. Use only as part of the TDD cycle.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

You write source code. You never author, read, or modify test code.

A `PreToolUse` guard enforces this. If a tool call is denied, you have strayed
outside your role — do not work around it, adjust and continue.

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
description: Improves existing source code while holding public interfaces and test results constant. Never reads or writes test code, never adds behavior. Use only as part of the TDD cycle.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

You improve existing source code. You add no behavior and no public interface.

A `PreToolUse` guard enforces this. If a tool call is denied, you have strayed
outside your role — do not work around it, adjust and continue.

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

1. Run the full suite. Record the exact pass/fail counts. **If anything already fails, stop and report — you cannot distinguish your breakage from pre-existing breakage.**
2. Run the coverage command. Record the uncovered line count.
3. Make the improvement the trigger calls for. Nothing else.
4. Run the full suite again, then coverage again.
5. Counts differ, any previously-passing test now fails, or uncovered lines increased → revert your change entirely and report `reverted`. Do not attempt a fix; a refactor that breaks tests or adds uncovered code is a failed refactor.
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
description: Probes test strength by deliberately breaking source code and observing whether tests notice. Reverts every change. Never reads or writes test code, never fixes anything. Use only as part of the TDD cycle's hardening pass.
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

You break source code on purpose to find tests that do not actually test.

A `PreToolUse` guard enforces your boundaries. If a tool call is denied, you
have strayed outside your role — do not work around it, adjust and continue.

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

1. Run the full suite. It must be green. If not, stop and report `blocked` — you cannot tell a killed mutant from a pre-existing failure.
2. `git status --porcelain` must be empty. If not, stop and report `blocked`; you cannot safely revert onto a dirty tree.
3. If a mutation tool is configured, run it and collect results. Otherwise hand-mutate, working through the target methods you were given in CRAP order, highest first — that is where untested complexity is concentrated.
4. For each mutant, up to the cap you were given:
   - Apply exactly one small semantic change: flip a comparison (`>` ↔ `>=`), invert a boolean, swap an operator (`+` ↔ `-`), replace a return value with a constant, remove a statement.
   - Run the full suite.
   - Suite fails → **killed**. The tests caught it. Good.
   - Suite passes → **survived**. Record file, line, the original code, the mutation, and which method it was in.
   - `git checkout -- <file>` before the next mutant. Always. Do not batch mutations.
5. After the last mutant, verify the tree is clean and the suite is green again. Report.

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

Expected: each reports frontmatter valid. The validator also checks for `model` and `color`; `color` is optional for our purposes — if it warns, that is acceptable, but an error on `name`, `description`, or frontmatter structure must be fixed.

- [ ] **Step 5: Verify the handover contract is consistent across files**

```bash
grep -c 'publicApi' agents/tdd-red.md agents/tdd-green.md
```

Expected: non-zero for both. Red produces the field, Green consumes it; a rename in one file without the other silently breaks the handoff.

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

## 4. Verify the partition is exhaustive — do not skip this

Every tracked file must match exactly one of the three lists.

    git ls-files

For each path, check it against `test`, then `source`, then `ignore`. Report
every unclassified file to the user and extend the globs until none remain.

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

For each of `test`, `single`, and `coverage`, the static prefix is everything
before the first `{`. Confirm the command is runnable as written. A template
*may* contain shell metacharacters — those are trusted — but warn the user if
one does, because the agent will not be able to add arguments beyond the
static prefix without tripping the metacharacter ban on the delta.

## 7. Write the files

`.tdd/config.json`:

    {
      "version": 1,
      "commands": { "test": "...", "single": "...", "coverage": "..." },
      "globs": { "test": [...], "source": [...], "ignore": [...] },
      "refactorTriggers": { "maxFunctionLines": 40, "duplicateThreshold": 3 },
      "limits": { "greenAttempts": 3, "violationRetries": 1 },
      "coverageGates": { "greenMaxNewUncovered": 2, "refactorMaxNewUncovered": 0 }
    }

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

## Preflight — all six, in order, before any dispatch

1. **Git repo, clean tree.** The audit's revert is `git reset --hard`, which would destroy uncommitted work. Dirty → stop, ask the user to commit or stash.
2. **`.tdd/config.json` exists.** Missing → tell the user to run `/tdd-init`. Do not write one yourself.
3. **`jq` on PATH.** Missing → stop. The guard fails closed without it and would deny every tool call.
4. **The full suite passes.** Run the configured test command. Green's stop condition is "this test now passes" and Refactor's is "all tests still pass" — both are meaningless against an already-red suite. If red, list the failing test IDs, ask the user whether to proceed, and if so record them as a known-red allowlist excluded from every later comparison.
5. **The glob partition is still exhaustive.** `git ls-files`; every path must match `test`, `source`, or `ignore`. Drift since init → stop and tell the user to re-run `/tdd-init`. This is what makes the guard's read denylist sound.
6. **Spec file readable and non-empty.**
7. **The guard actually sees `agent_type`.** Dispatch a throwaway subagent told to read one file under `globs.source` while claiming no role, then confirm the guard evaluated it. Cheaper equivalent: dispatch `tdd-red` with the instruction "read `<a source file>` and report the first line" and confirm it comes back **denied**.

   If that read succeeds, the guard is not seeing `agent_type`, every subagent looks like the orchestrator, and **read isolation is silently absent**. Stop. Do not run unenforced — reads leave no trace in a diff, so nothing downstream would ever notice. `agent_type` is undocumented (found empirically on Claude Code 2.1.220) and this is the check that catches it disappearing.

There is no phase marker to clear — the guard identifies callers from the
payload's `agent_type`.

## Decompose

Read the spec once. Write `.tdd/checklist.json`:

    {
      "spec": "<path>",
      "knownRed": ["<test ids excluded from comparisons>"],
      "items": [
        { "id": 1, "behavior": "<one testable behavior>", "status": "pending" }
      ]
    }

Items may also carry `"overbuilt": true`, set by the Green coverage gate. It is
a flag for review, not a status — the item still reaches `done`.

Each item is **one** behavior, small enough for a single test. Order them so
earlier items do not depend on later ones.

**Show the checklist to the user and get approval before the first dispatch.**
Bad decomposition is cheap to fix here and expensive to fix on cycle 9.

`status`: `pending` → `red` → `green` → `done`, or terminating at `redundant`
or `blocked`. Write the file after every transition — an interrupted run
resumes from this file, not from your context.

## Coverage baselines

All three roles are gated on coverage, and every gate compares against a
baseline you capture. Skip all of this if `commands.coverage` is null.

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
3. On return, **audit**: `git diff --name-only` plus `git status --porcelain`. Every touched path must match `globs.test`. Violation → `git checkout -- .`, re-dispatch once quoting the rule and the offending path. Second violation → stop, escalate.
4. Branch on `outcome`:
   - `failing` → commit `red: <behavior>`, status `red`, continue to Green.
   - `passing-covered` → **re-measure coverage yourself before committing.** This branch writes a commit and skips Green entirely on the strength of a number the agent computed about its own work; it is the one place nothing else would catch a wrong answer. Delta confirmed → commit `test: <behavior>`, status `done`, next item. Delta not confirmed → treat as `passing-flat`.
   - `passing-flat` → `git checkout -- .`, status `redundant`, next item.
   - `blocked` → status `blocked`, record the reason, **stop and escalate**.

`blocked` is not `redundant`. `redundant` means a test was written, passed, and
moved no coverage — the behavior is genuinely already covered. `blocked` means
Red failed to do its job. Collapsing them would silently drop a spec item as
"already covered" when nothing verified it.

### Green

1. Dispatch `tdd-green` with **only** Red's handover report. Do not paste the test source — that is the whole point of the separation.
2. On return, audit as above against `globs.source`.
3. `outcome: stuck` → stop and escalate with the agent's attempts.
5. Independently verify: run the configured single-test command against `testId` yourself. Do not take the agent's word for it.
6. **Coverage gate** (skip entirely if `commands.coverage` is null, or if the baseline reports zero total lines):
   - Run the coverage command. Compute new uncovered lines against the pre-dispatch baseline.
   - Within `coverageGates.greenMaxNewUncovered` → commit `green: <behavior>`, status `green`.
   - Over → `git checkout -- .` and re-dispatch once, naming the specific uncovered file:line ranges and instructing Green to implement only what the test drives.
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

On dispatch: pass the trigger and the source paths in scope. Audit against
`globs.source`.

Then apply the **hard coverage gate**: run coverage yourself and compare against
the pre-dispatch baseline. Any increase in uncovered lines beyond
`coverageGates.refactorMaxNewUncovered` (default 0) → `git reset --hard HEAD`
and record `reverted`, regardless of what the agent reported. New uncovered
lines mean new behavior, and Refactor adding behavior is a boundary violation,
not a quality issue. There is no re-dispatch — reverting is the correct outcome.

`improved` and gate passed → commit `refactor: <behavior>`. `reverted` or
`blocked` → record it and continue; a failed refactor is not a failed cycle.

Then status `done`, next item.

## Mutation pass

**An empty checklist does not end the run.** When no item is `pending`, run the
hardening pass — unless you have already run `limits.mutationRounds` of them.

Coverage gates prove code was executed. They cannot prove any test would notice
if that code were wrong. This pass finds the tests that execute without
asserting.

1. Compute CRAP for every method and rank descending. Dispatch **`tdd-mutate`** with the ranked target list, `limits.mutantsPerPass`, and the mutation command if one is configured.
3. On return, **verify the tree is clean**: `git status --porcelain` must be empty and `git diff HEAD` must be empty. Not clean → `git reset --hard HEAD`, record it, and do not trust the report — an agent that failed to revert may also have failed to run the suite honestly between mutants.
4. Re-run the full suite. It must be green.
5. For each survivor, append a checklist item:

       { "id": <next>, "behavior": "<the survivor's missingBehavior>",
         "status": "pending", "origin": "mutation",
         "mutant": { "file": ..., "line": ..., "mutation": ... } }

6. Survivors found → report the count and **resume the per-item loop**. The new items run as ordinary Red→Green cycles.
7. No survivors, or `limits.mutationRounds` reached → done.

If the pass skipped mutants because of `mutantsPerPass`, say how many. A capped
pass that reports "no survivors" without mentioning the cap reads as a clean
bill of health it did not earn.

## Completion

Done when no item is `pending` **and** the mutation pass has either produced no
survivors or exhausted `limits.mutationRounds`.

Report the tally: how many items went red→green, how many were
`passing-covered`, how many `redundant`, how many originated from mutation
survivors, and how many mutants were skipped by the cap.

Note that "every item went red then green" was never the completion condition —
the `passing-covered` branch completes an item without Green ever running.

The guard needs no teardown — it is inert for any call that carries no
`tdd-*` `agent_type`.

## Escalation

Stop and return to the user on: a second guardrail violation by the same agent,
Green stuck after `limits.greenAttempts`, any `blocked` outcome, or a suite that
goes red in a way Refactor did not cause. Do not loop. A stuck agent is
information the user needs, not a problem to grind on.
```

- [ ] **Step 2: Write the command entry point**

`commands/tdd.md`:

```markdown
---
description: Drive a specification to implementation through Red/Green/Refactor subagents
argument-hint: <spec-path>
---

Implement the specification at `$1` using the TDD subagent workflow.

Use the `run-tdd-cycle` skill and follow it exactly. Do not skip
preflight. Do not implement any code yourself — every line of test and source
must come from a dispatched `tdd-red`, `tdd-green`, or `tdd-refactor` agent.

If `$1` is empty, ask the user which spec to implement.
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
- Create: `tests/fixtures/e2e-project/` (a real git repo)
- Create: `tests/fixtures/e2e-project/spec.md`
- Create: `docs/superpowers/spikes/2026-07-30-e2e-findings.md`

**Interfaces:**
- Consumes: everything
- Produces: findings; no code consumed downstream

- [ ] **Step 1: Build the fixture project**

A Python project with pytest, and — critically — **one behavior already implemented**, so the `passing-covered` or `passing-flat` branch actually executes. A fixture where every item goes red→green would leave the branch that most complicates the orchestrator completely untested.

```bash
mkdir -p tests/fixtures/e2e-project/src/calc tests/fixtures/e2e-project/tests
cd tests/fixtures/e2e-project
```

`src/calc/__init__.py`:

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
git init -q && git add -A && git commit -q -m "fixture: initial calc project"
python -m pytest -q
```

Expected: 1 passed.

- [ ] **Step 2: Install the plugin locally and restart**

Add `claude-tdd` as a local marketplace, install it, restart Claude Code so `hooks/hooks.json` loads. Confirm `/tdd` and `/tdd-init` appear.

- [ ] **Step 3: Run `/tdd-init` in the fixture and check the partition**

Expected: detects pytest, proposes `src/**` and `tests/**`, flags `pyproject.toml` and `spec.md` as needing `ignore` entries, and refuses to write until they are classified. That refusal is the partition check working — if it writes a config while leaving files unclassified, Task 7 step 4 was not implemented correctly.

Confirm it committed its own output:

```bash
git -C tests/fixtures/e2e-project status --porcelain
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
cd tests/fixtures/e2e-project
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
cd tests/fixtures/e2e-project
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
git add tests/fixtures docs/superpowers/spikes
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
- Modify: `tests/fixtures/e2e-project/tests/test_calc.py`
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
cd tests/fixtures/e2e-project
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
git -C tests/fixtures/e2e-project status --porcelain
git -C tests/fixtures/e2e-project diff HEAD --stat
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
git add tests/fixtures docs/superpowers/spikes
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
