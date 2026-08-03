// node:test port of tests/guard.test.sh, extended for Task 3.
//
// hooks/guard.mjs now exists, so every behaviour deferred by the Task 2 port
// is promoted here from test.todo() to a real test that pipes a JSON payload
// into a spawned `node hooks/guard.mjs` and reads its exit code and stderr —
// the same black-box shape guard.test.sh used, translated to a subprocess
// instead of a bash pipe.
//
// Two fixtures back this file: tests/fixtures/config.json (commands.mutation:
// null) for the ordinary matrix, and tests/fixtures/config-mutation.json
// (commands.mutation: "mutmut run") specifically so tdd-mutate's Bash
// dispatch exercises the mutation-command branch at least once — the default
// fixture's null makes that branch structurally dead in every other test.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const HOOKS_JSON_PATH = path.join(REPO_ROOT, 'hooks', 'hooks.json');
const GUARD_MJS_PATH = path.join(REPO_ROOT, 'hooks', 'guard.mjs');
const FIXTURE_CONFIG_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'config.json');
const FIXTURE_CONFIG_MUTATION_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'config-mutation.json');

test('hooks.json: PreToolUse is registered in EXEC form (node + guard.mjs args, no shell)', () => {
  const hooksJson = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf8'));
  const preToolUse = hooksJson?.hooks?.PreToolUse;
  assert.ok(Array.isArray(preToolUse) && preToolUse.length > 0, 'hooks.json has no PreToolUse matcher entries');

  const commandHooks = preToolUse.flatMap((entry) => entry.hooks ?? []).filter((h) => h.type === 'command');
  assert.ok(commandHooks.length > 0, 'no command-type hook found under PreToolUse');

  const guardHook = commandHooks.find((h) => JSON.stringify(h).includes('guard'));
  assert.notEqual(guardHook, undefined, 'no hook entry appears to reference the guard at all');

  // Exec form per the plan's global constraints table: spawn "node" directly
  // with the script as an argv entry — no shell, no `${VAR}`-vs-`$env:VAR`
  // dialect problem.
  assert.equal(guardHook.command, 'node', `expected the hook to spawn "node" directly (exec form), got "${guardHook.command}"`);
  assert.ok(Array.isArray(guardHook.args), 'expected an "args" array carrying the script path (exec form)');
  assert.ok(
    guardHook.args.some((a) => typeof a === 'string' && a.includes('guard.mjs')),
    `expected one of the args to reference guard.mjs, got ${JSON.stringify(guardHook.args)}`,
  );
});

test('sanity: hooks/guard.mjs exists (Task 3 has landed) — the tests below exercise it directly', () => {
  assert.equal(fs.existsSync(GUARD_MJS_PATH), true, 'hooks/guard.mjs is missing — Task 3 is expected to have created it');
});

/**
 * Read guard.mjs's TOOL_DISPATCH table keys straight from its source text,
 * rather than importing the module — guard.mjs calls main() unconditionally
 * at import time (it reads stdin synchronously), so importing it here would
 * hang the test runner. This mirrors the text-extraction approach
 * frontmatterName() above already uses against agent files.
 */
function toolDispatchKeys() {
  const source = fs.readFileSync(GUARD_MJS_PATH, 'utf8');
  const block = source.match(/const TOOL_DISPATCH = \{([\s\S]*?)\n\};/);
  assert.notEqual(block, null, 'could not locate the TOOL_DISPATCH table in guard.mjs — has it been renamed?');
  const keys = [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'TOOL_DISPATCH table appears to declare no keys');
  return keys;
}

