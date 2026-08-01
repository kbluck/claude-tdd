## Task 2: Plugin skeleton, manifest, and test harness

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `tests/run.sh`
- Create: `tests/smoke.test.sh`

**Interfaces:**
- Consumes: nothing
- Produces: `assert_eq <expected> <actual> <name>` and `assert_contains <needle> <haystack> <name>`, available to every later `*.test.sh`. Test files are **sourced**, not executed, so they share the harness's `PASS`/`FAIL` counters and must not call `exit`.

- [ ] **Step 1: Write the failing test**

`tests/smoke.test.sh`:

```bash
# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.

assert_eq "hello" "$(printf 'hello')" "harness compares equal strings"
assert_contains "ell" "hello" "harness finds a substring"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bash tests/run.sh`
Expected: FAIL — `bash: tests/run.sh: No such file or directory`

- [ ] **Step 3: Write the harness**

`tests/run.sh`:

```bash
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

FILES=0
for t in "$TESTS_DIR"/*.test.sh; do
  [ -e "$t" ] || continue
  printf '\n--- %s ---\n' "$(basename "$t")"
  FILES=$((FILES + 1))
  _before=$((PASS + FAIL))
  # shellcheck disable=SC1090
  . "$t"
  # A file that records NO assertions did not run: it failed to parse, or every
  # loop in it iterated zero times. Without this the harness reports
  # "N passed, 0 failed" for a suite that silently shrank -- which has already
  # happened here, when a one-character typo in a jq filter removed 46
  # assertions and the run stayed green.
  #
  # Note the limit: this catches a file that produces nothing, not one that
  # dies partway. A syntax error before the first assertion is caught; the same
  # error after assertion 3 leaves those 3 recorded, the guard sees movement,
  # and the assertions that never ran are still invisible. Using `. "$t"`'s exit
  # status instead would over-fire, since `.` returns whatever the file's last
  # command returned.
  if [ "$((PASS + FAIL))" -eq "$_before" ]; then
    printf '  FAIL: %s contributed no assertions\n' "$(basename "$t")"
    FAIL=$((FAIL + 1))
  fi
done

if [ "$FILES" -eq 0 ]; then
  printf '  FAIL: no test files matched %s/*.test.sh\n' "$TESTS_DIR"
  FAIL=$((FAIL + 1))
fi

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
```

```bash
chmod +x tests/run.sh
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash tests/run.sh`
Expected: `2 passed, 0 failed`, exit 0.

- [ ] **Step 5: Write the manifests**

`.claude-plugin/plugin.json`:

```json
{
  "name": "claude-tdd",
  "version": "0.1.0",
  "description": "Red-Green-Refactor TDD via role-constrained subagents that never write both a test and the code that satisfies it",
  "author": { "name": "kbluck", "email": "kevin.bluck@gmail.com" },
  "license": "MIT",
  "keywords": ["tdd", "testing", "subagents", "red-green-refactor"]
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "claude-tdd",
  "description": "TDD subagent workflow",
  "owner": { "name": "kbluck", "email": "kevin.bluck@gmail.com" },
  "plugins": [
    {
      "name": "claude-tdd",
      "description": "Red-Green-Refactor TDD via role-constrained subagents",
      "version": "0.1.0",
      "source": "./"
    }
  ]
}
```

- [ ] **Step 6: Verify both manifests are valid JSON**

Run: `jq empty .claude-plugin/plugin.json && jq empty .claude-plugin/marketplace.json && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add .claude-plugin tests
git commit -m "feat: plugin manifest and zero-dependency test harness"
```

---

