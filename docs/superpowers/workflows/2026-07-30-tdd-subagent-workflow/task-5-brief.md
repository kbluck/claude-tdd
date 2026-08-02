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