test("hooks.json: the matcher's tool set is exactly guard.mjs's TOOL_DISPATCH keys — not a second hand-typed copy", () => {
  // hooks.json's matcher gates which tool calls ever reach guard.mjs at all;
  // a tool missing from the matcher never invokes the guard regardless of
  // what TOOL_DISPATCH says about it (dead code), and a tool present in the
  // matcher but absent from TOOL_DISPATCH falls through to guard.mjs's
  // "unrecognized tool" deny (harmless, but a sign the two have drifted).
  // Derived from guard.mjs's own table rather than hardcoded here a second
  // time — AGENTS.md already records two hand-maintained copies of one value
  // as a defect class this project has paid for.
  const hooksJson = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf8'));
  const preToolUse = hooksJson?.hooks?.PreToolUse ?? [];
  const guardEntry = preToolUse.find((entry) =>
    (entry.hooks ?? []).some((h) => h.type === 'command' && JSON.stringify(h).includes('guard')));
  assert.notEqual(guardEntry, undefined, 'no PreToolUse entry references the guard');
  assert.equal(typeof guardEntry.matcher, 'string', 'the guard\'s PreToolUse entry has no string matcher');

  const matcherTools = guardEntry.matcher.split('|');
  const dispatchTools = toolDispatchKeys();

  // Compared as sorted sets, not raw string/order equality: a regex
  // alternation matches identically regardless of the order its branches are
  // written in, so reordering either list has no security effect and must
  // not fail this test -- only an actual add or remove should.
  assert.deepEqual(
    [...matcherTools].sort(),
    [...dispatchTools].sort(),
    `hooks.json matcher tools (${matcherTools.join(', ')}) must be exactly guard.mjs's TOOL_DISPATCH keys (${dispatchTools.join(', ')})`,
  );
});

// ---------------------------------------------------------------------------
// Sandbox + payload helpers
// ---------------------------------------------------------------------------

/** A fresh sandbox directory with .tdd/config.json copied from `fixturePath`. */
function makeSandbox(fixturePath = FIXTURE_CONFIG_PATH) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-guard-test-')));
  fs.mkdirSync(path.join(dir, '.tdd'), { recursive: true });
  fs.copyFileSync(fixturePath, path.join(dir, '.tdd', 'config.json'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.py'), '# source\n');
  fs.writeFileSync(path.join(dir, 'tests', 'test_a.py'), '# test\n');
  return dir;
}

function removeSandbox(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Build a PreToolUse payload. `agentType` omitted entirely means a
 * main-thread call — the key is genuinely ABSENT, not present-and-null,
 * matching the measured payload shape.
 */
function payload({ agentType, tool, input }) {
  /** @type {any} */
  const body = { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input };
  if (agentType) {
    body.agent_id = 'a123';
    body.agent_type = agentType;
  }
  return JSON.stringify(body);
}

/** Spawn `node hooks/guard.mjs`, feed it a payload on stdin, and report {status, stderr}. */
function runGuard({ agentType, tool, input, sandbox, env = {} }) {
  const result = spawnSync(process.execPath, [GUARD_MJS_PATH], {
    input: payload({ agentType, tool, input }),
    encoding: 'utf8',
    env: { ...process.env, TDD_PROJECT_DIR: sandbox, ...env },
  });
  return { status: result.status, stderr: result.stderr ?? '' };
}

function readGuard(sandbox, filePath, agentType) {
  return runGuard({ agentType, tool: 'Read', input: { file_path: filePath }, sandbox });
}

function writeGuard(sandbox, filePath, agentType) {
  return runGuard({ agentType, tool: 'Write', input: { file_path: filePath }, sandbox });
}

function bashGuard(sandbox, command, agentType) {
  return runGuard({ agentType, tool: 'Bash', input: { command }, sandbox });
}

// ---------------------------------------------------------------------------
// Inert unless a constrained agent is calling
// ---------------------------------------------------------------------------

test('guard: no agent_type (main thread) and an unrelated agent_type both permit silently (exit 0, no stderr)', () => {
  const sandbox = makeSandbox();
  try {
    const mainThread = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), undefined);
    assert.equal(mainThread.status, 0, 'main thread should exit 0');
    assert.equal(mainThread.stderr, '', 'main thread should emit no stderr');

    const unrelated = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'general-purpose');
    assert.equal(unrelated.status, 0, 'unrelated agent_type should exit 0');
    assert.equal(unrelated.stderr, '', 'unrelated agent_type should emit no stderr');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: red writing a test is permitted; red writing/reading source is denied (exit 2) and the systemMessage names the violated rule', () => {
  const sandbox = makeSandbox();
  try {
    const okWrite = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-red');
    assert.equal(okWrite.status, 0, 'red writing a test should be permitted');

    const badWrite = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'tdd-red');
    assert.equal(badWrite.status, 2, 'red writing source should be denied');
    assert.match(badWrite.stderr, /"permissionDecision":"deny"/, 'denial JSON should carry a deny decision');
    assert.match(badWrite.stderr, /only write test files/, 'denial should name the violated rule');

    const badRead = readGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'tdd-red');
    assert.equal(badRead.status, 2, 'red reading source should be denied');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: green reading a test is denied; green writing source is permitted', () => {
  const sandbox = makeSandbox();
  try {
    const badRead = readGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-green');
    assert.equal(badRead.status, 2, 'green reading a test should be denied');

    const okWrite = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'tdd-green');
    assert.equal(okWrite.status, 0, 'green writing source should be permitted');
  } finally {
    removeSandbox(sandbox);
  }
});

