// node:test port of tests/guard.test.sh — PARTIAL.
//
// guard.test.sh exercises hooks/guard.sh end-to-end: pipe a JSON payload in,
// read the exit code and stderr out. Its replacement, hooks/guard.mjs, does
// not exist yet — it is Task 3's deliverable, not Task 2's. Per the brief:
// "guard.test.mjs (payload → exit code, once hooks/guard.mjs exists — for
// now, write what you can that does not need it and skip the rest with a
// clear TODO naming Task 3)."
//
// What does NOT need guard.mjs to exist: hooks/hooks.json's own registration
// shape. The plan requires it move to exec form before Task 3 is done
// ("Hook registration | Exec form — `"command": "node", "args":
// ["${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"]`"), and hooks.json can be
// inspected today regardless of whether guard.mjs has been written. That
// test is expected to be RED right now for a genuine reason (the property
// does not hold yet), not because anything is missing to run it.
//
// Everything else in the retired guard.test.sh needs a running guard.mjs to
// pipe a payload into, and is recorded below as test.todo() with enough
// detail that Task 3 does not have to reconstruct intent from the bash
// original. Two fixtures are prepared now so Task 3 does not have to invent
// them: tests/fixtures/config.json (existing, commands.mutation: null) and
// tests/fixtures/config-mutation.json (new, commands.mutation: "mutmut run")
// — the plan names the null-mutation fixture as making "an entire branch of
// the Bash allowlist structurally dead in every test."

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const HOOKS_JSON_PATH = path.join(REPO_ROOT, 'hooks', 'hooks.json');
const GUARD_MJS_PATH = path.join(REPO_ROOT, 'hooks', 'guard.mjs');

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
  // dialect problem. The shell-form spelling this repo currently ships
  // ("command": ".../guard.sh") fails this on both counts: it names the
  // script directly (requiring a shell to interpret the shebang and expand
  // ${CLAUDE_PLUGIN_ROOT}) rather than naming the interpreter, and it points
  // at guard.sh instead of guard.mjs.
  assert.equal(guardHook.command, 'node', `expected the hook to spawn "node" directly (exec form), got "${guardHook.command}"`);
  assert.ok(Array.isArray(guardHook.args), 'expected an "args" array carrying the script path (exec form)');
  assert.ok(
    guardHook.args.some((a) => typeof a === 'string' && a.includes('guard.mjs')),
    `expected one of the args to reference guard.mjs, got ${JSON.stringify(guardHook.args)}`,
  );
});

test('sanity: hooks/guard.mjs does not exist yet (Task 3) — the todos below are correctly deferred, not incorrectly skipped', () => {
  // This is an intentional TRIPWIRE, not a real assertion about design: the
  // moment Task 3 adds guard.mjs, this flips and is the signal to convert
  // every test.todo() below into a real test rather than leaving them
  // stranded. If this test starts failing, that is good news.
  assert.equal(fs.existsSync(GUARD_MJS_PATH), false, 'hooks/guard.mjs now exists — promote the test.todo() entries below to real tests (Task 3 has landed)');
});

// ---------------------------------------------------------------------------
// Deferred to Task 3. Each entry names the specific behaviour from the
// retired guard.test.sh (or from the plan's "branches iteration 1 never
// covered" list) so nothing gets lost in the port.
// ---------------------------------------------------------------------------

test.todo('guard: inert unless a constrained agent is calling — no agent_type (main thread), and an unrelated agent_type, both permit silently (exit 0, no stderr)');
test.todo('guard: red writing a test is permitted; red writing/reading source is denied (exit 2) and the systemMessage names the violated rule');
test.todo('guard: green reading a test is denied; green writing source is permitted');
test.todo('guard: the namespaced form ("claude-tdd:tdd-red") is what real dispatches send and must be judged identically to the bare form ("tdd-red") — the single most consequential defect in the project was this namespace strip being silently absent');
test.todo('guard: an agent whose name merely starts with "tdd-" but is not one of the four known roles (e.g. "tdd-bogus") permits — this plugin only constrains the roles it defines');
test.todo('guard: every file-writing tool is judged, not just Write/Edit — Write, Edit, MultiEdit, NotebookEdit all deny a red write to source (hook matchers are unanchored regex; a tool that fell through would let Red write source unchecked)');
test.todo('guard: NotebookEdit/NotebookRead are judged on notebook_path, not file_path — a payload carrying a benign decoy file_path alongside a real-target notebook_path must be judged on the field the tool actually acts on');
test.todo('guard: an unrecognized tool name denies rather than passing through');
test.todo('guard: an empty/missing file_path denies rather than permitting (cannot be classified)');
test.todo('guard: a ".." segment in an absolute payload path denies for both red (source) and green (a path it could otherwise read) — traversal must not escape classification');
test.todo('guard: relative payload paths classify identically to absolute ones (e.g. "src/a.py" denied to red exactly as the absolute form is)');
test.todo('guard: missing .tdd/config.json denies even an otherwise-legal write for a constrained role, but still permits the main thread (config absence must not widen the main-thread exemption)');
test.todo('guard: config-contract Task 10 — an EMPTY sandbox (.tdd/config.json absent entirely, not just malformed) produces exit 2 with a message naming /tdd-init, for a constrained role');
test.todo('guard: degenerate .tdd/config.json on-disk shapes deny rather than crash or permit — non-JSON content, an empty file (0 bytes), and a file containing only "{}"; distinct from the in-memory shape tests in rules.test.mjs, which do not touch the filesystem at all');
test.todo('guard: bash dispatch selects candidate command templates BY ROLE, trying each until one matches — red and green both get {single, coverage}; refactor gets {test, coverage, complexity}; mutation gets {test, mutation}. The retired suite exercised green\'s "single" and every role\'s "coverage" but never red\'s own "single" branch independently of green\'s');
test.todo('guard: every role may run the configured coverage command, but a role\'s own phase-scoped command stays scoped (e.g. green may not run the complexity command configured for refactor)');
test.todo('guard: metacharacters appended after a legitimately-matched command prefix are still denied (e.g. "pytest -q --cov; rm -rf src" — a coverage-prefix match must not waive the delta check)');
test.todo('guard: with tests/fixtures/config-mutation.json (commands.mutation non-null, unlike the default fixture), tdd-mutate\'s bash dispatch actually exercises the mutation command branch — the plan notes the default fixture\'s null makes this branch "structurally dead in every test"');
test.todo('guard: the version floor — process.versions.node is checked FIRST, before anything else can throw; below NODE_FLOOR denies with a setup-pointing message, and this is checked ahead of config/role/path evaluation entirely');
test.todo('guard: an uncaught exception anywhere in the guard body still exits 2 (wrap-the-whole-body requirement) — e.g. malformed JSON on stdin must not exit 1, which PreToolUse treats as a non-blocking permit');
