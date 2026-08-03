#!/usr/bin/env node
// @ts-check
/**
 * PreToolUse guard for the TDD subagent workflow.
 *
 * Identifies the caller from the payload's agent_type. Main-thread calls
 * carry no agent_type and are permitted untouched, so installing this
 * plugin does not perturb unrelated sessions. Once a constrained tdd-*
 * agent IS identified, any condition the guard cannot evaluate denies: a
 * guard that fails open would silently disable read isolation, the one
 * property nothing else in this design can enforce.
 *
 * Registered in exec form ("command": "node", "args": [".../guard.mjs"]) —
 * no shell, so no ${VAR}-vs-$env:VAR dialect can intervene. See hooks.json.
 */

import fs from 'node:fs';
import { ROLES, NODE_FLOOR, toRepoRelative, pathVerdict, bashVerdict, runtimeSupported } from './lib/rules.mjs';

/**
 * Per-role candidate command keys, tried in order until one matches. Red and
 * Green both get {single, coverage}; Refactor gets {test, coverage,
 * complexity}; Mutate gets {test, mutation}. Keyed on the namespace-stripped
 * role spelling (ROLES), not the old bash short names — that spelling is what
 * agents.test.mjs asserts the guard dispatches on.
 * @type {Record<string, string[]>}
 */
const BASH_COMMAND_KEYS = {
  'tdd-red': ['single', 'coverage'],
  'tdd-green': ['single', 'coverage'],
  'tdd-refactor': ['test', 'coverage', 'complexity'],
  'tdd-mutate': ['test', 'mutation'],
};

/**
 * Tool name -> { mode, path key in tool_input }. Bash has no path key.
 * @type {Record<string, { mode: 'read'|'write'|'bash', pathKey: string|null }>}
 */
const TOOL_DISPATCH = {
  Read: { mode: 'read', pathKey: 'file_path' },
  NotebookRead: { mode: 'read', pathKey: 'notebook_path' },
  Write: { mode: 'write', pathKey: 'file_path' },
  Edit: { mode: 'write', pathKey: 'file_path' },
  MultiEdit: { mode: 'write', pathKey: 'file_path' },
  NotebookEdit: { mode: 'write', pathKey: 'notebook_path' },
  Bash: { mode: 'bash', pathKey: null },
};

/**
 * Emit the deny payload to stderr — synchronously, so nothing can truncate
 * it — and set the exit code. On exit 2, PreToolUse ignores stdout entirely
 * and reads only stderr; getting this backwards silently drops the message
 * a blocked agent needs to self-correct.
 * @param {string} message
 */
function deny(message) {
  const body = JSON.stringify({
    hookSpecificOutput: { permissionDecision: 'deny' },
    systemMessage: message,
  });
  fs.writeSync(2, `${body}\n`);
  process.exitCode = 2;
}

/**
 * True when `rawPath` contains a literal '..' path segment. Checked on the
 * untrusted, un-canonicalised payload string, before toRepoRelative ever
 * runs — toRepoRelative resolves '..' as an ordinary filesystem operation
 * (required so a path like 'tests/../src/a.py' that lands back inside the
 * root still canonicalises correctly), so it cannot also be the traversal
 * guard. Wrapping in slashes catches a leading or trailing '..' too.
 * @param {string} rawPath
 * @returns {boolean}
 */
function containsDotDotSegment(rawPath) {
  const posix = rawPath.replace(/\\/g, '/');
  return `/${posix}/`.includes('/../');
}

