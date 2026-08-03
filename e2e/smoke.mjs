#!/usr/bin/env node
// @ts-check
/**
 * Headless smoke checks for the e2e/ TDD-workflow fixture (Task 12).
 *
 * `e2e/` used to be a recorded artifact: nothing re-ran it, nothing diffed
 * its result against a committed expectation. This file is the mechanism
 * that does both, PLUS the two cases the 2026-08-01 architecture review
 * found broken and nothing exercised: resume (Task 6) and an out-of-glob
 * revert (Task 7).
 *
 * Run: `node e2e/smoke.mjs` or `npm run smoke`.
 *
 * NOT part of `node --test`. This filename deliberately avoids the
 * `*.test.mjs` / `*-test.mjs` / `test-*.mjs` / `test.mjs` patterns node:test
 * discovers by default (verified empirically -- see the Task 12 report), and
 * this file needs a Python venv and spawns real `git` subprocesses; it does
 * not belong in the unit suite's <2s budget.
 *
 * ---------------------------------------------------------------------------
 * What is genuinely automated here, and what is only scaffolded for a human
 * running a live Claude Code session, is NOT the same thing. A subagent
 * cannot dispatch tdd-* subagents, so nothing that requires an actual
 * orchestrator reading SKILL.md and making a judgement call can run from
 * this file. Read the Task 12 report for the explicit table; the short
 * version:
 *
 *   AUTOMATED (this file asserts on real process/git output):
 *     - the fixture's recorded pytest count, and that breaking source fails
 *       it and restoring source un-fails it (a seeded regression)
 *     - the git-mechanics claim `## Reverting a dispatch` makes about
 *       `git clean -fd` skipping tracked paths in a mixed pathspec
 *     - the out-of-glob revert: BOTH that the pre-Task-7 scoping (role's own
 *       glob only) leaves a rogue file behind, AND that the post-Task-7
 *       scoping (every path the audit found) removes it
 *     - the resume comparator's own correctness (checklist-invariants.mjs),
 *       bite-checked against a fabricated pre-Task-6 "Decompose overwrote
 *       the file" reconstruction
 *     - that prepare-resume-scratch.mjs actually produces a clean, genuinely
 *       interrupted-looking worktree (subtract red, divide untested)
 *
 *   SCAFFOLDED, NOT AUTOMATED (needs a live orchestrator):
 *     - an actual `/tdd e2e/spec.md` resume against that scratch worktree
 *     - comparing its real resulting checklist.json with
 *       checklist-invariants.mjs
 */

import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkResumePreserved } from './lib/checklist-invariants.mjs';
import { prepareResumeScratch } from './fixtures/prepare-resume-scratch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const PYTEST = path.join(REPO_ROOT, 'e2e', '.venv', 'bin', 'pytest');
const CALC_SRC = path.join(REPO_ROOT, 'e2e', 'src', 'calc', '__init__.py');
const EXPECTED = JSON.parse(fs.readFileSync(path.join(HERE, 'expected-outcome.json'), 'utf8'));
const RESUME_SEED = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'checklist-resume-seed.json'), 'utf8'));

let passed = 0;
let failed = 0;

/**
 * @param {string} name
 * @param {() => void} fn
 */
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL - ${name}`);
    console.log(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Section 1: the fixture's own recorded outcome, and a seeded regression
// ---------------------------------------------------------------------------

/** @returns {import('node:child_process').SpawnSyncReturns<string>} */
function runFixturePytest(cwd = REPO_ROOT) {
  return spawnSync(PYTEST, ['-q', '--ignore=e2e/mutants', 'e2e'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
}

check('e2e fixture: the pytest venv is present (provision e2e/.venv before running this)', () => {
  assert.ok(fs.existsSync(PYTEST), `expected a pytest executable at ${PYTEST}`);
});

check(`e2e fixture: recorded outcome — pytest reports exactly "${EXPECTED.testCount} passed"`, () => {
  const result = runFixturePytest();
  assert.equal(result.status, 0, `pytest exited ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    new RegExp(`\\b${EXPECTED.testCount} passed\\b`),
    `expected "${EXPECTED.testCount} passed" in pytest output, got:\n${result.stdout}`,
  );
});

