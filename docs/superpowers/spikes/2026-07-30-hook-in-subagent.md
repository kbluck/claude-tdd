# Spike: do plugin PreToolUse hooks fire inside subagents?

**Date:** 2026-07-30
**Claude Code:** 2.1.220
**Method:** stub plugin `tdd-spike` installed via local marketplace, loaded through `hooks/hooks.json` + `${CLAUDE_PLUGIN_ROOT}` — the plugin path, not `.claude/settings.json`.

## Q1 — do plugin hooks fire inside a subagent? **YES**

A `general-purpose` subagent was dispatched with instructions to read two files. Both `Read` calls appeared in the probe log. The hook fires for subagent tool calls exactly as it does for main-thread calls.

**The enforcement half of the design is viable.** Task 1's decision gate passes.

## Q2 — is a denial correctable or fatal? **CORRECTABLE**

The subagent attempted to read a path containing `FORBIDDEN`. The hook denied it. The subagent received:

```
PreToolUse:Read hook error: [${CLAUDE_PLUGIN_ROOT}/hooks/probe.sh]: {"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"probe: FORBIDDEN path"}
```

It then continued working and reported normally. It did not abort, and the `systemMessage` reached it verbatim.

So "deny and let the agent self-correct" is real. Agent prompts can tell agents a denial means "you strayed, adjust and continue" rather than "you are stuck."

## Unexpected: the payload carries agent identity

The spec assumed — following `plugin-dev/skills/hook-development/SKILL.md:303-318` — that `PreToolUse` has no agent-identity field. **That documentation is incomplete.** Observed keys:

```
agent_id, agent_type, cwd, effort, hook_event_name, permission_mode,
prompt_id, session_id, tool_input, tool_name, tool_use_id, transcript_path
```

Values by caller:

| Caller | `agent_type` | `agent_id` |
|---|---|---|
| subagent | `"general-purpose"` — the dispatched type | `"a09a63447beb4be8f"` |
| main thread | **absent** | absent |

`transcript_path` is identical for both and cannot discriminate.

## This is not an optimization — it fixes a real bug in the approved spec

The phase-marker design has a defect this spike exposes.

`guard.sh` returns early unless `.tdd/phase` exists, then judges every call against that phase. But during the red phase the **orchestrator itself** runs `git diff --name-only` to audit Red's work. The guard would evaluate that main-thread call against Red's Bash allowlist, find that `git diff` does not prefix-match `pytest -q`, and **deny the orchestrator's own audit.**

The marker file cannot distinguish orchestrator from agent. `agent_type` can, and is the only thing that can.

## Consequent design change

Key the guard on `agent_type`:

- absent → main thread → **permit** (the orchestrator is deliberately unconstrained)
- `tdd-red` / `tdd-green` / `tdd-refactor` / `tdd-mutate` → apply that role's rules
- any other agent type → permit (unrelated work in the same session)

This eliminates:

- `.tdd/phase` entirely
- the stale-marker failure mode (spec risk #3)
- the orchestrator's write-phase-before-dispatch step
- the "strictly sequential" constraint, which existed only because one global marker could not describe two concurrent cycles

## Residual risks

1. **`agent_type` is undocumented.** It could change or disappear. If it vanished, every subagent call would look like a main-thread call and the guard would fail **open** — the worst failure mode in this design, since reads leave no trace in a diff. Mitigation: preflight dispatches a trivial probe subagent and confirms the guard observed an `agent_type`, failing loudly if not. A startup check, not a per-call one.

2. ~~**Unverified: does a plugin's own custom agent report its own name?**~~ **RESOLVED 2026-07-31, and the assumption was wrong.**

   Plugin-provided agents report **`agent_type: "claude-tdd:tdd-red"`** — namespaced as `<plugin>:<agent>`, not the bare `tdd-red` the guard's dispatch table matched on.

   Consequence, reproduced offline against the shipped guard:

   ```
   agent_type=tdd-red             exit=2  denied (Red may only write test files)
   agent_type=claude-tdd:tdd-red  exit=0  PERMITTED — Red writing source
   ```

   The bare name missed, fell through to `*) exit 0`, and **the guard was entirely inert for every real dispatch** — while all 93 tests passed, because every test payload used the bare name the design assumed.

   This is the single most consequential defect found in the project: the plugin would have shipped with its central mechanism doing nothing, and no test, review, or run would have revealed it. Only dispatching a real plugin agent and reading the raw payload exposed it.

   Fix: match on `${agent##*:}`, stripping any namespace. Deliberately broad — another plugin's own `tdd-red` would also be constrained, which is a false denial (loud, safe) rather than a silent permit.

3. Denials surface as `PreToolUse:Read hook error: [...]` with the JSON embedded. Agents parse it fine, but the prefix is harness-controlled and not worth matching on.
