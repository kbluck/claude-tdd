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