check('seeded regression: breaking subtract() fails the configured test command, restoring it goes green again', () => {
  const original = fs.readFileSync(CALC_SRC, 'utf8');
  const needle = 'def subtract(a, b):\n    return a - b';
  assert.ok(original.includes(needle), 'fixture source has drifted from what this seeded mutation expects — update the mutation');
  const mutated = original.replace(needle, 'def subtract(a, b):\n    return a + b');
  try {
    fs.writeFileSync(CALC_SRC, mutated);
    const redResult = runFixturePytest();
    assert.notEqual(redResult.status, 0, 'seeded regression did not fail the suite — the seeded mutation is not being exercised');
    assert.match(
      redResult.stdout,
      /test_subtract_returns_difference/,
      `expected the subtract test to be named as a failure, got:\n${redResult.stdout}`,
    );
  } finally {
    fs.writeFileSync(CALC_SRC, original);
  }
  const greenResult = runFixturePytest();
  assert.equal(greenResult.status, 0, `restoring the source did not restore a green suite\n${greenResult.stdout}\n${greenResult.stderr}`);
  const treeStatus = execFileSync('git', ['status', '--porcelain', '--', 'e2e/src'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(treeStatus.trim(), '', `e2e/src is not clean after the seeded-regression check restored it:\n${treeStatus}`);
});

// ---------------------------------------------------------------------------
// Section 2: the out-of-glob revert (Task 7) — sandboxed git mechanics only,
// never against this repository's own tree.
// ---------------------------------------------------------------------------

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** A fresh git sandbox with a tracked baseline and a gitignored venv stand-in. */
function makeGlobSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-e2e-smoke-glob-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'venv'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitignore'), 'venv/\n');
  fs.writeFileSync(path.join(dir, 'src', 'a.py'), 'ORIGINAL\n');
  fs.writeFileSync(path.join(dir, 'tests', 'test_a.py'), 'test\n');
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'smoke@test.local'], dir);
  git(['config', 'user.name', 'smoke'], dir);
  git(['add', '.gitignore', 'src/a.py', 'tests/test_a.py'], dir);
  git(['commit', '-q', '-m', 'baseline'], dir);
  return dir;
}

/**
 * Seeds exactly the shape SKILL.md's "Reverting a dispatch" section
 * describes: a tracked in-glob edit, a legitimate untracked in-glob file, one
 * untracked file OUTSIDE both globs (the violation), and a gitignored stand-in
 * for the venv/checklist/coverage report that must survive any revert.
 * @param {string} dir
 */
function seedGlobViolation(dir) {
  fs.writeFileSync(path.join(dir, 'src', 'a.py'), 'MODIFIED\n');
  fs.writeFileSync(path.join(dir, 'tests', 'test_new.py'), 'new\n');
  fs.writeFileSync(path.join(dir, 'rogue.py'), 'rogue\n');
  fs.writeFileSync(path.join(dir, 'venv', 'marker.txt'), 'marker\n');
}

/** @param {string} dir @returns {string} */
function gitStatus(dir) {
  return git(['status', '--porcelain'], dir);
}

