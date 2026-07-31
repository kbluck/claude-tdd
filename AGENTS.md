# AGENTS.md

Everything about *what this plugin is and how it is meant to work* lives in the spec and the plan. This file holds only what those
documents cannot tell you: how to work in this repository, and the traps this project has already fallen into.

Read before changing anything substantial:

- `docs/**/specs/*.md` — the design contract.
- `docs/**/plans/*.md` — task-by-task detail. The current iteration is `2026-08-01-architecture-review-remediation.md`.
- `docs/**/reviews/*.md` — independent review findings.
- `.superpowers/**/progress.md` — the ledger: every defect found, how, and what it cost.
- `.claude/.remember/*.md` — memories from prior sessions.

## Repository state you will trip over

`.tdd/config.json` **exists on disk and is gitignored** (`.gitignore:174`). It describes the `e2e/` fixture, not the plugin. So a
`tdd-*` dispatch here is guarded normally against the fixture's globs — `tdd-red` writing `e2e/tests/test_new.py` is **permitted**;
reading `e2e/src/**` is denied. It does **not** deny everything with "run /tdd-init"; that only happens if the file is absent.

The suite does not depend on any of this: it copies `tests/fixtures/config.json` into a sandbox and points the guard there with
`TDD_PROJECT_DIR`.

## Commits

Conventional Commits — use the `conventional-commits` skill.

**Stage explicit paths. Never `git add -A`** — a subagent may be mid-edit. This clobbered implementer attribution once (`212fa6b`),
and a broad `git add e2e` committed pytest bytecode another time.

**Do not edit `.gitignore` mid-cycle.** The commit audit assumes a clean tree; an unrelated edit pollutes it.

One type and scope per commit; split when a change spans two. Every type except `chore` takes a scope:

| Scope | Covers |
|---|---|
| `plugin` | the whole project, or the plugin config |
| `spec` | the specification |
| `plan` | the task plan |
| `agent` | subagent definitions |
| `command` | slash commands |
| `hook` | hook scripts |
| `skill` | skill definitions |

## Tests

```bash
bash tests/run.sh          # whole suite, ~1.3s, exits non-zero on any failure
```

No single-test selector; `run.sh` globs `tests/*.test.sh` and the suite is fast enough not to need one.

Test files are **sourced, not executed**: no shebang, no `set -e`, no `exit`. They call `assert_eq` and `assert_contains` from
`run.sh` and use `$REPO_ROOT`. Because they are sourced into `run.sh`'s own scope, a test file that assigns `BEFORE`, `FOUND` or
`t` breaks the harness guard silently.

## Running the plugin against itself

`e2e/` is a pytest fixture for exercising the workflow end to end. Run `/tdd-init` (it detects the fixture), then `/tdd e2e/spec.md`.
The venv at `e2e/.venv` needs `pytest`, `pytest-cov`, `radon` and `mutmut`.

---

# Traps

Every item below was paid for. Twenty defects were recorded across the first iteration — twelve found by review, eight only by
running — plus six more from an independent architecture review that document review had passed over roughly forty times.

## A green suite is not evidence

`run.sh` fails a file that contributes **zero** assertions, and fails an empty glob. It does **not** catch a file that dies
**partway**: assertions recorded before the failure count as movement, and everything after it is invisible.

An unset variable is worse. Test files are sourced under `set -uo pipefail`, so one unbound reference **kills the whole harness** —
no summary line is printed at all, every later file never runs, and the exit status is 1. Reproduced. **Read the exit status, not
the pass count**; a human skimming for "N passed" is the only reader this fools.

The reason this matters: a one-character typo in a `jq` filter once dropped 46 assertions, and the run reported *122 passed, 0
failed*. The root cause — a harness with no notion of what the count should be — was known for five tasks while the class recurred
six times.

- After editing a test file, **confirm the passed-count actually moved**.
- **Bite-check**: break the thing on purpose and confirm the exact assertions you expect fail. Removing the two normalisation lines
  should fail exactly four.
- Beware the **vacuous pass**: an assertion satisfiable by a permissive catch-all (`**/test_*.py` matches almost any test name)
  proves nothing. Name fixtures so they cannot be satisfied coincidentally — `helpers.py`, not `test_helpers.py`.
