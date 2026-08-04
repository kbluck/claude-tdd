# Task 14 report: record the decisions

## Summary table

| # | Item | Status | Where | Why there |
|---|---|---|---|---|
| — | The plan carries design intent, not implementation (R18) | Already present | `docs/superpowers/plans/2026-08-01-architecture-review-remediation.md:275` | Design decision about the plan itself; the plan is its own record. |
| — | The measurement layer stays (R19) | Already present | `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:611-613`, under *Decided, not open* | Design decision about the artifact's methodology; belongs in the spec, not restated. |
| — | The substrate is Node 22 | Already present | `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:114` (*Why the guard is written in Node*) | Design decision about the artifact; already has its full rationale in the spec. |
| — | Checked JavaScript, not compiled TypeScript | Already present | `docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:148` (*Types without a compile step*) | Same — design decision, already in the spec with full rationale. |
| 1 | M2 — "green" from a harness that can't distinguish "no assertion failed" from "no assertion ran" is not evidence | **Added** | `AGENTS.md`, lead paragraph of *A green suite is not evidence* | Process/testing lesson for whoever runs this suite next, not a decision about the artifact's design — AGENTS.md's stated purpose. |
| 2 | "The scope of a measured fact is part of the fact" | **Added** | `AGENTS.md`, new section *The scope of a measured fact is part of the fact* | Controller-reasoning lesson about generalizing a spike measurement; the ledger itself calls it "a new shape," distinct from *Verification instruments lie*. Process lesson, not a design fact — AGENTS.md. |
| 3 | "A change that makes a document false, or a latent defect reachable, owns it" | **Added** | `AGENTS.md`, new section of the same name | Scope-boundary ruling for future task/review scoping decisions — a working-in-this-repo lesson, not a statement about what the artifact does. AGENTS.md. |
| 4 | "A trace must quote the sentence that causes it" | **Added** (confirmed missing first) | `AGENTS.md`, new section of the same name | Review-process standard for verifying implementer traces. AGENTS.md. |

## Verification that the three already-present items are not restated

Checked before writing anything:

```
grep -n "Why the guard is written in Node\|Decided, not open\|Types without a compile step\|The measurement layer stays\|The plan carries design intent" -r docs/ AGENTS.md
```

Confirmed all three (plus the fourth, "Checked JavaScript, not compiled TypeScript," which the brief's Task 14 text also names but the parent's context did not ask me to re-verify — I checked it anyway since it was one grep away) already exist with their full rationale, and `AGENTS.md` does not duplicate any of them. `AGENTS.md` was also checked directly for `M2`, `jq`, `46 assertion`, `CLAUDE_PLUGIN_ROOT`, `reachable`, `owns it`, and `trace` — none of the four missing items were present under any of those terms before this task's edits.

## What was added, and where each claim traces to

All four additions went into `AGENTS.md`'s `# Traps` section. Every factual claim in the added text is sourced from `.superpowers/sdd/2026-08-01-architecture-review-remediation/progress.md` (the ledger) or `docs/superpowers/reviews/2026-08-01-architecture-review.md` (finding M2's origin). Specifically:

- **M2** (`AGENTS.md:99-107`): sourced from the review doc's `### M2` finding (line 761 of the review) and the plan's Task 14 section (`docs/superpowers/plans/2026-08-01-architecture-review-remediation.md:280`), both of which state the 46-assertions / "122 passed, 0 failed" history identically. Placed as the lead paragraph of the existing *A green suite is not evidence* section (rather than a new section) because that section already carries the `node:test` collection-throw and empty-match instances the brief said were present but ungrounded in a stated principle — the new paragraph supplies the principle those instances are examples of.
- **Scope of a measured fact** (`AGENTS.md:235-251`): sourced from `progress.md:399-421` (Task 4 controller-error entry), including the direct quotes "set for the hook process" vs. the over-generalized "set for the plugin's code," the orchestrator-shell verification (`progress.md:391-397`), and the round-2 remedy (state the floor as a literal, add a `NODE_FLOOR` drift test).
- **Reachability/ownership** (`AGENTS.md:164-181`): sourced from `progress.md:514-521` (Task 6, `knownRed` poisoning — the exact sentence "A latent defect a change turns reachable belongs to that change" is quoted) and `progress.md:747-756` (Task 7, the spec going false when `checkout` was retired — "a change that makes a document false owns that falseness" is quoted verbatim from the ledger).
- **Trace quoting** (`AGENTS.md:203-214`): sourced from `progress.md:577-582` (the Trace-C quote "is already accounted for and not re-flagged," verified as unsupported by any source sentence) and `progress.md:596-600` (the re-trace verified against the new standard, including the mutually-exclusive-bucket check).