/** The orchestrator's audit: every path `git status --porcelain` names, parsed to bare paths. @param {string} dir */
function foundPaths(dir) {
  return gitStatus(dir)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

check(
  "SKILL.md's revert claim: `git clean -fd` given a mixed tracked+untracked pathspec skips the tracked entry silently and exits 0",
  () => {
    const dir = makeGlobSandbox();
    try {
      seedGlobViolation(dir);
      git(['reset', '--hard', 'HEAD'], dir); // src/a.py is now clean/tracked again
      const out = execFileSync('git', ['clean', '-fd', '--', 'src/a.py', 'rogue.py'], { cwd: dir, encoding: 'utf8' });
      assert.doesNotMatch(out, /src\/a\.py/, `clean reported acting on the tracked path:\n${out}`);
      assert.match(out, /rogue\.py/, `clean did not report removing the untracked path:\n${out}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

check(
  "out-of-glob revert — PRE-TASK-7 REGRESSION: `clean` scoped to the role's own write glob cannot reach a rogue file outside it",
  () => {
    const dir = makeGlobSandbox();
    try {
      seedGlobViolation(dir);
      git(['reset', '--hard', 'HEAD'], dir);
      git(['clean', '-fd', '--', 'src/**'], dir); // the pre-fix scoping: the role's own glob only
      const status = gitStatus(dir);
      assert.match(status, /\?\? rogue\.py/, `expected the pre-fix scoping to leave rogue.py behind, but it is gone:\n${status}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

check(
  'out-of-glob revert — POST-TASK-7 FIX: `clean` scoped to every path the audit found removes the rogue file and fully restores the tree',
  () => {
    const dir = makeGlobSandbox();
    try {
      seedGlobViolation(dir);
      const paths = foundPaths(dir);
      assert.ok(paths.includes('rogue.py'), `sandbox setup bug: audit did not find rogue.py among ${JSON.stringify(paths)}`);
      git(['reset', '--hard', 'HEAD'], dir);
      execFileSync('git', ['clean', '-fd', '--', ...paths], { cwd: dir, encoding: 'utf8' });
      const status = gitStatus(dir);
      assert.equal(status, '', `tree not fully reverted:\n${status}`);
      assert.equal(fs.existsSync(path.join(dir, 'rogue.py')), false, 'rogue.py survived the post-fix revert');
      assert.equal(fs.readFileSync(path.join(dir, 'src', 'a.py'), 'utf8'), 'ORIGINAL\n', 'tracked file was not restored to HEAD');
      assert.equal(fs.existsSync(path.join(dir, 'venv', 'marker.txt')), true, 'clean removed a gitignored path — must survive (no -x)');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------------------
// Section 3: resume (Task 6) — the comparator is automated and bite-checked;
// an actual live resume is not (see Section 4 and the report).
// ---------------------------------------------------------------------------

check('resume comparator: a legitimately advanced checklist (loaded, not rebuilt) reports preserved', () => {
  const advanced = structuredClone(RESUME_SEED);
  advanced.items = advanced.items.map((/** @type {any} */ item) => {
    if (item.id === 2) return { ...item, status: 'done' }; // Green landed and it was committed
    if (item.id === 3) return { ...item, status: 'red', testId: 'tests/test_divide.py::test_divide_by_zero_raises_value_error' };
    return item;
  });
  const verdict = checkResumePreserved(RESUME_SEED, advanced);
  assert.equal(verdict.ok, true, `expected a legitimate resume to pass: ${JSON.stringify(verdict.violations)}`);
});

check('resume comparator bite-check: an unconditional Decompose rewrite (the pre-Task-6 bug) is caught', () => {
  const rebuilt = {
    spec: RESUME_SEED.spec,
    knownRed: [],
    mutationRoundsRun: 0,
    items: RESUME_SEED.items.map((/** @type {any} */ item) => ({ id: item.id, behavior: item.behavior, status: 'pending', testId: null })),
  };
  const verdict = checkResumePreserved(RESUME_SEED, rebuilt);
  assert.equal(verdict.ok, false, 'comparator failed to catch a full Decompose overwrite — it has no teeth');
  assert.ok(verdict.violations.some((v) => v.includes('item 1') && v.includes('status')), `expected a violation naming item 1's clobbered status, got: ${JSON.stringify(verdict.violations)}`);
  assert.ok(verdict.violations.some((v) => v.includes('item 2')), `expected a violation naming item 2, got: ${JSON.stringify(verdict.violations)}`);
  assert.ok(RESUME_SEED.knownRed.length > 0, 'fixture bug: seed knownRed must be non-empty for this bite-check to mean anything');
  assert.ok(verdict.violations.some((v) => v.includes('knownRed')), `expected a knownRed violation, got: ${JSON.stringify(verdict.violations)}`);
});

check('resume comparator bite-check: mutationRoundsRun regressing backward is caught even when every item field matches', () => {
  const seed = { spec: 's', knownRed: [], mutationRoundsRun: 1, items: [{ id: 1, behavior: 'b', status: 'pending', testId: null }] };
  const regressed = { ...seed, mutationRoundsRun: 0 };
  const verdict = checkResumePreserved(seed, regressed);
  assert.equal(verdict.ok, false, 'comparator did not catch mutationRoundsRun regressing from 1 to 0');
});

check('resume comparator bite-check: a non-terminal item sliding backward (red -> pending) is caught even with testId untouched', () => {
  const seed = { spec: 's', knownRed: [], mutationRoundsRun: 0, items: [{ id: 1, behavior: 'b', status: 'red', testId: 'tests/test_x.py::test_x' }] };
  const regressed = { spec: 's', knownRed: [], mutationRoundsRun: 0, items: [{ id: 1, behavior: 'b', status: 'pending', testId: 'tests/test_x.py::test_x' }] };
  const verdict = checkResumePreserved(seed, regressed);
  assert.equal(verdict.ok, false, 'comparator did not catch a non-terminal item regressing from "red" to "pending"');
});

// ---------------------------------------------------------------------------
// Section 4: the resume scratch prep is itself automated and verified here.
// The live /tdd resume it sets up for is NOT — see the report.
// ---------------------------------------------------------------------------

check('resume scratch prep: prepare-resume-scratch.mjs produces a clean, genuinely-interrupted worktree', () => {
  const { scratchDir, cleanup } = prepareResumeScratch();
  try {
    const src = fs.readFileSync(path.join(scratchDir, 'e2e', 'src', 'calc', '__init__.py'), 'utf8');
    assert.match(src, /def add/, 'scratch source is missing add()');
    assert.doesNotMatch(src, /def subtract/, 'scratch source should not implement subtract() yet (item 2 is "red")');
    assert.doesNotMatch(src, /def divide/, 'scratch source should not implement divide() yet (item 3 is "pending")');
    assert.equal(fs.existsSync(path.join(scratchDir, 'e2e', 'tests', 'test_divide.py')), false, 'divide test should not exist yet');
    assert.equal(fs.existsSync(path.join(scratchDir, 'e2e', 'tests', 'test_subtract.py')), true, 'subtract test should already exist (Red already ran)');

    const checklist = JSON.parse(fs.readFileSync(path.join(scratchDir, '.tdd', 'checklist.json'), 'utf8'));
    assert.deepEqual(checklist, RESUME_SEED, 'seeded .tdd/checklist.json does not match the committed resume-seed fixture');

    const status = git(['status', '--porcelain'], scratchDir);
    assert.equal(status.trim(), '', `scratch worktree is not clean (Preflight #1 requires this):\n${status}`);

    const result = runFixturePytest(scratchDir);
    assert.notEqual(result.status, 0, 'expected the scratch suite to be red (subtract test exists, subtract() is unimplemented)');
    assert.match(result.stdout, /test_subtract/, `expected a subtract-related failure, got:\n${result.stdout}`);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------

const total = passed + failed;
console.log('');
console.log(`# smoke checks: ${total}`);
console.log(`# pass: ${passed}`);
console.log(`# fail: ${failed}`);
if (total === 0) {
  console.error('smoke.mjs ran zero checks — that is a failure, not a clean pass');
  process.exitCode = 1;
} else {
  process.exitCode = failed === 0 ? 0 : 1;
}
