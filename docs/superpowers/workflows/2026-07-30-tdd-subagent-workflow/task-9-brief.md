## Task 9: End-to-end run against a fixture project

The first time every part runs together. Unit tests cover the guard's logic; nothing so far has verified that the loop, the agents, and the hook actually compose.

**Files:**
- Create: `e2e/` (a plain directory in THIS repo — not a nested git repo)
- Create: `e2e/spec.md`
- Create: `.tdd/config.json` (written by `/tdd-init`, committed by it)
- Create: `docs/superpowers/spikes/2026-07-30-e2e-findings.md`

**Interfaces:**
- Consumes: everything
- Produces: findings; no code consumed downstream

- [ ] **Step 1: Build the fixture project**

**The fixture lives at `e2e/` in this repo, not in a nested git repo of its own.**

An earlier draft put it at `tests/fixtures/e2e-project/` with its own `git init`. That does not work, and it was only discoverable by running it: `hooks/guard.sh` resolves the project root from `CLAUDE_PROJECT_DIR`, falling back to the payload's `cwd` — both of which are the *session's* project directory, never a subdirectory a dispatch happens to be working in. Verified with a live `tdd-red` dispatch against this repo: the guard looked for `.tdd/config.json` at the repo root and denied with "run /tdd-init". A config written inside a nested fixture is a config the guard will never read, so every agent call would be denied for the whole run.

So: one git repo (this one), `.tdd/config.json` at its root, and globs scoped to the fixture. `e2e/` rather than `tests/fixtures/…` because our own `tests/**` would otherwise collide with the fixture's test glob — `*` crosses `/` in the matcher, so `tests/**` would match both our `rules.test.sh` and the fixture's `test_calc.py`, and the partition check requires each tracked file to match exactly one list.

The `red:`/`green:` commits this produces land in this branch's history. That is intended — they are the run's evidence.

A Python project with pytest, and — critically — **one behavior already implemented**, so the `passing-covered` or `passing-flat` branch actually executes. A fixture where every item goes red→green would leave the branch that most complicates the orchestrator completely untested.

```bash
mkdir -p e2e/src/calc e2e/tests
```

`e2e/src/calc/__init__.py`:

```python
def add(a, b):
    return a + b
```

`tests/test_smoke.py`:

```python
from calc import add


def test_add_exists():
    assert add(1, 1) == 2
```

`pyproject.toml`:

```toml
[project]
name = "calc"
version = "0.1.0"

[tool.pytest.ini_options]
pythonpath = ["src"]
```

`spec.md`:

```markdown
# Calculator

1. `add(a, b)` returns the sum of two numbers.
2. `subtract(a, b)` returns the difference.
3. `divide(a, b)` raises `ValueError` when `b` is zero.
```

Item 1 is already implemented — that is deliberate.

```bash
git add e2e && git commit -q -m "test(plugin): add e2e fixture project"
python -m pytest -q e2e
```

Expected: 1 passed. No `git init` — this repo is the git context, and the audit,
the revert, and the per-phase commits all operate on it.

- [ ] **Step 2: Install the plugin locally and restart**

Add `claude-tdd` as a local marketplace, install it, restart Claude Code so `hooks/hooks.json` loads. Confirm `/tdd` and `/tdd-init` appear.

**`/plugin install` copies the repo into a cache snapshot at
`~/.claude/plugins/cache/claude-tdd/claude-tdd/<version>/`. Edits to the repo do
not take effect until you reinstall — `/reload-plugins` re-reads the cache, it
does not refresh it.** Verified during Task 6 step 6, where a fixed `guard.sh`
sat in the repo while the stale copy ran. Before trusting any live run in this
task, confirm the two agree:

```bash
diff -rq hooks "$HOME/.claude/plugins/cache/claude-tdd/claude-tdd/0.1.0/hooks"
```

Silence means they match. Any output means you are testing code you did not
write, and a passing run proves nothing.

- [ ] **Step 3: Run `/tdd-init` and check the partition**

Run it from the repo root. The partition covers **every tracked file in this
repo**, not just the fixture, because that is the set `git ls-files` returns and
the set the guard's read denylist is judged against.

Expected globs:

- `test`: `e2e/tests/**`
- `source`: `e2e/src/**`
- `ignore`: everything else — `agents/**`, `commands/**`, `hooks/**`, `skills/**`, `tests/**`, `docs/**`, `.claude/**`, `*.md`, `.gitignore`, `e2e/*.toml`, `e2e/*.md`

Expected behaviour: it detects pytest, proposes globs, and **refuses to write
until every tracked file is classified**. That refusal is the partition check
working. If it writes a config while leaving files unclassified, Task 7 step 4
was not implemented correctly.

