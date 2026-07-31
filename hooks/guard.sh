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

# Every file-writing tool must map to a mode. Hook matchers are unanchored
# regex, so `Edit` in the matcher also delivers `MultiEdit` and
# `NotebookEdit` -- and an unmapped tool that fell through to `exit 0` would
# be silently permitted to write source. Unknown tools deny: if the matcher
# delivered something this case does not know, the safe answer is no.
case "$tool" in
  Read)                          mode=read ;;
  Write|Edit|MultiEdit)          mode=write ;;
  NotebookEdit)                  mode=write ;;
  Bash)                          mode=bash ;;
  *) deny "tdd guard: ${agent} called an unrecognized tool '${tool}'; the guard cannot classify it and fails closed" ;;
esac

if [ "$mode" = "bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

  # The phase's own runner command, plus the coverage command — every role is
  # measured on coverage, so every role may measure itself.
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

# NotebookEdit uses notebook_path, not file_path.
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')

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

case "$path" in
  "$root"/*) rel="${path#"$root"/}" ;;   # inside the project
  *)         rel="$path" ;;              # already relative, or outside the project
esac

verdict=$(tdd_path_verdict "$role" "$mode" "$rel" "$test_globs" "$source_globs")
[ "$verdict" = "allow" ] && exit 0
deny "$verdict"
