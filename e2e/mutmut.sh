#!/usr/bin/env bash
# Wrapper so the mutation command is a single argv the guard's Bash allowlist
# can match. mutmut must run from e2e/ -- it copies source into ./mutants/ and
# resolves the test selection relative to that -- but agents are dispatched
# from the repo root, and `cd e2e && mutmut` would trip the metacharacter ban.
#
# It also removes ./mutants/ afterwards. Leaving it behind permanently breaks
# the configured test command: pytest given an explicit path walks into
# mutants/tests/, whose copied test files import mutmut's trampoline, which
# looks for [mutmut] config relative to cwd (the repo root) rather than e2e/,
# and dies with FileNotFoundError. The mutate role cannot clean it up itself --
# no `rm` in its allowlist -- so the wrapper must.
set -euo pipefail
cd "$(dirname "$0")"
trap 'rm -rf mutants' EXIT
exec_status=0
.venv/bin/mutmut "$@" || exec_status=$?
exit "$exec_status"
