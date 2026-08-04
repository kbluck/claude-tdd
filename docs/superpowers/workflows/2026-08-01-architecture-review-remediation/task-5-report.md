# Task 5 Report: Correct the enforcement claim in the prompts

## Summary

Edited all four `agents/*.md` files. Two changes per file:

1. Reworded the sentence claiming the `PreToolUse` guard "enforces" the role's read/write boundary. As written it overclaimed —
   the guard only blocks *direct* `Read`/`Write` calls on the wrong path — which is the same overclaim the spec's *Threat model*
   and *The hook and the audit are not redundant* sections were revised to remove. Reworded to state only what the guard
   actually blocks.
2. Added a short paragraph naming the indirect route — writing a file that causes the forbidden file's contents to surface
   through the agent's own configured test command, which draws zero guard denials — forbidding it explicitly, and pointing at
   the legitimate channel and escape valve that role already has.

Also tightened the "you may read what the runner prints" carve-outs already present in `tdd-green.md` and `tdd-refactor.md` so
they cover only output the runner produces on its own, not output a role manufactures by writing code that prints more than
that — closing a loophole where the existing carve-out text could otherwise be read as blessing the exfiltration channel.

Markdown-only change. No frontmatter touched (`name:`, `tools:`, `model:`, `color:`, `description:` are byte-identical to
before), so `tests/agents.test.mjs`'s pin against the guard's dispatch table is unaffected.

## What changed, with before/after

### `agents/tdd-red.md`

**Before:**
> A `PreToolUse` guard enforces this. If a file-path denial comes back, you have strayed outside your role — do not work around
> it, adjust and continue.

**After:**
> A `PreToolUse` guard blocks you from reading or writing a source file directly. If a file-path denial comes back, you have
> strayed outside your role — do not work around it, adjust and continue.
>
> **The guard cannot stop an indirect route, so holding it is on you.** A test that opens a source file and prints its text —
> `print(open(path).read())` or anything with the same effect — then surfaces that text in the output of the test command you
> run yourself, with no denial anywhere; that is still reading the source, and the guard's silence does not make it permitted.
> This is distinct from a test normally calling the code under test, which is expected. If you need an existing signature or
> convention the spec does not state, read the spec and any existing test files for it — the same sources your procedure
> already has you consult. If that is still not enough, report `outcome: "blocked"` with the reason instead of reaching for the
> file.

**The moment this fires:** Red is writing a test for a behavior that builds on an already-implemented API from an earlier
cycle (e.g., item 2 needs to call the `Parser` class item 1's Green established), the spec's prose does not spell out the exact
signature, and `Read` on the source file is denied. The rationalization is "let me just print it from a scratch test to see the
real signature." The new text names that exact move, says the guard will not catch it, and redirects to the channel Red's own
procedure step 1 already grants (spec + existing tests, which Red may read) — falling back to `outcome: "blocked"`, a value
already in Red's report schema, rather than inventing a workaround.

**Deliberate divergence from the brief's wording.** The brief and my own advisor call said "Red already receives `publicApi` in
its input for exactly this reason." I checked this against the file: Red's "Your input" section lists only the spec path, the
checklist item, and the test/coverage commands — `publicApi` is a field in Red's *output* report (it is the signature Red
*invents* and hands to Green), not something Red receives as input. Writing "you already have `publicApi` as input" into this
file would have been false on its face, contradicted by the "Your input" section nine lines below it in the same file. I
pointed instead at what the file actually documents as Red's legitimate channel: the spec and existing test files, which
Red's procedure step 1 already instructs it to read. This satisfies the brief's intent (name the channel that exists) without
introducing a new factual inaccuracy of the exact kind this task exists to remove.

### `agents/tdd-green.md`

**Before:**
> A `PreToolUse` guard enforces this. If a file-path denial comes back, you have strayed outside your role — do not work
> around it, adjust and continue.

**After:**
> A `PreToolUse` guard blocks you from reading or writing a test file directly. If a file-path denial comes back, you have
> strayed outside your role — do not work around it, adjust and continue.
>
> **The guard cannot stop an indirect route, so holding it is on you.** Source that prints or logs a test file's text —
> directly, or by writing something the single-test command's own import of your module then dumps — surfaces the test with no
> denial anywhere; that is still reading the test, and the guard's silence does not make it permitted. If `publicApi`,
> `intent`, and `expected` do not tell you enough to implement correctly, that is a `stuck` report, not a reason to go looking.

Second change, the carve-out:

**Before:**
> **You cannot open the test file.** You may read what the runner prints — test names, assertion diffs, tracebacks. That is
> your only window into the test, and it is enough.

**After:**
> **You cannot open the test file.** You may read what the runner prints on its own when your code fails — test names,
> assertion diffs, tracebacks. That is your only window into the test, and it is enough. It is not license to write code that
> makes the runner print more than that.

