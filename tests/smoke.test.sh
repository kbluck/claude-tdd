# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.

assert_eq "hello" "$(printf 'hello')" "harness compares equal strings"
assert_contains "ell" "hello" "harness finds a substring"
