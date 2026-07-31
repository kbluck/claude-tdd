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
