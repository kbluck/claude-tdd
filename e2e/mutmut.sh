#!/usr/bin/env bash
# Wrapper so the mutation command is a single argv the guard's Bash allowlist
# can match. mutmut must run from e2e/ -- it copies source into ./mutants/ and
# resolves the test selection relative to that -- but agents are dispatched
# from the repo root, and `cd e2e && mutmut` would trip the metacharacter ban.
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/mutmut "$@"