## Files changed

- `AGENTS.md` — the only file touched. Diff: `+63 / -4` lines (4 net line removals are re-wraps of two sentences I had to adjust so a stale cross-reference — "a different failure mode from the one above" — still points at the right section after a new section was inserted between them; no wording changed beyond that fix).
- Commit: `79b7f7a` — `docs(plugin): record four iteration-2 process lessons in AGENTS.md`.

## Self-review (fresh-eyes pass)

Re-read each addition against "would this have prevented the mistake it describes":

- **M2**: yes — the stated principle ("cannot distinguish 'no assertion failed' from 'no assertion ran'") is exactly the diagnostic question that would have caught the `jq` typo dropping 46 assertions; someone applying it would ask "does my harness know what count to expect," which the retired `run.sh` did not.
- **Scope of a measured fact**: yes — the closing instruction ("restate exactly what was measured — which process, which environment, one file, one run — before writing the rule down") directly targets the generalization step that produced the Task 4 defect (spike measured "for the hook," brief read "for the plugin's code").
- **Reachability/ownership**: yes — the closing question ("does this change make a defect exploitable, or a document false, that was not before?") is the question that was *not* asked when the resume-branch `knownRed` issue and the checkout-retirement spec falsehood were first flagged as "pre-existing" / "not this task's job."
- **Trace quoting**: yes — "do not accept a step you cannot point to a specific quoted sentence for" is precisely the check that was missing when Trace C's unsupported conclusion was accepted on a first pass.

One correction made during self-review: my first draft of the M2 paragraph claimed "every item below is an instance of" the principle. On re-reading, the *Compare failing identities, not failing counts* bullet in the same section is a related-but-distinct failure (a stable count masking swapped test identities, not literally "no assertion ran"). Softened the claim to avoid overclaiming a taxonomy the section doesn't actually have.

I also had to touch one sentence outside the four new items: *The spec is not a safe substitute for the files* opened with "A different failure mode from the one above" — a pronoun reference that pointed at *Fixing the document about the artifact is not fixing the artifact* only because the two sections were adjacent. Inserting the new reachability/ownership section between them broke that adjacency, so the pronoun would have silently pointed at the wrong section. Fixed by naming the section explicitly instead of using "the one above." This is the only edit to pre-existing prose; no claims were changed, only the cross-reference.

## Verification

- `node --test` (no args, repo root): **326 tests, 325 pass, 0 fail, 0 cancelled, 0 skipped, 1 todo** — matches the required baseline exactly.
- `npm run smoke`: **11/11 pass**.
- Both run after the `AGENTS.md` edits landed, not before.

## Concerns

- The `advisor` tool was unavailable ("temporarily overloaded") when I attempted to consult it before committing. I proceeded on my own careful self-review instead (see above), grounding every claim in `progress.md` line references and checking each addition against the "would this have prevented the mistake" test. No other concerns — the change is documentation-only, the two suites are unaffected and both green, and every factual claim added traces to a specific ledger entry rather than being invented.
- This was the plan's final task (Task 14). No further tasks remain in the plan.

## Fix round 1/5 — one Important, one Minor

The reviewer confirmed three of the four additions accurate, well-sourced, non-duplicative, and concrete — including the
judgment call to fold M2 into the existing *A green suite is not evidence* section rather than give it a new heading — and
specifically checked that "six more times" was not inflated. Two findings, both in *The scope of a measured fact is part of
the fact*:

**Important — misattribution.** The original text read:

> Task 4's brief read that as "set for the plugin's code" and ordered preflight to read the Node-version floor from
> `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs`. It is unset in the orchestrator's own shell ... so the fix reproduced the exact
> "unreadable floor → stop" failure it was meant to close, the same one a bare relative path had already been rejected for.

This wrongly credited **Task 4's original brief** with the `${CLAUDE_PLUGIN_ROOT}` generalisation. Verified against
`progress.md:337-406`:

- Task 4's original brief and shipped text (commits `590ff6f`, `d57c791`) used a **bare relative** `hooks/lib/rules.mjs` path —
  no `CLAUDE_PLUGIN_ROOT` anywhere in it.
- A reviewer flagged the bare path as unresolvable from the orchestrator's cwd (`progress.md:352-356`).
- The controller then dispatched "Task 4: fix round 1/5" (`progress.md:382-385`, FIX_BASE `d57c791`, commits `bd5561a..0d33cad`)
  ordering the switch to `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs`.
- The controller's own words on the origin of the over-generalisation, from the round-1-reversed-in-round-2 entry
  (`progress.md:399-402`): "`CLAUDE_PLUGIN_ROOT` is set for the **hook process** ... that is what the Tier 0 spike measured,
  and **I over-generalised it into a ruling.** The fix I ordered therefore failed exactly the way the bare relative path
  failed" and (`progress.md:406`) "The implementer did what I asked, correctly. The defect is mine."

So the generalisation was the **controller's round-1 fix ruling**, not the implementer's original brief. The sentence was also
internally inconsistent as written — "the same one a bare relative path had already been rejected for" only parses if the
`${CLAUDE_PLUGIN_ROOT}` path had *not* already replaced the bare relative one, contradicting the clause immediately before it.

Corrected sentence (`AGENTS.md:238-247`):

> A different failure from the ones above: not a wrong measurement, but a correct one generalised past what it covered — and,
> unlike the brief errors elsewhere in this file, generalised in a **fix ruling**, not in the original brief. The Tier 0 spike
> proved `CLAUDE_PLUGIN_ROOT` is set **for the hook process** Claude Code spawns — that is what was actually measured. Task 4's
> original brief and shipped text had preflight read the Node-version floor from a bare relative `hooks/lib/rules.mjs`; a
> reviewer correctly flagged that as unresolvable, since `/tdd-init` and `/tdd` run with cwd set to the *user's* project, not
> the plugin's. **The round-1 fix ruling — ordered by the controller in response to that finding, not written by the
> implementer** — routed the read through `${CLAUDE_PLUGIN_ROOT}/hooks/lib/rules.mjs` instead, reading the spike's finding as
> "set for the plugin's code." `CLAUDE_PLUGIN_ROOT` turned out to be unset in the orchestrator's own shell too — verified
> directly — so the round-1 fix reproduced the exact same "orchestrator cannot read the file" failure the reviewer had just
> flagged, only behind a different broken path.

This now matches the ledger's own categorical distinction between a "controller brief error" and a "controller ruling
reversed in round 2" — the two are tracked as separate failure classes in `progress.md`, and the original AGENTS.md sentence
had collapsed them.

**Minor — overclaimed family membership.** Original: "several of the other items in this section are the same family."
Verified against the section's actual bullets: only *Compare failing identities, not failing counts* shares the specific
shape (a stable count masking a fully swapped test set); the empty-match and vacuous-pass bullets are related failure modes
but not that one. Narrowed to name the one bullet directly (`AGENTS.md:104-106`).

**Verification after the fix:**
- `node --test` (no args, repo root): 326 tests, 325 pass, 0 fail, 0 cancelled, 0 skipped, 1 todo.
- `npm run smoke`: 11/11 pass.
- Commit: `6cce7b9` — `fix(plugin): correct misattribution in the CLAUDE_PLUGIN_ROOT lesson`.
