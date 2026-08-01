## Task 3: Path decision rules

The phase × mode × path matrix. Pure functions, no I/O.

**Files:**
- Create: `hooks/lib/rules.sh`
- Create: `tests/rules.test.sh`

**Interfaces:**
- Consumes: `assert_eq`, `assert_contains` (Task 2)
- Produces:
  - `tdd_glob_match <pattern> <path>` → exit 0 on match, 1 otherwise
  - `tdd_matches_any <path> <glob-string>` → exit 0 if any glob in the space-separated string matches
  - `tdd_path_verdict <role> <mode> <path> <test_globs> <source_globs>` → echoes `allow` or `deny: <reason>`. Glob arguments are **space-separated strings**, not arrays — Bash 3.2 has no associative arrays and passing arrays through function boundaries is not worth the complexity here.

**Design notes the implementer needs:**

*Glob semantics.* Inside `[[ ]]`, an unquoted pattern's `*` matches `/` as well as any other character — unlike shell filename globbing. So `tests/*` already matches `tests/a/b.py`. Config files write `tests/**` for readability; normalize `**` to `*` before matching. Write the substitution as `${1//\*\*/*}` — in `${var//pattern/replacement}` the replacement half is *not* a pattern, so writing `\*` there can leave a literal backslash on some Bash versions.

*Why writes are an allowlist and reads a denylist.* A write must match the role's permitted globs. A read must merely not match the forbidden ones, because agents legitimately read `README.md`, `pyproject.toml`, and type stubs, and an allowlist would fight them constantly. This is only sound because `/tdd-init` (Task 7) proves the test/source/ignore globs partition every tracked file — otherwise an unclassified source file would be readable by Red.

*Splitting the glob string is the one dangerous operation in this file, and it is confined to `tdd_matches_any`.* An unquoted `$globs` in bash undergoes word splitting **and pathname expansion**. Pathname expansion is the hazard: `src/**` would be replaced by whatever files happen to exist on disk, so `tdd_path_verdict red read src/pkg/module.py` returns `allow` when run from a directory containing `src/`, and `deny` when run from anywhere else. Same arguments, different answer, and the wrong answer is the permissive one — a silent fail-open on exactly the read isolation nothing else can enforce.

So `tdd_matches_any` takes the glob **string** (quoted at every call site) and does the splitting internally with `set -f` in force, saving and restoring the caller's flag. Callers cannot reintroduce the bug by forgetting to quote, because quoting is now correct everywhere.

`tdd_glob_match` needs no such guard: inside `[[ ]]`, bash does not perform pathname expansion on the right-hand pattern.

*Every parameter defaults to empty, and an empty governing glob list denies.* `tests/run.sh` sources this file under `set -u`, where an unset positional would abort the script rather than return a verdict — and an aborted guard exits non-zero-but-not-2, which Claude Code treats as a non-blocking error, letting the tool call proceed. A caller bug must degrade to `deny`, never to a crash that permits.

*The matrix:*

| phase | mode | rule |
|---|---|---|
| `red` | `write` | allow iff matches test globs |
| `red` | `read` | deny iff matches source globs |
| `green` | `write` | allow iff matches source globs |
| `green` | `read` | deny iff matches test globs |
| `refactor` | `write` | allow iff matches source globs |
| `refactor` | `read` | deny iff matches test globs |
| `mutation` | `write` | allow iff matches source globs |
| `mutation` | `read` | deny iff matches test globs |
| anything else | any | deny — fail closed |

`mutation` (agent `tdd-mutate`) shares Refactor's path rules. Its distinguishing
rule — every write must be reverted before handover — is a *temporal* property
the guard cannot see from a single tool call. The orchestrator enforces it with a
diff check after the dispatch returns.

Role names here are the guard's internal vocabulary; `guard.sh` maps
`agent_type` (`tdd-red`, `tdd-green`, `tdd-refactor`, `tdd-mutate`) onto them.

- [ ] **Step 1: Write the failing tests**

`tests/rules.test.sh`:

```bash
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

# --- REGRESSION: alternative spellings of the same path must agree ---
#
# guard.sh strips the project root by literal prefix, so an un-normalised
# `./x` or `x//y` fails to strip and then matches no glob. On a READ that
# means ALLOW, because reads are a denylist. Verified live before the fix:
# red was denied `e2e/src/calc/__init__.py` and permitted the identical file
# spelled `./e2e/src/calc/__init__.py`.
assert_eq "e2e/src/a.py" "$(tdd_normalize_path "./e2e/src/a.py")" \
  "leading ./ is stripped"
assert_eq "e2e/src/a.py" "$(tdd_normalize_path "e2e//src/a.py")" \
  "repeated slashes collapse"
assert_eq "e2e/src/a.py" "$(tdd_normalize_path "e2e/./src/a.py")" \
  "/./ segments collapse"
assert_eq "e2e/src/a.py" "$(tdd_normalize_path ".//e2e/./src//a.py")" \
  "all three at once"
assert_eq "/abs/e2e/src/a.py" "$(tdd_normalize_path "/abs//e2e/./src/a.py")" \
  "an absolute path keeps its leading slash"
assert_eq "" "$(tdd_normalize_path "")" \
  "empty input stays empty rather than erroring"

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
```

- [ ] **Step 2: Run to verify they fail**

Run: `bash tests/run.sh`
Expected: FAIL — `hooks/lib/rules.sh: No such file or directory`

- [ ] **Step 3: Write the implementation**

`hooks/lib/rules.sh`:

```bash
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
```

Every call site quotes its glob string. The splitting is `tdd_matches_any`'s job and happens under `set -f`.

- [ ] **Step 4: Run to verify they pass**

Run: `bash tests/run.sh`
Expected: all `rules.test.sh` assertions PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/rules.sh tests/rules.test.sh
git commit -m "feat: phase-aware path decision rules"
```

---