function main() {
  // Checked before anything else can throw. Nothing in this project selects
  // the hook's interpreter, so this is the only mechanism that enforces the
  // version floor at all -- and it must be a deliberate deny, never a crash
  // on a missing API, because a crash exits non-2 and permits.
  if (!runtimeSupported(process.version)) {
    deny(
      `tdd guard: Node ${process.version} is below the supported floor (v${NODE_FLOOR}+). ` +
        'The guard cannot safely evaluate tool calls under this runtime. Update Node, or run /tdd-init to re-check.',
    );
    return;
  }

  try {
    runGuardBody();
  } catch (err) {
    // Wrap the whole body: any thrown error becomes a deliberate exit 2
    // rather than an uncaught exception, which would exit non-2 and permit.
    deny(
      `tdd guard: an unexpected error occurred while evaluating this call; failing closed (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
}

function runGuardBody() {
  const raw = fs.readFileSync(0, 'utf8');
  const payload = JSON.parse(raw);

  const rawAgentType = payload?.agent_type;
  if (typeof rawAgentType !== 'string' || rawAgentType === '') {
    return; // main thread / orchestrator -- no agent_type at all -- permit
  }

  // Plugin-provided agents arrive NAMESPACED ("claude-tdd:tdd-red"). Matching
  // the bare name alone misses every real dispatch and renders the guard
  // entirely inert. Stripping is deliberately broad: another plugin's own
  // "tdd-red" is also constrained here -- a false denial, loud and safe,
  // rather than matching too narrowly and permitting silently.
  const role = rawAgentType.slice(rawAgentType.lastIndexOf(':') + 1);
  if (!ROLES.includes(/** @type {any} */ (role))) {
    return; // some other agent's work -- not ours
  }

  // From here on, every failure denies.
  const root = process.env.TDD_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR
    || (typeof payload?.cwd === 'string' ? payload.cwd : '');
  if (!root) {
    deny(`tdd guard: cannot determine the project root for ${rawAgentType}`);
    return;
  }
  const rootNormalised = root.replace(/\\/g, '/').replace(/\/+$/, '');

  const configPath = `${rootNormalised}/.tdd/config.json`;
  /** @type {any} */
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    deny(
      `tdd guard: .tdd/config.json is missing or malformed; run /tdd-init (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
    return;
  }

  const testGlobs = config?.globs?.test;
  const sourceGlobs = config?.globs?.source;

  const toolName = payload?.tool_name;
  const dispatch = Object.prototype.hasOwnProperty.call(TOOL_DISPATCH, toolName) ? TOOL_DISPATCH[toolName] : undefined;
  if (!dispatch) {
    deny(`tdd guard: ${rawAgentType} called an unrecognized tool '${toolName}'; the guard cannot classify it and fails closed`);
    return;
  }

  if (dispatch.mode === 'bash') {
    const command = payload?.tool_input?.command;
    if (typeof command !== 'string' || command === '') {
      deny(`tdd guard: this Bash call from ${rawAgentType} carries no command, so it cannot be checked; the guard fails closed`);
      return;
    }

    const candidateKeys = BASH_COMMAND_KEYS[role];
    if (!candidateKeys) {
      deny(`tdd guard: unmappable role for agent '${rawAgentType}'`);
      return;
    }

    /** @type {{allow: boolean, reason: string}} */
    let verdict = { allow: false, reason: `no configured command for ${rawAgentType} matches` };
    for (const key of candidateKeys) {
      const template = config?.commands?.[key];
      if (typeof template !== 'string' || template === '') continue;
      verdict = bashVerdict(command, template);
      if (verdict.allow) break;
    }

    if (verdict.allow) return;
    deny(verdict.reason);
    return;
  }

  const pathKey = /** @type {string} */ (dispatch.pathKey);
  const rawPath = payload?.tool_input?.[pathKey];
  if (typeof rawPath !== 'string' || rawPath === '') {
    deny(`tdd guard: this ${toolName} call from ${rawAgentType} carries no ${pathKey}, so it cannot be checked; the guard fails closed`);
    return;
  }

  // Reject traversal BEFORE canonicalisation -- see containsDotDotSegment's
  // own comment for why this cannot live inside toRepoRelative.
  if (containsDotDotSegment(rawPath)) {
    deny(`tdd guard: path contains a '..' segment and cannot be classified safely: ${rawPath}`);
    return;
  }

  const relPath = toRepoRelative(rawPath, rootNormalised);
  const verdict = pathVerdict({
    role,
    mode: /** @type {'read'|'write'} */ (dispatch.mode),
    relPath,
    testGlobs,
    sourceGlobs,
  });

  if (verdict.allow) return;
  deny(verdict.reason);
}

main();
