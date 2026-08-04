// node:test port of tests/config-contract.test.sh.
//
// Pins the .tdd/config.json schema that /tdd-init must produce and that the
// guard and orchestrator consume. Three independent copies of this schema
// exist (the fixture, commands/tdd-init.md's Step 7 template, and the spec's
// own example block) and they have drifted from each other before — see the
// comments inline, and AGENTS.md's "Fixing the document about the artifact
// is not fixing the artifact".
//
// This file mostly does not touch hooks/lib/rules.mjs and is not expected to
// be red-because-of-a-stub. All of it pins a property the repository already
// satisfies (like agents.test.mjs), including the singleTerse drift check at
// the bottom: it was a deliberate RED recording a real gap (plan Task 8) when
// written, and now passes -- commands.singleTerse landed in both the fixture
// and the tdd-init.md Step 7 template, closing the gap it was recording. The
// Node floor drift check near the bottom DOES import hooks/lib/rules.mjs, but
// only to read the already-implemented NODE_FLOOR constant (Task 3), not to
// exercise a stub.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_FLOOR } from '../hooks/lib/rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'config.json');
const INIT_PATH = path.join(REPO_ROOT, 'commands', 'tdd-init.md');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'run-tdd-cycle', 'SKILL.md');
const SPEC_PATH = path.join(REPO_ROOT, 'docs', 'superpowers', 'specs', '2026-07-30-tdd-subagent-workflow-design.md');

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

/** Dotted-path lookup: getPath(obj, 'refactorTriggers.maxCrap'). */
function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

/** Whether `obj` has own property `key` at the given dotted parent path (present even if the value is null). */
function hasPath(obj, dotted) {
  const parts = dotted.split('.');
  const leaf = parts.pop();
  const parent = parts.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
  return !!parent && typeof parent === 'object' && Object.prototype.hasOwnProperty.call(parent, leaf);
}

/**
 * Every object key appearing ANYWHERE in the JSON value, with multiplicity —
 * mirrors `jq -r 'paths | .[-1] | select(type=="string")'`, which the bash
 * suite used to derive the expected key list from the fixture instead of
 * hand-maintaining a second list that could drift from it. Array elements
 * are walked but contribute no keys of their own (their jq path segment is a
 * number, filtered out by `select(type=="string")`).
 */
function collectKeyOccurrences(node, acc = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectKeyOccurrences(item, acc);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      acc.push(k);
      collectKeyOccurrences(v, acc);
    }
  }
  return acc;
}

/** sed -n '/startRe/,/endRe/p' semantics: lines from the first startRe match through the next endRe match, inclusive. Returns null if startRe never matches. */
function extractLineRange(text, startRe, endRe) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => startRe.test(l));
  if (startIdx === -1) return null;
  let endIdx = lines.findIndex((l, i) => i >= startIdx && endRe.test(l));
  if (endIdx === -1) endIdx = lines.length - 1;
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

/** Count of literal `"key":` occurrences in `text` — mirrors `grep -o "\"${k}\":" | wc -l`. */
function countKeyDeclarations(text, key) {
  const re = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}":`, 'g');
  return (text.match(re) || []).length;
}

// ---------------------------------------------------------------------------
// Keys that must be present AND non-null in the fixture.
// ---------------------------------------------------------------------------

const REQUIRED_NON_NULL = [
  'version', 'crapMode',
  'commands.test', 'commands.single',
  'globs.test', 'globs.source', 'globs.ignore',
  'refactorTriggers.maxCrap', 'refactorTriggers.duplicateThreshold', 'refactorTriggers.maxFunctionLines',
  'limits.greenAttempts', 'limits.violationRetries', 'limits.mutationRounds', 'limits.mutantsPerPass',
  'coverageGates.greenMaxNewUncovered', 'coverageGates.refactorMaxNewUncovered',
];

for (const key of REQUIRED_NON_NULL) {
  test(`config fixture has non-null ${key}`, () => {
    assert.notEqual(getPath(fixture, key), null, `${key} must be present and non-null`);
    assert.notEqual(getPath(fixture, key), undefined, `${key} must be present`);
  });
}

// ---------------------------------------------------------------------------
// Keys that must be PRESENT but may be null — absence and null mean
// different things. Null is "this toolchain has no such tool, degrade
// explicitly"; absent means /tdd-init forgot to decide.
// ---------------------------------------------------------------------------

