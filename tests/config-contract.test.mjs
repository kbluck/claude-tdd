// node:test port of tests/config-contract.test.sh.
//
// Pins the .tdd/config.json schema that /tdd-init must produce and that the
// guard and orchestrator consume. Three independent copies of this schema
// exist (the fixture, commands/tdd-init.md's Step 7 template, and the spec's
// own example block) and they have drifted from each other before — see the
// comments inline, and AGENTS.md's "Fixing the document about the artifact
// is not fixing the artifact".
//
// This file does not touch hooks/lib/rules.mjs and is not expected to be
// red-because-of-a-stub. Most of it pins a property the repository already
// satisfies (like agents.test.mjs). The one deliberate exception is the
// singleTerse drift check at the bottom, which is expected to be RED right
// now and records a real, currently-unclosed gap (plan Task 8).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'config.json');
const INIT_PATH = path.join(REPO_ROOT, 'commands', 'tdd-init.md');
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

for (const key of ['coverage', 'complexity', 'mutation']) {
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
// asserting they also appear in the fixture and the template. It is
// EXPECTED TO FAIL right now for commands.singleTerse, which is present in
// the spec's block and absent from both the fixture and commands/tdd-init.md
// — verified directly above (tests/fixtures/config.json has no
// "singleTerse" key). That failure is the correct record of the gap; closing
// it is plan Task 8's job, not this suite's.
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
