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

FOUND=0
for t in "$TESTS_DIR"/*.test.sh; do
  [ -e "$t" ] || continue
  FOUND=1
  printf '\n--- %s ---\n' "$(basename "$t")"
  BEFORE=$((PASS + FAIL))
  # shellcheck disable=SC1090
  . "$t"
  if [ "$((PASS + FAIL))" -eq "$BEFORE" ]; then
    printf '  FAIL: %s contributed no assertions\n' "$(basename "$t")"
    FAIL=$((FAIL + 1))
  fi
done

if [ "$FOUND" -eq 0 ]; then
  printf '\n  FAIL: no *.test.sh files found in %s\n' "$TESTS_DIR"
  FAIL=$((FAIL + 1))
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
