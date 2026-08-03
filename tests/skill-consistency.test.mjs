// Task 13 (2026-08-01-architecture-review-remediation): a set of narrow
// prose-consistency fixes to SKILL.md and agents/*.md, each routed here by a
// specific reviewer finding. There is no code path exercising any of this —
// SKILL.md is followed by an LLM orchestrator, not executed — so these tests
// pin the exact phrasing the fix landed as, scoped to the section it landed
// in, the same way tests/config-contract.test.mjs scopes its extraction to
// avoid a whole-file grep passing when the key is missing from the specific
// block a model actually copies from (see AGENTS.md, "Verification
// instruments lie").
//
// A prose-presence test proves less than a behavioural one. It is still
// worth more than nothing: it fails loudly the day someone edits the
// surrounding section and drops the sentence this task added, which is
// exactly the kind of drift AGENTS.md's "Fixing the document about the
// artifact is not fixing the artifact" warns about — except here the
// artifact IS the document.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'run-tdd-cycle', 'SKILL.md');
const RED_AGENT_PATH = path.join(REPO_ROOT, 'agents', 'tdd-red.md');
const REFACTOR_AGENT_PATH = path.join(REPO_ROOT, 'agents', 'tdd-refactor.md');
const SPEC_PATH = path.join(REPO_ROOT, 'docs', 'superpowers', 'specs', '2026-07-30-tdd-subagent-workflow-design.md');

const skillText = fs.readFileSync(SKILL_PATH, 'utf8');
const redAgentText = fs.readFileSync(RED_AGENT_PATH, 'utf8');
const refactorAgentText = fs.readFileSync(REFACTOR_AGENT_PATH, 'utf8');
const specText = fs.readFileSync(SPEC_PATH, 'utf8');

/** Lines from the first startRe match through the line BEFORE the next endRe match (exclusive of endRe). Returns null if startRe never matches. */
function extractSection(text, startRe, endRe) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => startRe.test(l));
  if (startIdx === -1) return null;
  let endIdx = lines.findIndex((l, i) => i > startIdx && endRe.test(l));
  if (endIdx === -1) endIdx = lines.length;
  return lines.slice(startIdx, endIdx).join('\n');
}

// ---------------------------------------------------------------------------
// I5: Green's dispatch must name BOTH Red's handover report and
// limits.greenAttempts. tdd-green.md step 3 expects the attempt limit
// directly from the orchestrator; SKILL.md previously said "only" the report.
// ---------------------------------------------------------------------------