- A derived loop that enumerates nothing contributes zero assertions and looks identical to one that passes.

## Reads fail open; writes fail closed

This is the single most productive question to ask of any branch in this codebase:

> **What reaches `allow` when the check cannot be evaluated?**

Writes are an allowlist: a failure to match denies, loudly. Reads are a denylist: a failure to match **permits, silently, and
leaves no trace in any diff**. So every defect on the read path is invisible, and every one of them has been found late.

Seven fail-opens were found in the first iteration. They cluster **at the seams between components** — where one function's output
becomes another's input and neither owns the empty case. Generic review prompts approved every one of those diffs; reviewers only
found them when told which direction the asymmetry ran.

## Fixing the document about the artifact is not fixing the artifact

Three occurrences. The third landed on a security boundary: commit `b97c69f`, labelled `fix(plan): normalise a trailing /.`,
touched the plan and the spec and never `hooks/lib/rules.sh`. The ledger recorded it FIXED; the bypass is still live.

**A fix is not done until `git show --stat` names a file outside `docs/`.**

## Verification instruments lie

Every one of these produced a confident wrong answer:

- **`hooks/lib/rules.sh` is bash. Sourcing it into zsh gives wrong verdicts** — `[[ == ]]` glob semantics differ between the
  shells, and zsh word-splits differently. This produced false VIOLATIONs once and a false S3 reading during the iteration-2
  review. Verify with `/bin/bash -c '...'` explicitly, never in the ambient shell.
- **zsh ties `path` to `PATH`.** A loop variable named `path` destroys the search path mid-script, and every subsequent command
  fails with `command not found`. Hit during this project twice.
- **A whole-file `grep` passes when the key is missing from the specific block a model copies from.** Scope the haystack, and check
  both anchors — a broken end anchor lets `sed` run to EOF and silently re-widens it.
- **The replacement half of a bash substitution is not a pattern.** `${p//\/\//\/}` emits a literal backslash. This trap bit twice:
  the `**` normalisation bug, then the first path normaliser, which silently produced `e2e\/src/a.py`. Caught only by printing the
  output. Use `tr -s`.
- **An empty `dirname` or an empty glob** makes a loop iterate zero times, which asserts nothing and reports success.

## Revert does not revert

- `git checkout -- .` restores **tracked** files only. Red's tests are almost always new files, so a rejected test stays in the
  tree where the next commit sweeps it up. Found on the first live run.
- `git reset --hard` has the same blind spot, at three more sites.
- `git reset --hard -- <path>` is **fatal**: *Cannot do hard reset with paths*. Only `clean` takes a pathspec. Prose describing an
  impossible command is how the first two of these arose.
- `git clean` **without `-x`** spares gitignored paths, so the venv, the checklist and the coverage report survive. Do not add `-x`.

## The environment lies too

- **Restoring source does not invalidate bytecode.** A suite once reported a failure with a traceback the source could not produce,
  and git called the tree clean because `.pyc` is gitignored. The same mechanism serves a false **green**, which is where it would
  be believed. `PYTHONDONTWRITEBYTECODE=1` is in the configured commands for this reason.
- **The mutation run leaves `e2e/mutants/` behind**, which permanently breaks the configured test command until removed. The
  wrapper traps it and the commands pass `--ignore=e2e/mutants`.

## Platform constraints

bash **3.2.57** (macOS system bash): no `${v,,}`, no `${v^^}`, no associative arrays, no `mapfile`. Fold case with
`tr '[:upper:]' '[:lower:]'`.

BSD `realpath` has **no `-m`**, so it cannot canonicalise a path that does not exist yet — which is every `Write` of a new file.
`cd "$dir" && pwd -P` is the portable route, and it returns the true stored case of every directory component.

## Where the defects come from

All twenty first-iteration defects originated **in the plan**, none from an implementer — because that plan embedded the
implementation and left the implementer nothing to decide. Implementers caught five by flagging rather than transcribing.

The current plan carries design intent and no code, for exactly that reason. If you find yourself writing an implementation into a
plan document, that is the failure mode restarting.
