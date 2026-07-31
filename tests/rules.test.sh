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