for (const key of ['coverage', 'complexity', 'mutation', 'singleTerse']) {
  test(`config fixture declares commands.${key} (null is allowed, absent is not)`, () => {
    assert.ok(hasPath(fixture, `commands.${key}`), `commands.${key} must be a declared key, even if its value is null`);
  });
}

for (const key of ['test', 'source', 'ignore']) {
  test(`config fixture globs.${key} is an array`, () => {
    assert.ok(Array.isArray(getPath(fixture, `globs.${key}`)), `globs.${key} must be an array — a bare string would word-split into per-character globs`);
  });
}

// ---------------------------------------------------------------------------
// commands/tdd-init.md's Step 7 template is a SECOND copy of this schema.
// Scoped to the Step 7 JSON block, NOT the whole file: several of these key
// names also appear in surrounding prose (the detection table, the
// degradation table), so a whole-file match would pass even when the key is
// missing from the block a model actually copies from.
// ---------------------------------------------------------------------------

const initText = fs.readFileSync(INIT_PATH, 'utf8');
const initBlock = extractLineRange(initText, /^## 7\. Write the files/, /^Append to/);

test('tdd-init.md: the Step 7 JSON block was located at all (start anchor holds)', () => {
  assert.notEqual(initBlock, null, "'## 7. Write the files' heading not found — every assertion below would fail in a heap for this one reason");
  assert.ok(initBlock.includes('version'), 'the located block does not look like the config template');
});

test('tdd-init.md: the extracted block stops before step 8 (end anchor still matches)', () => {
  // If the end anchor stopped matching, extractLineRange runs to EOF instead
  // of the intended boundary, silently re-widening the haystack toward the
  // whole-file behaviour this scoping exists to avoid.
  assert.ok(!initBlock.includes('## 8'), 'the extracted block reached step 8 — the end anchor is no longer matching');
});

const fixtureKeyOccurrences = collectKeyOccurrences(fixture);
const fixtureKeyCounts = new Map();
for (const k of fixtureKeyOccurrences) fixtureKeyCounts.set(k, (fixtureKeyCounts.get(k) || 0) + 1);

let initKeysChecked = 0;
for (const key of [...fixtureKeyCounts.keys()].sort()) {
  test(`tdd-init.md's template declares ${key} (${fixtureKeyCounts.get(key)}x)`, () => {
    assert.equal(countKeyDeclarations(initBlock ?? '', key), fixtureKeyCounts.get(key));
  });
  initKeysChecked++;
}

test('tdd-init.md: the derived template loop enumerated at least 19 keys (a broken jq/regex filter must not silently shrink the check)', () => {
  assert.ok(initKeysChecked >= 19, `expected at least 19 distinct keys derived from the fixture, saw ${initKeysChecked}`);
});

// ---------------------------------------------------------------------------
// Step 8 (Commit) must verify its own commit landed, not just report success.
// `git add` on a gitignored path is a silent no-op without `-f`: the commit
// still exits 0, but .tdd/config.json stays untracked and the first-run path
// this step exists to protect breaks again on the very next /tdd preflight.
// Plan Task 10 ("config-committed contradiction and the missing-config
// test"); spec line ~588 names the exact check: `git ls-files
// .tdd/config.json` must be non-empty after the commit.
//
// Scoped to the Step 8 block, not the whole file — the same reasoning as the
// Step 7 scoping above: "git" and "commit" both appear elsewhere in this
// document's prose (step 1's git-repo prerequisite, the closing summary in
// step 9), so a whole-file match would pass even if the verification command
// were missing from the block a model actually acts on.
// ---------------------------------------------------------------------------

const step8Block = extractLineRange(initText, /^## 8\. Commit/, /^## 9\./);

test('tdd-init.md: the Step 8 (Commit) block was located at all (start anchor holds)', () => {
  assert.notEqual(step8Block, null, "'## 8. Commit' heading not found — every assertion below would fail in a heap for this one reason");
  assert.ok(step8Block.includes('git commit'), 'the located block does not look like the commit step');
});

test('tdd-init.md: the extracted Step 8 block stops before step 9 (end anchor still matches)', () => {
  // If the end anchor stopped matching, extractLineRange runs to EOF instead
  // of the intended boundary, silently sweeping in step 9's prose (which also
  // mentions "committed") and corrupting the assertion below into a
  // whole-file-equivalent check.
  assert.ok(!step8Block.includes('/tdd <spec-path>'), 'the extracted block reached step 9\'s closing summary — the end anchor is no longer matching');
});

test('tdd-init.md: Step 8 verifies its own commit landed via `git ls-files .tdd/config.json`', () => {
  assert.ok(
    (step8Block ?? '').includes('git ls-files .tdd/config.json'),
    'Step 8 must run `git ls-files .tdd/config.json` after committing and confirm it is non-empty — ' +
      'a silent `git add` no-op on a gitignored path would otherwise leave .tdd/config.json untracked ' +
      'with no error, breaking the first-run path this step exists to protect',
  );
});

// ---------------------------------------------------------------------------
// The spec holds a THIRD copy of this schema. Drift there misleads whoever
// reads the design next — which is how the template drifted in the first
// place (see the singleTerse check at the bottom of this file).
// ---------------------------------------------------------------------------

const specText = fs.readFileSync(SPEC_PATH, 'utf8');
// NOTE: the start pattern intentionally has NO leading `^` — the block is
// indented inside a fenced code sample, so the line reads `  "version": 1,`.
// This mirrors the bash original's `sed -n '/"version": 1,/,/^}/p'` exactly.
const specBlock = extractLineRange(specText, /"version": 1,/, /^\}/);

test("spec: the schema block was located at all (start anchor '\"version\": 1,' holds)", () => {
  assert.notEqual(specBlock, null, 'the spec schema block start anchor did not match');
  assert.ok(specBlock.includes('crapMode'), 'the located block does not look like the config schema');
});

test('spec: the schema block ends at its closing brace (end anchor still matches)', () => {
  // Stronger than a content marker: does not depend on what happens to
  // follow the block if the end anchor stops matching and sed/regex runs to
  // EOF, sweeping in trailing prose and corrupting every count below.
  const lastLine = specBlock.split('\n').at(-1);
  assert.equal(lastLine, '}');
});

let specKeysChecked = 0;
for (const key of [...fixtureKeyCounts.keys()].sort()) {
  test(`spec's schema declares ${key} (${fixtureKeyCounts.get(key)}x)`, () => {
    assert.equal(countKeyDeclarations(specBlock ?? '', key), fixtureKeyCounts.get(key));
  });
  specKeysChecked++;
}

test('spec: the derived schema loop enumerated at least 19 keys', () => {
  assert.ok(specKeysChecked >= 19, `expected at least 19 distinct keys derived from the fixture, saw ${specKeysChecked}`);
});

// ---------------------------------------------------------------------------
// NEW — the drift the fixture-derived loops above CANNOT see.
//
// Both loops above derive their expected keys FROM THE FIXTURE, so a key
// that is present in the spec but MISSING from the fixture (and therefore
// never checked against the template either) is structurally invisible to
// them — this is exactly the shape of gap the plan calls out: "The spec is
// deliberately the outlier. The iteration-2 revision added
// commands.singleTerse ... to the spec's schema blocks and to neither of the
// other two copies... The contract test derives its expected keys from the
// fixture and asserts presence, so an extra spec key does not fail it — the
// suite is green and the drift is unasserted, which is the shape of the
// defect that test exists to catch."
//
// This closes that hole by deriving keys from the SPEC instead, and
// asserting they also appear in the fixture and the template. This USED TO
// FAIL for commands.singleTerse, which was present in the spec's block and
// absent from both the fixture and commands/tdd-init.md -- that failure was
// the correct record of the gap plan Task 8 closed. singleTerse now appears
// in tests/fixtures/config.json and the tdd-init.md Step 7 template, so both
// drift checks below pass.
// ---------------------------------------------------------------------------

// JSON.parse(specBlock) is deliberately kept OUT of module scope and computed
// fresh inside each test body below (never cached at the top of the file):
// this is a hand-maintained prose document, not a dedicated JSON fixture, and
// a future edit that breaks the embedded JSON must fail the ONE test that
// depends on it — not crash collection for the entire file before any test
// runs (node:test's own version of "green means nothing": a throw during
// collection can report zero failures).
// The bash start anchor ('"version": 1,') matches the SECOND line of the
// object, not the opening brace — sed's range therefore captures the body of
// the object plus its closing '}', but not the opening '{'. Re-wrap it so
// JSON.parse sees a complete object; this is a text-extraction artifact, not
// a change to what the spec actually says.
function parseSpecBlock() {
  return JSON.parse(`{${specBlock}`);
}

function deriveSpecKeyCounts() {
  const schema = parseSpecBlock();
  const counts = new Map();
  for (const k of collectKeyOccurrences(schema)) counts.set(k, (counts.get(k) || 0) + 1);
  return counts;
}

test('setup sanity: the spec schema block parses as JSON once the opening brace sed\'s range excludes is restored', () => {
  assert.doesNotThrow(() => parseSpecBlock());
});

test('drift check: every key the spec declares also appears in tests/fixtures/config.json', () => {
  const specKeyCounts = deriveSpecKeyCounts();
  const specOnlyKeys = [...specKeyCounts.keys()].filter((k) => !fixtureKeyCounts.has(k));
  assert.deepEqual(
    specOnlyKeys,
    [],
    `key(s) declared in the spec's schema but absent from the fixture: ${specOnlyKeys.join(', ')} — ` +
      'this is the exact drift a fixture-derived loop cannot see (plan Task 8)',
  );
});

test('drift check: every key the spec declares also appears in the tdd-init.md Step 7 template', () => {
  const specKeyCounts = deriveSpecKeyCounts();
  const missingFromTemplate = [...specKeyCounts.keys()].filter((k) => countKeyDeclarations(initBlock ?? '', k) === 0);
  assert.deepEqual(
    missingFromTemplate,
    [],
    `key(s) declared in the spec's schema but absent from commands/tdd-init.md's Step 7 block: ${missingFromTemplate.join(', ')} — ` +
      'this is the exact drift a fixture-derived loop cannot see (plan Task 8)',
  );
});

// ---------------------------------------------------------------------------
// The Node floor: preflight (SKILL.md) and /tdd-init (tdd-init.md) both state
// it as a plain literal ("v22"), rather than resolving hooks/lib/rules.mjs's
// NODE_FLOOR at runtime — the orchestrator's Bash tool does not have
// CLAUDE_PLUGIN_ROOT (or CLAUDE_PROJECT_DIR) set, only the spawned hook
// process does, so a path built from it does not resolve for the
// orchestrator (plan Task 4, review round 2). That makes the literal a THIRD
// copy of NODE_FLOOR that can silently drift the next time someone bumps the
// constant in hooks/lib/rules.mjs without touching either prompt. This closes
// that gap the same way the schema drift checks above do: derive the
// expected value from the source of truth and assert the prompts match it.
// ---------------------------------------------------------------------------

/**
 * Extracts the Node floor claim ("...is at least vNN...") from the single
 * line matching `lineStartRe`. Scoped to that one line deliberately: a
 * whole-file match would also catch incidental version numbers elsewhere in
 * the same prose (e.g. the measured "22.23.2" patch version in the
 * fnm-vs-Bash-tool paragraph a few lines down), which is exactly the "whole
 * haystack passes when the specific block is wrong" scoping bug this file
 * already guards against for the Step 7 template above.
 * @param {string} text
 * @param {RegExp} lineStartRe
 * @returns {number | null}
 */
function extractFloorClaim(text, lineStartRe) {
  const line = text.split('\n').find((l) => lineStartRe.test(l));
  if (line === undefined) return null;
  const match = line.match(/\bis at least v(\d+)\b/);
  return match ? Number(match[1]) : null;
}

const skillText = fs.readFileSync(SKILL_PATH, 'utf8');

test("drift check: SKILL.md preflight item 6 states the node floor as hooks/lib/rules.mjs's NODE_FLOOR", () => {
  const stated = extractFloorClaim(skillText, /^6\. \*\*Node is on `PATH`/);
  assert.notEqual(stated, null, "could not locate preflight item 6's floor claim line — has its wording changed?");
  assert.equal(
    stated,
    NODE_FLOOR,
    `SKILL.md states the Node floor as v${stated}, but hooks/lib/rules.mjs's NODE_FLOOR is ${NODE_FLOOR} — the prompt has drifted from the source of truth`,
  );
});

test("drift check: tdd-init.md prerequisites state the node floor as hooks/lib/rules.mjs's NODE_FLOOR", () => {
  const stated = extractFloorClaim(initText, /^- Node is on `PATH`/);
  assert.notEqual(stated, null, "could not locate tdd-init.md's floor claim line — has its wording changed?");
  assert.equal(
    stated,
    NODE_FLOOR,
    `tdd-init.md states the Node floor as v${stated}, but hooks/lib/rules.mjs's NODE_FLOOR is ${NODE_FLOOR} — the prompt has drifted from the source of truth`,
  );
});