// ---------------------------------------------------------------------------
// Namespace strip — the single most consequential defect in the project
// ---------------------------------------------------------------------------

test('guard: the namespaced form ("claude-tdd:tdd-red") is judged identically to the bare form ("tdd-red")', () => {
  const sandbox = makeSandbox();
  try {
    const bareDeny = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'tdd-red');
    const namespacedDeny = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'claude-tdd:tdd-red');
    assert.equal(bareDeny.status, 2, 'sanity: bare form denies red writing source');
    assert.equal(namespacedDeny.status, 2, 'namespaced form must ALSO deny red writing source');

    const bareAllow = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-red');
    const namespacedAllow = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'claude-tdd:tdd-red');
    assert.equal(bareAllow.status, 0, 'sanity: bare form allows red writing a test');
    assert.equal(namespacedAllow.status, 0, 'namespaced form must ALSO allow red writing a test');

    const namespacedGreenRead = readGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'claude-tdd:tdd-green');
    assert.equal(namespacedGreenRead.status, 2, 'namespaced green reading a test is denied');

    const namespacedMutateBash = bashGuard(sandbox, 'pytest -q', 'claude-tdd:tdd-mutate');
    assert.equal(namespacedMutateBash.status, 0, 'namespaced tdd-mutate may run the full suite');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: an agent whose name merely starts with "tdd-" but is not one of the four known roles permits', () => {
  const sandbox = makeSandbox();
  try {
    const result = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), 'tdd-bogus');
    assert.equal(result.status, 0, 'an unrecognised tdd-* agent should permit — this plugin only constrains the roles it defines');
  } finally {
    removeSandbox(sandbox);
  }
});

// ---------------------------------------------------------------------------
// Every file-writing tool must be judged, not just Write/Edit
// ---------------------------------------------------------------------------