**The moment this fires:** Green is implementing from `expected`/`intent` and is unsure exactly what the test asserts — the
symmetric pressure to Red's. The reproduced bypass is a source file that, on import, prints the test file it is imported by;
running the configured single-test command then surfaces it in captured output with zero denials. The new text names that
route and redirects to `stuck`, Green's existing escape valve for "the handover report is not enough," which is already in
its report schema. The carve-out tightening closes the reading that "you may read what the runner prints" licenses writing
code that manufactures extra output — it now scopes to what the runner prints *on its own* when the test fails.

### `agents/tdd-refactor.md`

**Before:**
> A `PreToolUse` guard enforces this. If a file-path denial comes back, you have strayed outside your role — do not work
> around it, adjust and continue.

**After:**
> A `PreToolUse` guard blocks you from reading or writing a test file directly. If a file-path denial comes back, you have
> strayed outside your role — do not work around it, adjust and continue.
>
> **The guard cannot stop an indirect route, so holding it is on you.** Source that prints or logs a test file's text,
> surfaced when the full suite you run imports it, is still reading the test — no denial fires, because nothing you wrote
> touched the test file directly. If you are unsure whether a rename or move is safe, run the suite and read what it tells
> you; that is your channel, not code that makes it tell you more.

Second change, the "Your window into the tests" carve-out:

**Before:**
> **You may never open a test file.** You may read everything the runner prints — test names, failure messages, assertion
> diffs, tracebacks that quote source lines. That is not a violation; it is your only feedback channel, and it is sufficient.

**After:**
> **You may never open a test file.** You may read everything the runner prints on its own when your change breaks something —
> test names, failure messages, assertion diffs, tracebacks that quote source lines. That is not a violation; it is your only
> feedback channel, and it is sufficient. Writing code that makes the runner print more than that, so a test file passes
> through it, is the same violation as opening the file directly.

