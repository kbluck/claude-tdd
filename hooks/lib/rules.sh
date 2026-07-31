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
