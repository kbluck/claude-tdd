# claude-tdd

A Claude Code plugin that drives Red-Green-Refactor TDD through role-constrained subagents: one agent writes a test, a
different agent (working only from that agent's handover report, never the test itself) writes the code to pass it, and a
third refactors without adding behavior. A `PreToolUse` hook checks every file the agents touch against their role and
denies what doesn't fit.

The full design — every enforcement mechanism, every known gap, every failure mode — is documented in
[`docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md`](docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md).
This README summarizes it for someone deciding whether to install the plugin; it is not a substitute for the spec, and
where the two disagree, the spec is right.

## What this buys you

Three subagents, each with a hard stop condition:

- **`tdd-red`** writes exactly one failing test from the spec. It cannot `Read` or write source files.
- **`tdd-green`** writes the minimum code to turn that one test green, working only from Red's handover report
  (a signature, an intent, an expected result, and a one-line failure) — never from the test file.
- **`tdd-refactor`** improves existing code with every public interface and every test result held constant. It cannot
  open a test file or add behavior.

A hook (`hooks/guard.mjs`) inspects every `Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `NotebookRead`, and `Bash`
call each agent makes, checks the target against that role's allowed paths and commands, and denies anything outside
them. A direct `Read` on the file a role isn't supposed to see gets blocked and logged as a rule violation — that's the
part that turns "don't read the test" from a prompt instruction into something Claude Code itself enforces.

## What this does not buy you

Read the spec's [**Threat model**](docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md#threat-model-iteration-2)
before relying on this for anything that matters. The short version:

- **The guard stops incidental violation reliably and loudly.** An agent reaching for the wrong file by mistake — the
  common case — gets denied and told which rule it broke.
- **It does not stop a motivated agent.** Three channels carry forbidden content past the guard with zero denials, and
  none of them can be closed inside the guard itself:
  1. **The permitted test runner, executing an agent-authored file.** Each role is allowed to write the file its
     configured test command executes. A test (or source file) that reads and prints the content it isn't allowed to
     `Read`, then triggers its own configured command, gets that content back under captured output.
  2. **`observedFailure`**, the failing-test summary handed to Green as required input. It's truncated to a failure line
     and location, but an assertion diff still carries values and a terse traceback still names the test.
  3. **The orchestrator** — the main Claude Code thread that dispatches every agent. It is exempt from the guard by
     construction and hand-authors every dispatch prompt.

  Channels 1 and 2 get *detection*, not prevention: a commit-time scan of Red's committed test files for raw reads of
  source paths, and the truncated-traceback requirement above. Both raise the cost of using the channel. Neither closes
  it.
- **A spec you didn't write is a trust boundary, not a safe input.** Red reads whatever spec file you point it at with no
  sanitization. A spec instructing the implementation to exfiltrate data produces a compliant Green writing exactly
  that — entirely within its allowed files, using only configured commands, with zero denials. **Running `/tdd` against
  an untrusted spec carries the same risk as running code from that spec's author.**

## Requirements

- **Node 22 or later**, on the `PATH` of the process that *launches* Claude Code — not necessarily your interactive
  shell's `PATH`. Claude Code's native installer ships no Node, and per-shell version managers (`fnm`, `nvm`) put node on
  a `PATH` that only an interactive shell's profile assembles. Starting Claude Code from a desktop icon, a script, or any
  other non-interactive launcher can get you a session with no Node visible to it at all.

  **This failure is silent, not loud.** A missing interpreter means the guard hook never starts, and `PreToolUse` treats
  a non-zero, non-2 exit as a non-blocking error — the tool call it would have checked just proceeds. Nothing in the
  transcript says the guard didn't run. `/tdd-init` checks for Node, but only confirms it's on the *orchestrating shell's*
  `PATH`; only `/tdd`'s preflight (which dispatches a probe subagent and confirms the guard actually observed it) checks
  the environment the hook is really spawned in. If you use a per-shell version manager, point a file every shell reads
  non-interactively (`.zshenv`, not `.zshrc`) at a stable node directory rather than the manager's ephemeral one.
- A git repository with a clean working tree before each `/tdd` run.

## Install

```
/plugin marketplace add kbluck/claude-tdd
/plugin install claude-tdd@claude-tdd
```

## Usage

1. **`/tdd-init`** — detects your toolchain (pytest, jest, vitest, cargo, go, or dotnet), proposes a
   `.tdd/config.json`, and commits it after you confirm. It states explicitly which guarantees you lose for any tool it
   can't find (see the table below) instead of degrading silently.
2. **`/tdd <spec-path>`** — refuses to start unless preflight passes (clean tree, config present, suite green, spec
   readable, the guard confirmed live), then decomposes the spec into a checklist and drives it item by item through
   Red → Green → Refactor, followed by a mutation-testing hardening pass. Re-running `/tdd` against the same spec
   resumes an interrupted run rather than starting over.

Every step of both commands — the full preflight list, the per-item state machine, commit conventions, and every
failure-handling branch — is in the spec's [**The Cycle**](docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md#the-cycle)
section.

## Configuration

`.tdd/config.json`, committed to your target project, is the single source of truth shared by the orchestrator, the
agents, and the guard. `/tdd-init` writes it for you; you shouldn't need to hand-edit it. It carries:

- **`commands`** — how to run the full suite, a single test, a terse-failure single test, coverage, complexity, and
  mutation testing, for whatever toolchain `/tdd-init` detected.
- **`globs`** — a `test` / `source` / `ignore` partition that every tracked file in your repo must match exactly once.
  This is what makes the guard's asymmetric rule work: writes are checked against an allowlist and fail closed, but
  reads are checked against a denylist, so a file the globs don't classify is silently readable by Red. `/tdd-init`
  verifies the partition is exhaustive before writing the config, and `/tdd`'s preflight re-checks it on every run.
- **`refactorTriggers`**, **`limits`**, **`coverageGates`** — thresholds for when Refactor gets dispatched, how many
  retries each role gets before the run escalates to you, and how much new uncovered code Green and Refactor are each
  allowed to add.

The full schema, field by field, is in the spec's
[**Configuration**](docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md#configuration) section — it isn't
reproduced here, because a third copy of that JSON is one more place for it to drift from the two the tests already
pin (`tests/fixtures/config.json` and `commands/tdd-init.md`'s template).

### Degrading without full tooling

Every measurement is optional and each degrades independently rather than blocking the workflow:

| Missing | Lost |
|---|---|
| `commands.coverage` | Red's three-way branch collapses to strict red; both coverage gates skipped; `crapMode` forced to `unavailable` |
| `crapMode: "unavailable"` | CRAP trigger unavailable; refactor falls back to `maxFunctionLines` |
| `commands.mutation` | mutation pass uses agent-driven hand-mutation instead of a tool; still runs |
| `commands.complexity` is null and no native CRAP | same as `crapMode: "unavailable"` |
| `commands.singleTerse` | `observedFailure` falls back to `commands.single` and carries the full traceback — this hands Green the failing test's body despite Green being denied `Read` on the test file |

`/tdd-init` tells you which of these apply to your setup rather than degrading silently, so you know which mechanical
checks you're actually getting versus which have quietly become prompt discipline.

## Known limitations

A short list; the spec's [**Limitations**](docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md#limitations-iteration-2)
section has the full reasoning behind each:

- **No concurrency story.** One `/tdd` per repository at a time — a second concurrent run corrupts the first's commit
  audit with no detection.
- **Monorepos are architecturally excluded**, not merely under-detected: the schema has one `commands` object and one
  `globs` partition.
- **"Exactly one test" is undefined for parametrized or table-driven tests.** Neither the coverage nor the mutation
  machinery can distinguish an atomic test from one carrying several unrelated assertions.
- **Windows support is by construction, not by verification**, until someone has run it there.

## Packaging note

This plugin is distributed with `source: "./"` in `.claude-plugin/marketplace.json` — a relative-path source, which
Claude Code's plugin format copies wholesale with no exclude mechanism of any kind. There is no `.claudeignore`, no
`files` allowlist, nothing equivalent to an npm `files` field. Installing this plugin therefore copies this entire
repository into your plugin cache, including `docs/`, `.superpowers/`, `tests/`, `e2e/`, and `.idea/` — none of which
the plugin needs at runtime. This is a known, accepted tradeoff, not an oversight: the actual fix would be restructuring
the repository so the marketplace `source` points at a subdirectory holding only the files the plugin ships, which is a
larger change than this note is scoped to make.

## Contributing

Repository conventions, test commands, and the traps this project has already paid for are in
[`AGENTS.md`](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE).