**Why Refactor gets this too, and what's different about its moment.** Refactor may write source and runs the full suite, so
the same channel (source that dumps a test file's contents when the suite imports it) is structurally available to it, even
though its motive differs from Red's/Green's — it is not chasing a signature, it is trying to be *certain* a rename or move
will not silently break a test it cannot see. "Add a debug print to confirm what the test checks before I commit to the
rename" is the shape this catches. The redirect points at the suite's own pass/fail output, which is Refactor's designed
feedback channel per its existing "Your window into the tests" section, plus `blocked` as the escape valve already in its
report schema for "I cannot tell my breakage from inherited breakage."

### `agents/tdd-mutate.md`

**Before:**
> A `PreToolUse` guard enforces your boundaries. If a file-path denial comes back, you have strayed outside your role — do
> not work around it, adjust and continue.

**After:**
> A `PreToolUse` guard blocks you from reading or writing a test file directly. If a file-path denial comes back, you have
> strayed outside your role — do not work around it, adjust and continue.
>
> **The guard cannot stop an indirect route, so holding it is on you.** A mutation that prints or logs a test file's text,
> surfaced when the suite you run imports it, is still reading the test — no denial fires, because nothing you wrote touched
> the test file directly. When you are staring at a survivor and want to know exactly what the test asserts, that is the
> moment to stop: write `missingBehavior` from what the runner told you, not from a peek you engineered.

**Why Mutate gets this too, and what's the strongest moment of the four.** Mutate is the role most likely to reach for this:
it stares at a surviving mutant — proof some test failed to notice a semantic change — and the very next instinct is "let me
see what that test actually asserts, so I can describe the gap precisely." Nothing else in Mutate's role blocks that
curiosity; its whole job is diagnosing test weakness. The redirect points at `missingBehavior`, the field Mutate's own report
schema already asks it to write from "what a test *would have to* assert to catch this" — a description derivable entirely
from the mutation and the runner's pass/fail signal, with no need to see the test's actual content.

## No `commands.singleTerse` added

Confirmed by inspection (`grep -rn "singleTerse" agents/`) that none of the four files mention it. This task's edits are
entirely inside the paragraphs described above; `observedFailure`'s "verbatim runner output" wording in `tdd-red.md` and
`tdd-green.md` was left untouched, as instructed — that is Task 8's leak to close, not this one's.

## Grep for "sole enforcement"

```
$ grep -rn "sole enforcement" . --include="*" | grep -v '.git/'
docs/superpowers/plans/2026-08-01-architecture-review-remediation.md:168:**Done when.** `git show --stat` names files under `agents/`, and no file in the repository contains "sole enforcement".
docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md:371:**What the hook delivers, stated precisely** *(iteration 2 — this previously read "sole enforcement of read isolation", which is false as written)*. ...
docs/superpowers/reviews/2026-08-01-architecture-review.md:161:2. Downgrade the wording at lines 210–212 from "sole enforcement" to something defensible: the hook
docs/superpowers/reviews/2026-08-01-architecture-review.md:803:**R3. Correct the enforcement claim and add a threat model (S1, S5a).** Downgrade "sole enforcement
```

All four hits pre-date this task and are quotations, not assertions: the plan's own "Done when" line quotes the forbidden
phrase to state the criterion (making the criterion as literally written technically unsatisfiable — see *Concerns* below);
the spec line quotes it inside a parenthetical noting it was *removed*; the two review hits are the reviewer's own
recommendation text, quoting the phrase to say it should be downgraded. None of my edits introduced a new occurrence, and none
of the four `agents/*.md` files contained it before or after.

## Self-review findings

Called `advisor()` before drafting. It flagged five things I incorporated:

1. Don't let "the guard cannot catch this" read as permission — revise the adjacent "guard enforces this" sentence rather
   than leaving a contradiction two lines away. Done in all four files (see before/afters above).
2. State the ban by effect ("no file you author may cause the contents of a forbidden-class file to appear anywhere you can
   observe"), not by one spelling (`print(open(...).read())`) — an agent told only "don't print" will assert on the content,
   `inspect.getsource`, or write it somewhere it may read instead. I used the `print(open(path).read())` example in Red only
   as an illustration of the *shape*, paired with the effect-level ban ("that is still reading the source... surfaces that
   text... no denial anywhere"); Green/Refactor/Mutate's versions are effect-level only, with no single-spelling example, to
   avoid implying the ban is scoped to that one spelling.
3. Close the carve-out loophole in Green and Refactor's "you may read what the runner prints" language, since as originally
   written it could be read as blessing the exfiltration channel. Done (see the two carve-out before/afters above).
4. Don't mention the Task-9 commit-time detector in Refactor or Mutate — their mutate/revert procedures never reach a commit,
   so the detector cannot see them at all, and citing it there would be actively misleading. I did not mention the detector
   in any of the four files; none of my additions reference it, so this was a non-issue rather than something to remove.
5. Keep each addition to roughly 3–5 sentences. Each of the four additions is one bolded lead sentence plus 2–4 supporting
   sentences — checked by re-reading all four after drafting.

I diverged from the brief's/advisor's literal claim that "Red already receives `publicApi` in its input" (see the `tdd-red.md`
section above) after checking it against Red's actual "Your input" list in the same file and finding it false — `publicApi`
is Red's own report output, not a field the orchestrator hands it. Substituting the channel the file actually documents (spec
+ existing tests, from Red's own procedure step 1) avoids introducing a new internal contradiction of exactly the kind this
task exists to remove.

Checked for scope creep: `git diff --stat` after committing shows only the four `agents/*.md` files, nothing under
`docs/superpowers/specs/`, `docs/superpowers/plans/`, or `skills/`.

## Verification

`node --test` from the repo root, before and after the edits:

```
# tests 297
# suites 0
# pass 294
# fail 2
# cancelled 0
# skipped 0
# todo 1
```

Both failures, before and after, are the same named Task-8 baseline:
- `not ok 90 - drift check: every key the spec declares also appears in tests/fixtures/config.json`
- `not ok 91 - drift check: every key the spec declares also appears in the tdd-init.md Step 7 template`

No other test regressed or newly failed. `tests/agents.test.mjs` (the file that pins each agent's `name:` frontmatter against
the guard's dispatch table) passes unchanged, since no frontmatter field was touched — confirmed by diffing each file's
frontmatter block (lines 1–7) before and after, byte-identical in all four.

## Files changed

- `/Users/kbluck/Claude/code/claude-tdd/agents/tdd-red.md`
- `/Users/kbluck/Claude/code/claude-tdd/agents/tdd-green.md`
- `/Users/kbluck/Claude/code/claude-tdd/agents/tdd-refactor.md`
- `/Users/kbluck/Claude/code/claude-tdd/agents/tdd-mutate.md`

Commit: `9c2172b` — `fix(agent): forbid the indirect route around read isolation`

`git show --stat HEAD` names exactly these four files under `agents/` and nothing else.

## Concerns

None blocking. One note for the record, not something I chased: the plan's own "Done when" line (line 168) contains the
literal string "sole enforcement" as part of stating the criterion itself, so the criterion as written is technically
self-violating if read as a bare substring check against the whole repository. The intended reading is clearly "no file
*asserts* the claim" — the plan line and the two review hits are quoting the forbidden phrase to describe what to remove, not
committing it. I did not edit the plan (out of scope for this task) or treat this as a defect to fix; flagging it here so a
future full-repo lint for that phrase does not misfire on the plan and review documents.