const greenSection = extractSection(skillText, /^### Green$/, /^### Refactor trigger check$/);

test('SKILL.md located the Green per-item section', () => {
  assert.notEqual(greenSection, null);
});

test("SKILL.md's Green dispatch step names both the handover report and limits.greenAttempts (I5)", () => {
  assert.ok(/Dispatch `tdd-green`/.test(greenSection ?? ''), 'could not find the Green dispatch line');
  assert.ok(/Red's handover report/.test(greenSection ?? ''), 'Green dispatch no longer mentions the handover report');
  assert.ok(/limits\.greenAttempts/.test(greenSection ?? ''), 'Green dispatch does not mention limits.greenAttempts');
});

// ---------------------------------------------------------------------------
// I4: testId must be validated against globs.test orchestrator-side before
// it is ever run, not merely trusted from Red's report.
// ---------------------------------------------------------------------------

const redSection = extractSection(skillText, /^### Red$/, /^### Green$/);

test('SKILL.md located the Red per-item section', () => {
  assert.notEqual(redSection, null);
});

test("SKILL.md's Red audit validates testId against globs.test before it is used (I4)", () => {
  assert.ok(/validate `testId`/.test(redSection ?? ''), 'no testId validation instruction found in the Red audit');
  assert.ok(
    /confirm it matches `globs\.test`/.test(redSection ?? ''),
    'testId validation does not check it against globs.test',
  );
});

test('rules.mjs still rejects ".." in the Bash delta as defence in depth behind the orchestrator-side testId check', () => {
  const rulesText = fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'lib', 'rules.mjs'), 'utf8');
  assert.ok(rulesText.includes("delta.includes('..')"), "bashVerdict's '..' rejection is gone — I4's defence in depth is not in place");
});

// ---------------------------------------------------------------------------
// I8: tdd-mutate's blocked outcome must be tied to stop-and-escalate, the
// same way Red's, Green's and Refactor's are.
// ---------------------------------------------------------------------------

const mutationSection = extractSection(skillText, /^## Mutation pass$/, /^## Completion$/);

test('SKILL.md located the Mutation pass section', () => {
  assert.notEqual(mutationSection, null);
});

test("SKILL.md ties tdd-mutate's blocked outcome to stop-and-escalate (I8)", () => {
  assert.ok(/outcome: "blocked"/.test(mutationSection ?? ''), "no blocked-outcome branch found in the Mutation pass section");
  assert.ok(/stop and escalate/i.test(mutationSection ?? ''), 'blocked branch does not say stop and escalate');
});

// ---------------------------------------------------------------------------
// Task 7 deferred item: Refactor's own audit needs an explicit
// Violation -> revert branch, matching Red's and Green's.
// ---------------------------------------------------------------------------

const refactorSection = extractSection(skillText, /^### Refactor trigger check$/, /^## Mutation pass$/);

test('SKILL.md located the Refactor per-item section', () => {
  assert.notEqual(refactorSection, null);
});

test("SKILL.md's Refactor audit has an explicit Violation -> revert branch (Task 7 deferred item)", () => {
  assert.ok(
    /Violation \(glob mismatch\) → revert/.test(refactorSection ?? ''),
    "Refactor's audit has no explicit Violation -> revert branch",
  );
  assert.ok(/limits\.violationRetries/.test(refactorSection ?? ''), 'Refactor violation branch does not mention the retry limit');
});

test("the Reverting-a-dispatch site count reflects Refactor's new audit branch (nine sites become ten)", () => {
  const revertingSection = extractSection(skillText, /^## Reverting a dispatch$/, /^## Coverage baselines$/);
  assert.notEqual(revertingSection, null);
  assert.ok(
    /ten separate edits at every call site/.test(revertingSection ?? ''),
    "the historical site count was not updated after Refactor's audit gained a revert branch (still says 'nine')",
  );
  assert.ok(!/nine separate edits/.test(revertingSection ?? ''), 'the stale "nine separate edits" count is still present');
});

// ---------------------------------------------------------------------------
// Task 6 deferred item: the mutation-pass item-append literal must declare
// testId: null, matching the decompose-time schema's "every loop-read field
// is declared" rule.
// ---------------------------------------------------------------------------

test('the mutation-pass item-append literal declares "testId": null (Task 6 deferred item)', () => {
  const appendBlock = extractSection(skillText, /"id": <next>, "behavior":/, /^7\./);
  assert.notEqual(appendBlock, null, 'could not locate the mutation-pass append literal');
  assert.ok(appendBlock.includes('"testId": null'), 'the append literal is missing "testId": null');
});

// ---------------------------------------------------------------------------
// S5b: coverage baselines must be persisted into checklist.json, not held
// only in the orchestrator's own context.
// ---------------------------------------------------------------------------

const baselinesSection = extractSection(skillText, /^## Coverage baselines$/, /^## Per item$/);

test('SKILL.md located the Coverage baselines section', () => {
  assert.notEqual(baselinesSection, null);
});

test("SKILL.md instructs writing captured coverage baselines to checklist.json's baselines field (S5b)", () => {
  assert.ok(/write it to `checklist\.json`'s `baselines` field/.test(baselinesSection ?? ''), 'no instruction to persist the baseline to disk');
  assert.ok(/"uncoveredLines"/.test(baselinesSection ?? ''), 'baselines field shape (uncoveredLines) not shown');
  assert.ok(/"capturedAt"/.test(baselinesSection ?? ''), 'baselines field shape (capturedAt) not shown');
});

// ---------------------------------------------------------------------------
// I7: tdd-red.md's "Your input" omitted the coverage baseline its own step 4
// compares against; tdd-refactor.md's omitted knownRed (step 1 uses it) and,
// found alongside it, the coverage command (step 2 uses it).
// ---------------------------------------------------------------------------

const redInputSection = extractSection(redAgentText, /^## Your input$/, /^## Your objective$/);
const refactorInputSection = extractSection(refactorAgentText, /^## Your input$/, /^## Your window into the tests$/);

test('tdd-red.md located its "Your input" section', () => {
  assert.notEqual(redInputSection, null);
});

test('tdd-red.md declares the coverage baseline as an input (I7)', () => {
  assert.ok(/coverage baseline/.test(redInputSection ?? ''), 'tdd-red.md\'s "Your input" does not mention the coverage baseline');
});

test('tdd-refactor.md located its "Your input" section', () => {
  assert.notEqual(refactorInputSection, null);
});

test('tdd-refactor.md declares knownRed as an input (I7)', () => {
  assert.ok(/`knownRed`/.test(refactorInputSection ?? ''), 'tdd-refactor.md\'s "Your input" does not mention knownRed');
});

test('tdd-refactor.md declares the coverage command as an input (self-identified alongside I7)', () => {
  assert.ok(/coverage command/.test(refactorInputSection ?? ''), 'tdd-refactor.md\'s "Your input" does not mention the coverage command');
});

// ---------------------------------------------------------------------------
// Task 9 deferred item, authorised for a spec edit: the spec named all four
// content-scan tokens uniformly as hits; SKILL.md correctly demotes
// require(/include. The spec was the one that was too absolute.
// ---------------------------------------------------------------------------

test("the spec no longer claims require(/include are unconditional content-scan hits", () => {
  const detectionSection = extractSection(specText, /\*\*Detection where prevention is impossible\*\*/, /\*\*Its ceiling must be stated/);
  assert.notEqual(detectionSection, null, 'could not locate the detection-where-prevention-is-impossible paragraph');
  assert.ok(
    /not\*\*, by itself/.test(detectionSection) || /is \*\*not\*\*/.test(detectionSection),
    'the spec does not carve out require(/include the way SKILL.md does',
  );
  assert.ok(
    !/\(`open\(`, `require\(`, `include`, `File\.read`\)/.test(detectionSection),
    'the spec still lists all four tokens uniformly as hit-triggers',
  );
});
