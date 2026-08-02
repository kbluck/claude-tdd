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

# tdd_bash_verdict <command> <template>
# Echoes "allow" or "deny: <reason>".
#
# The command must begin with the template's static prefix (everything
# before the first `{` placeholder). Whatever the agent added beyond that
# prefix — the delta — must contain no shell metacharacters. The template
# itself is trusted and may contain them.
#
# Both parameters default to empty, matching tdd_path_verdict above: this
# file is sourced under `set -u`, where an unset positional aborts the whole
# sourcing script. An aborted guard exits non-zero-but-not-2, which is
# treated as a non-blocking error and lets the tool call through. A caller
# bug must degrade to deny, never to a crash that permits.
tdd_bash_verdict() {
  local cmd="${1:-}" template="${2:-}"

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
