// node:test port of tests/agents.test.sh.
//
// The guard identifies callers by agent_type, which is the agent file's
// `name:` field. If the two ever disagree, the guard stops constraining that
// role and says nothing — this is the class of defect that made the
// namespace-strip bug (spec: "The namespace strip is not an implementation
// detail") the single most consequential finding in the project: a real
// mismatch here renders the guard entirely inert while every OTHER test using
// a hand-typed role name stays green.
//
// Unlike rules.test.mjs and paths.test.mjs, this file does not exercise a
// stub: ROLES is a real, already-populated export (not a function that
// always denies), and agents/*.md already exists. So this is expected to
// PASS today — it pins a property the repository currently satisfies, the
// same way a bite-check would: it exists to fail LOUDLY the day someone
// renames an agent file or edits ROLES without the other.
//
// hooks/guard.mjs does not exist yet (Task 3). guard.sh's case statement
// dispatches on the exact same namespace-stripped spellings ("tdd-red)" etc,
// see hooks/guard.sh), so this checks whichever guard file is present,
// preferring the Node port once it lands — this file does not need to change
// when Task 3 deletes guard.sh and adds guard.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../hooks/lib/rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

function guardSourcePath() {
  const mjs = path.join(REPO_ROOT, 'hooks', 'guard.mjs');
  const sh = path.join(REPO_ROOT, 'hooks', 'guard.sh');
  if (fs.existsSync(mjs)) return mjs;
  if (fs.existsSync(sh)) return sh;
  return null;
}

function agentFiles() {
  return fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(AGENTS_DIR, f));
}

/** Extract the `name:` frontmatter field, matching the bash `sed` extraction. */
function frontmatterName(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^name:[ \t]*(.+)$/m);
  return match ? match[1].trim() : null;
}

test('ROLES is non-empty (a matrix that silently enumerates nothing looks identical to a pass)', () => {
  assert.ok(Array.isArray(ROLES));
  assert.ok(ROLES.length > 0, 'ROLES must not be empty');
});

test('agents/*.md exists and was actually enumerated', () => {
  const files = agentFiles();
  assert.ok(files.length > 0, 'expected at least one agents/*.md file');
  assert.equal(files.length, 4, `expected exactly 4 agent files (one per ROLES entry), found ${files.length}`);
});

/**
 * Extract the `tools:` frontmatter field as a sorted array of tool names,
 * matching the comma-separated form the agent files use (`tools: Read,
 * Write, Edit, Bash`).
 */
function frontmatterTools(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^tools:[ \t]*(.+)$/m);
  if (!match) return null;
  return match[1].split(',').map((t) => t.trim()).filter(Boolean).sort();
}

// Grep/Glob sit outside the PreToolUse matcher (hooks/hooks.json), so a call
// to either never reaches the guard at all, and Grep returns file content --
// the spec makes their absence here explicitly load-bearing (design spec:
// "The three agents only ever legitimately need to run the commands in
// config.json ... Grep and Glob are deliberately not granted"). This is an
// EQUALITY check, not a subset check: a subset check would permit an agent
// file gaining an extra tool, and an addition (not a removal) is the
// direction that actually opens a bypass.
const EXPECTED_TOOLS = ['Bash', 'Edit', 'Read', 'Write'];

for (const file of agentFiles()) {
  test(`${path.basename(file)}: declares a name: field that is a member of ROLES`, () => {
    const name = frontmatterName(file);
    assert.notEqual(name, null, `${path.basename(file)} has no 'name:' frontmatter field`);
    assert.ok(ROLES.includes(name), `${path.basename(file)} declares name '${name}', which is not in ROLES (${ROLES.join(', ')})`);
  });

  test(`${path.basename(file)}: declares tools: exactly Read, Write, Edit, Bash -- no more, no less`, () => {
    const tools = frontmatterTools(file);
    assert.notEqual(tools, null, `${path.basename(file)} has no 'tools:' frontmatter field`);
    assert.deepEqual(
      tools,
      EXPECTED_TOOLS,
      `${path.basename(file)} declares tools: ${tools.join(', ')}; expected exactly ${EXPECTED_TOOLS.join(', ')} -- ` +
        'Grep/Glob must never appear here (they bypass the PreToolUse matcher entirely)',
    );
  });

  test(`${path.basename(file)}: its declared name is what the guard dispatches on`, () => {
    const guardPath = guardSourcePath();
    assert.notEqual(guardPath, null, 'neither hooks/guard.mjs nor hooks/guard.sh exists');
    const name = frontmatterName(file);
    const guardSource = fs.readFileSync(guardPath, 'utf8');
    assert.ok(
      guardSource.includes(`${name})`) || guardSource.includes(`'${name}'`) || guardSource.includes(`"${name}"`),
      `${path.basename(guardPath)} does not appear to dispatch on '${name}' (declared by ${path.basename(file)})`,
    );
  });
}

// And the reverse: every role the guard/rules module knows about must have an
// agent file. A role that ROLES claims to constrain but that has no prompt
// backing it is dead weight at best and a silent contract mismatch at worst.
for (const role of ROLES) {
  test(`ROLES entry '${role}' has a corresponding agent definition`, () => {
    const found = agentFiles().some((f) => frontmatterName(f) === role);
    assert.ok(found, `no agents/*.md file declares name: ${role}`);
  });
}