test('guard: every file-writing tool is judged, not just Write/Edit — Write, Edit, MultiEdit, NotebookEdit all deny a red write to source', () => {
  const sandbox = makeSandbox();
  try {
    for (const tool of ['Write', 'Edit', 'MultiEdit']) {
      const result = runGuard({ agentType: 'tdd-red', tool, input: { file_path: path.join(sandbox, 'src', 'a.py') }, sandbox });
      assert.equal(result.status, 2, `red writing source via ${tool} should be denied`);
    }
    const notebook = runGuard({
      agentType: 'tdd-red',
      tool: 'NotebookEdit',
      input: { notebook_path: path.join(sandbox, 'src', 'nb.ipynb') },
      sandbox,
    });
    assert.equal(notebook.status, 2, 'red writing source via NotebookEdit should be denied');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: NotebookEdit/NotebookRead are judged on notebook_path, not file_path', () => {
  const sandbox = makeSandbox();
  try {
    // A benign decoy file_path (a legal test write) alongside a real-target
    // notebook_path (source) must be judged on the field the tool actually
    // acts on — checking file_path here would validate something the tool
    // ignores and permit the write it should have caught.
    const editDecoy = runGuard({
      agentType: 'tdd-red',
      tool: 'NotebookEdit',
      input: {
        file_path: path.join(sandbox, 'tests', 'test_a.py'),
        notebook_path: path.join(sandbox, 'src', 'nb.ipynb'),
      },
      sandbox,
    });
    assert.equal(editDecoy.status, 2, 'NotebookEdit must be judged on notebook_path, not a decoy file_path');

    // NotebookRead's own path key, independently of NotebookEdit's — a
    // recorded mutation survivor (review Appendix, "NotebookRead path key ->
    // file_path": survived, "NotebookRead is never tested"). The decoy
    // file_path here is a path red MAY read (unclassified, not under
    // src/**), and the notebook_path is under src/** and must be denied — a
    // guard that consulted file_path instead would wrongly permit this call.
    const readDecoy = runGuard({
      agentType: 'tdd-red',
      tool: 'NotebookRead',
      input: {
        file_path: path.join(sandbox, 'README.md'),
        notebook_path: path.join(sandbox, 'src', 'nb.ipynb'),
      },
      sandbox,
    });
    assert.equal(readDecoy.status, 2, 'NotebookRead must be judged on notebook_path, not a decoy file_path');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: an unrecognized tool name denies rather than passing through', () => {
  const sandbox = makeSandbox();
  try {
    const result = runGuard({
      agentType: 'tdd-red',
      tool: 'SomeFutureTool',
      input: { file_path: path.join(sandbox, 'src', 'a.py') },
      sandbox,
    });
    assert.equal(result.status, 2, 'an unrecognized tool should deny rather than pass through');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: an empty/missing file_path denies rather than permitting', () => {
  const sandbox = makeSandbox();
  try {
    const empty = writeGuard(sandbox, '', 'tdd-red');
    assert.equal(empty.status, 2, 'empty file_path should deny rather than permit');

    const missing = runGuard({ agentType: 'tdd-red', tool: 'Write', input: {}, sandbox });
    assert.equal(missing.status, 2, 'a missing file_path key should deny rather than permit');
  } finally {
    removeSandbox(sandbox);
  }
});

// ---------------------------------------------------------------------------
// Traversal and path normalisation
// ---------------------------------------------------------------------------

test('guard: a ".." segment in an absolute payload path denies for both red (source) and green (a path it could otherwise read)', () => {
  const sandbox = makeSandbox();
  try {
    // Built with plain string concatenation, not path.join/path.resolve —
    // those normalise away '..' segments as part of joining, which would
    // silently erase the very defect this row exists to reproduce.
    const traversalPath = `${sandbox}/../${path.basename(sandbox)}/src/a.py`;
    const redRead = readGuard(sandbox, traversalPath, 'tdd-red');
    assert.equal(redRead.status, 2, 'a .. segment should deny rather than escape classification for red');

    // A SOURCE path for green's traversal case: a traversal to a *test* path
    // would be denied by the ordinary "green may not read tests" rule even
    // with the traversal guard removed, so it would not prove the guard is
    // live.
    const greenRead = readGuard(sandbox, traversalPath, 'tdd-green');
    assert.equal(greenRead.status, 2, 'a .. segment should deny for green even on a path it could otherwise read');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: relative payload paths classify identically to absolute ones', () => {
  const sandbox = makeSandbox();
  try {
    const relRead = readGuard(sandbox, 'src/a.py', 'tdd-red');
    assert.equal(relRead.status, 2, 'a relative source path should still be denied to red');

    const relWrite = writeGuard(sandbox, 'tests/test_a.py', 'tdd-red');
    assert.equal(relWrite.status, 0, 'a relative test path should still be allowed to red');
  } finally {
    removeSandbox(sandbox);
  }
});

// ---------------------------------------------------------------------------
// Config presence and shape
// ---------------------------------------------------------------------------

test('guard: missing .tdd/config.json denies even an otherwise-legal write for a constrained role, but still permits the main thread', () => {
  const sandbox = makeSandbox();
  try {
    fs.renameSync(path.join(sandbox, '.tdd', 'config.json'), path.join(sandbox, '.tdd', 'config.json.bak'));

    const constrained = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-red');
    assert.equal(constrained.status, 2, 'missing config should deny even an otherwise-legal write');

    const mainThread = writeGuard(sandbox, path.join(sandbox, 'src', 'a.py'), undefined);
    assert.equal(mainThread.status, 0, 'missing config must not widen: the main thread stays permitted');

    fs.renameSync(path.join(sandbox, '.tdd', 'config.json.bak'), path.join(sandbox, '.tdd', 'config.json'));
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: an EMPTY sandbox (.tdd/config.json absent entirely) produces exit 2 with a message naming /tdd-init, for a constrained role', () => {
  const sandbox = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-guard-empty-')));
  try {
    // No .tdd directory at all — not merely a malformed file.
    const result = writeGuard(sandbox, path.join(sandbox, 'anything.py'), 'tdd-red');
    assert.equal(result.status, 2, 'an empty sandbox should deny for a constrained role');
    assert.match(result.stderr, /\/tdd-init/, 'the denial message should point at /tdd-init');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: degenerate .tdd/config.json on-disk shapes deny rather than crash or permit', () => {
  const sandbox = makeSandbox();
  try {
    const configPath = path.join(sandbox, '.tdd', 'config.json');

    fs.writeFileSync(configPath, 'this is not json{{{');
    const nonJson = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-red');
    assert.equal(nonJson.status, 2, 'non-JSON config content should deny');

    fs.writeFileSync(configPath, '');
    const empty = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-red');
    assert.equal(empty.status, 2, 'a 0-byte config file should deny');

    fs.writeFileSync(configPath, '{}');
    const emptyObject = writeGuard(sandbox, path.join(sandbox, 'tests', 'test_a.py'), 'tdd-red');
    assert.equal(emptyObject.status, 2, 'a config file containing only {} should deny (no globs to verify against)');
  } finally {
    removeSandbox(sandbox);
  }
});

// ---------------------------------------------------------------------------
// Bash dispatch: per-role command selection
// ---------------------------------------------------------------------------

test('guard: bash dispatch selects candidate command templates BY ROLE', () => {
  const sandbox = makeSandbox();
  try {
    // Red's own "single" branch, independently of green's.
    const redSingle = bashGuard(sandbox, 'pytest -q tests/test_a.py::test_x', 'tdd-red');
    assert.equal(redSingle.status, 0, "red should be permitted its own configured 'single' command");

    const greenSingle = bashGuard(sandbox, 'pytest -q tests/test_a.py::test_x', 'tdd-green');
    assert.equal(greenSingle.status, 0, "green should be permitted the configured 'single' command");

    const refactorFull = bashGuard(sandbox, 'pytest -q', 'tdd-refactor');
    assert.equal(refactorFull.status, 0, "refactor should be permitted the configured full-suite 'test' command");

    const refactorComplexity = bashGuard(sandbox, 'radon cc -j -s src', 'tdd-refactor');
    assert.equal(refactorComplexity.status, 0, "refactor should be permitted the configured 'complexity' command");

    const mutateFull = bashGuard(sandbox, 'pytest -q', 'tdd-mutate');
    assert.equal(mutateFull.status, 0, "mutate should be permitted the configured full-suite 'test' command");
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: Red may run commands.singleTerse for the handover report — permitted structurally, via the "single" prefix match, with no separate BASH_COMMAND_KEYS entry needed', () => {
  const sandbox = makeSandbox();
  try {
    // Task 8: Red produces observedFailure from commands.singleTerse
    // ("pytest -q --tb=line {testId}"), not commands.single. Nothing routes
    // this through a distinct allowlist entry — bashVerdict only checks that
    // the actual command STARTS WITH the static prefix of a candidate
    // template (the text before its first "{"), so "pytest -q --tb=line ..."
    // already satisfies commands.single's prefix ("pytest -q") on the first
    // candidate key tried. If that stopped being true (a toolchain whose
    // terse form does not share single's prefix), this dispatch would go
    // structurally dead with no failing test anywhere else to notice.
    const redTerse = bashGuard(sandbox, 'pytest -q --tb=line tests/test_a.py::test_x', 'tdd-red');
    assert.equal(redTerse.status, 0, "red should be permitted to run commands.singleTerse's command for this fixture");
  } finally {
    removeSandbox(sandbox);
  }
});

test("guard: every role may run the configured coverage command, but a role's own phase-scoped command stays scoped", () => {
  const sandbox = makeSandbox();
  try {
    const coverage = 'pytest -q --cov --cov-report=json:.tdd/coverage.json';
    for (const role of ['tdd-red', 'tdd-green', 'tdd-refactor']) {
      const result = bashGuard(sandbox, coverage, role);
      assert.equal(result.status, 0, `${role} should be permitted to run the coverage command`);
    }

    const greenComplexity = bashGuard(sandbox, 'radon cc -j -s src', 'tdd-green');
    assert.equal(greenComplexity.status, 2, 'green must not be permitted the complexity command configured for refactor');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: metacharacters appended after a legitimately-matched command prefix are still denied', () => {
  const sandbox = makeSandbox();
  try {
    const result = bashGuard(sandbox, 'pytest -q --cov; rm -rf src', 'tdd-green');
    assert.equal(result.status, 2, 'a coverage-prefix match must not waive the delta check');
  } finally {
    removeSandbox(sandbox);
  }
});

test('guard: with commands.mutation non-null, tdd-mutate\'s bash dispatch exercises the mutation command branch', () => {
  const sandbox = makeSandbox(FIXTURE_CONFIG_MUTATION_PATH);
  try {
    const result = bashGuard(sandbox, 'mutmut run', 'tdd-mutate');
    assert.equal(result.status, 0, 'tdd-mutate should be permitted the configured mutation command when one is configured');
  } finally {
    removeSandbox(sandbox);
  }
});

// ---------------------------------------------------------------------------
// The version floor
// ---------------------------------------------------------------------------

test('guard: the version floor is checked FIRST, before anything else can throw — below NODE_FLOOR denies with a setup-pointing message', () => {
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-guard-version-'));
  try {
    const wrapperPath = path.join(wrapperDir, 'below-floor-wrapper.mjs');
    const guardUrl = new URL('file://' + GUARD_MJS_PATH.replace(/\\/g, '/')).href;
    fs.writeFileSync(
      wrapperPath,
      [
        "Object.defineProperty(process, 'version', { value: 'v18.0.0', configurable: true });",
        "Object.defineProperty(process.versions, 'node', { value: '18.0.0', configurable: true });",
        `await import(${JSON.stringify(guardUrl)});`,
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [wrapperPath], {
      // Deliberately no valid payload on stdin — the version check must fire
      // before the guard ever tries to read or parse it.
      input: '',
      encoding: 'utf8',
    });
    assert.equal(result.status, 2, 'a below-floor runtime should deny, checked ahead of any payload evaluation');
    assert.match(result.stderr, /Node/, 'the denial should point at the Node runtime as the setup problem');
  } finally {
    fs.rmSync(wrapperDir, { recursive: true, force: true });
  }
});

test('guard: an uncaught exception anywhere in the guard body still exits 2 — malformed JSON on stdin must not exit 1', () => {
  const sandbox = makeSandbox();
  try {
    const result = spawnSync(process.execPath, [GUARD_MJS_PATH], {
      input: 'this is not { valid json',
      encoding: 'utf8',
      env: { ...process.env, TDD_PROJECT_DIR: sandbox },
    });
    assert.equal(result.status, 2, 'malformed JSON on stdin must exit 2 (deny), not 1 (which PreToolUse treats as a non-blocking permit)');
    assert.notEqual(result.stderr, '', 'a wrapped exception should still emit a denial message');
  } finally {
    removeSandbox(sandbox);
  }
});
