## Task 4: Bash command allowlist

**Files:**
- Modify: `hooks/lib/rules.sh` (append)
- Modify: `tests/rules.test.sh` (append)

**Interfaces:**
- Consumes: nothing from Task 3's functions
- Produces: `tdd_bash_verdict <command> <template>` → echoes `allow` or `deny: <reason>`

**Design notes:**

Detecting mutation by parsing shell commands is unbounded — `sed -i`, `cat >`, `mv`, a codegen script, and arbitrarily many more. Invert it: the agents only ever legitimately run the commands in `config.json`.

The rule has two parts:

1. The command must start with the template's **static prefix** — everything before the first `{` placeholder, trailing whitespace trimmed. For `pytest -q {testId}` the prefix is `pytest -q`.
2. The **delta** — what the agent supplied beyond that prefix — must contain none of `;` `|` `&` `>` `` ` `` `$(` `<` `\n`.

**A template with no static prefix must deny.** If everything before the first `{` is empty or whitespace, the prefix test degenerates to `case "$cmd" in *)`, which matches every string — leaving only the metacharacter ban, so `cp -r /etc /tmp/exfil` would be permitted. This is the one input that turns the allowlist off entirely, and it must fail closed.

The metacharacter ban applies to the delta, *not* the template. A configured command is trusted: the user confirmed it at init, and some toolchains genuinely need a redirect to emit coverage. Banning metacharacters in the template itself would make those toolchains unexpressible, and the failure would surface as an unexplained rejection at init.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rules.test.sh`:

```bash
# --- bash allowlist ---
T_SINGLE="pytest -q {testId}"
T_FULL="pytest -q"
T_COV="pytest -q --cov --cov-report=json:.tdd/coverage.json"

assert_eq "allow" "$(tdd_bash_verdict "pytest -q tests/test_a.py::test_x" "$T_SINGLE")" \
  "substituted test id is allowed"
assert_eq "allow" "$(tdd_bash_verdict "pytest -q" "$T_FULL")" \
  "exact template match is allowed"
assert_eq "allow" "$(tdd_bash_verdict "$T_COV" "$T_COV")" \
  "template containing a colon path is allowed verbatim"

assert_contains "deny" "$(tdd_bash_verdict "rm -rf src" "$T_FULL")" \
  "unrelated command is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q; rm -rf src" "$T_FULL")" \
  "semicolon in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q | tee out.txt" "$T_FULL")" \
  "pipe in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q > out.txt" "$T_FULL")" \
  "redirect in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict 'pytest -q $(whoami)' "$T_FULL")" \
  "command substitution in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q && rm -rf src" "$T_FULL")" \
  "and-chain in delta is denied"
assert_contains "deny" "$(tdd_bash_verdict "sed -i s/a/b/ src/a.py" "$T_SINGLE")" \
  "in-place edit via bash is denied"
assert_contains "deny" "$(tdd_bash_verdict "pytest -q" "")" \
  "empty template denies"

# --- REGRESSION: a template with no static prefix must not wave everything
# through. An empty prefix makes the prefix test `case "$cmd" in *)`, which
# matches any string, leaving only the metacharacter ban -- so an arbitrary
# command with clean punctuation would be permitted.
assert_contains "deny" "$(tdd_bash_verdict "cp -r /etc /tmp/exfil" "   ")" \
  "whitespace-only template denies rather than allowing any clean command"
assert_contains "deny" "$(tdd_bash_verdict "rm -rf /tmp/pwned" "{cmd}")" \
  "placeholder-only template denies"
assert_contains "deny" "$(tdd_bash_verdict "anything at all" "{a} {b}")" \
  "template starting with a placeholder denies"

# A tab before the placeholder must be trimmed like a space, or every normal
# invocation would fail the prefix match.
assert_eq "allow" "$(tdd_bash_verdict "pytest -q tests/t.py::x" "$(printf 'pytest -q\t{testId}')")" \
  "trailing tab is trimmed from the static prefix"
```

The redirect case is the one that matters most: `T_COV`'s template contains `:` and is allowed verbatim, while an agent-appended `>` is denied. That is the delta rule doing its job.

- [ ] **Step 2: Run to verify they fail**

Run: `bash tests/run.sh`
Expected: FAIL — `tdd_bash_verdict: command not found`

- [ ] **Step 3: Write the implementation**

Append to `hooks/lib/rules.sh`:

```bash
# tdd_bash_verdict <command> <template>
# Echoes "allow" or "deny: <reason>".
#
# The command must begin with the template's static prefix (everything
# before the first `{` placeholder). Whatever the agent added beyond that
# prefix — the delta — must contain no shell metacharacters. The template
# itself is trusted and may contain them.
tdd_bash_verdict() {
  local cmd="$1" template="$2"

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
```

- [ ] **Step 4: Run to verify they pass**

Run: `bash tests/run.sh`
Expected: all assertions PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/rules.sh tests/rules.test.sh
git commit -m "feat: bash command allowlist with delta-scoped metacharacter ban"
```

---