Watch for the collision the layout was chosen to avoid: `*` crosses `/` in the
matcher, so a `tests/**` test-glob would also swallow our own `tests/rules.test.sh`
and the partition check should report the overlap.

Confirm it committed its own output:

```bash
git status --porcelain
```

Expected: empty.

- [ ] **Step 4: Run `/tdd spec.md` and observe all three branches**

Watch for:
- **Item 1** resolves via `passing-covered` or `passing-flat` with **no Green dispatch**. This is the branch most likely to be implemented wrong.
- **Items 2 and 3** go red → green, each producing two commits.
- No `.tdd/phase` file is ever created; the guard keys off `agent_type`.
- The orchestrator runs coverage before each Green dispatch and after each return.

Item 3 (`divide` raising on zero) is the deliberate coverage-gate probe. A
minimal implementation must write `return a / b` to make the module importable
and the error branch reachable, and the divide-by-zero test never executes that
line. Expect roughly one new uncovered line — **within** the default allowance
of 2, so it should pass the gate. If the orchestrator rejects it, the threshold
or the counting is wrong. If Green instead writes type checks, negative-number
handling, or a docstring-driven general implementation, expect a rejection and
a re-dispatch — which is the gate working.

- [ ] **Step 4b: Verify the coverage gate rejects, not just accepts**

The gate is the newest logic and Step 4 only exercised its passing path. Test
the rejection deterministically rather than hoping an agent overbuilds.

Capture the baseline:

```bash
python -m pytest -q --cov --cov-report=json:.tdd/coverage.json >/dev/null
jq '[.files[].summary.missing_lines] | add' .tdd/coverage.json
```

Record that number. Now append a function no test calls:

```bash
cat >> src/calc/__init__.py <<'EOF'


def unused(a, b, c):
    if a > b:
        return c
    if b > c:
        return a
    if a == b:
        return b
    return None
EOF
python -m pytest -q --cov --cov-report=json:.tdd/coverage.json >/dev/null
jq '[.files[].summary.missing_lines] | add' .tdd/coverage.json
```

Expected: the second number exceeds the first by clearly more than
`greenMaxNewUncovered` of 2. Do not hard-code an expected delta — `missing_lines`
counts executable body lines only, and the `def` line runs at import so it is
never missing. The exact figure depends on how coverage.py counts the branches;
what matters is that the delta is unambiguously above the threshold. Confirm the
orchestrator's extraction produces the same delta by hand-running the comparison
it performs.

**This step exists to catch a silent parser failure.** Reading uncovered lines
out of a coverage report is the most toolchain-specific piece of the design. An
extractor that returns `0` on a JSON shape it does not recognize would disable
all three gates while every other check in this plan still passes. If both
numbers come back `0` or `null`, the extraction is broken — fix it before
shipping, and record the working `jq` expression in the orchestrator skill.

```bash
git checkout -- src/calc/__init__.py
```

- [ ] **Step 5: Verify the guard actually fired**

The single highest-value check in this task. Everything else can pass while the hook sits inert, and an inert hook means read isolation was never enforced.

```bash
git log --oneline
git log --format='%s' | grep -c '^red:'
git log --format='%s' | grep -c '^green:'
python -m pytest -q
```

Expected: alternating `red:`/`green:` commits, at least one `test:` or a `redundant` item, and all tests passing.

Then confirm the hook is live rather than merely installed:

```bash
printf '{"hook_event_name":"PreToolUse","agent_type":"tdd-red","agent_id":"probe","tool_name":"Read","tool_input":{"file_path":"%s/src/calc/__init__.py"}}' "$PWD" \
  | TDD_PROJECT_DIR="$PWD" bash ../../../hooks/guard.sh; echo "exit=$?"
```

Expected: `exit=2` with a denial mentioning that Red may not read source.

If Task 1 found denials are *correctable*, also confirm from the transcript that at least one agent hit a denial and recovered. If no agent ever tripped the guard, you have not observed it working in situ — note that explicitly rather than assuming.

- [ ] **Step 6: Record findings and commit**

Write `docs/superpowers/spikes/2026-07-30-e2e-findings.md`: which branches executed, whether the guard fired in situ, any denial text agents saw, and every point where the orchestrator needed judgment the skill did not specify. That last list is the backlog for v0.2.

```bash
git add e2e docs/superpowers/spikes
git commit -m "test: end-to-end fixture run and findings"
```

- [ ] **Step 7: Full suite green**

```bash
bash tests/run.sh
```

Expected: all passing, exit 0.

---

