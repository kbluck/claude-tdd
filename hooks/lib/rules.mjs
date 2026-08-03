// @ts-check
/**
 * Pure decision functions for the TDD guard hook.
 *
 * No globals, no load-time side effects beyond importing `node:fs` itself
 * (needed only by `toRepoRelative`'s canonicalisation). Every function
 * degrades a malformed input to a deny/false rather than throwing — a caller
 * bug must never become an exception, which, under the guard's exit-2-only
 * semantics, permits.
 */

import fs from 'node:fs';

/**
 * A verdict. `reason` is empty when `allow` is true, and names the violated
 * rule otherwise — the guard forwards it to the agent as correctable feedback,
 * so it has to say which rule, not merely that one fired.
 * @typedef {{ allow: boolean, reason: string }} Verdict
 */

/** Roles the guard constrains. Anything else is not ours and is permitted. */
export const ROLES = /** @type {const} */ (['tdd-red', 'tdd-green', 'tdd-refactor', 'tdd-mutate']);

/** Lowest Node major the guard will run under. See the spec: a floor, not a pin. */
export const NODE_FLOOR = 22;

/** @returns {Verdict} */
function allow() {
  return { allow: true, reason: '' };
}

/**
 * @param {string} reason
 * @returns {Verdict}
 */
function deny(reason) {
  return { allow: false, reason };
}

/**
 * Convert either separator dialect to the POSIX one globs are spelled in.
 * @param {string} p
 * @returns {string}
 */
function toPosixSlashes(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Match one glob against one POSIX-spelled, repo-relative path.
 *
 * Dialect is defined here rather than delegated, because `path.matchesGlob` is
 * experimental and absent before 22.5, and because `**` semantics are the
 * subject of a live defect:
 *   - `*`  matches within a single segment
 *   - `**` crosses `/`
 *   - a LEADING `**​/` matches at zero depth, so `**​/test_*.py` matches
 *     `test_foo.py` as well as `a/b/test_foo.py`
 *
 * @param {string} pattern
 * @param {string} filePath POSIX-spelled, already canonicalised
 * @returns {boolean}
 */
export function globMatch(pattern, filePath) {
  if (typeof pattern !== 'string' || typeof filePath !== 'string') return false;

  let re = '^';
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        // A leading (or mid-pattern) '**/' crosses zero or more whole path
        // segments — it must match at ZERO depth (the S3 defect: '**/x' has
        // to match 'x' itself, not merely something nested under a directory).
        re += '(?:.*/)?';
        i += 3;
      } else {
        // '**' not followed by '/' — matches anything, including '/'.
        re += '.*';
        i += 2;
      }
    } else if (c === '*') {
      // A single '*' matches within one segment only.
      re += '[^/]*';
      i += 1;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  re += '$';
  return new RegExp(re).test(filePath);
}

/**
 * True when any glob matches. `globs` is an ARRAY — the config is JSON, so the
 * space-separated string that word-split in bash does not exist here, and
 * neither does the pathname-expansion fail-open it caused.
 *
 * A non-array, or an array containing a non-string, must return false: an input
 * that cannot be evaluated is not a match.
 *
 * @param {string} filePath
 * @param {unknown} globs
 * @returns {boolean}
 */
export function matchesAny(filePath, globs) {
  if (typeof filePath !== 'string') return false;
  if (!Array.isArray(globs)) return false;
  if (globs.length === 0) return false;
  if (!globs.every((g) => typeof g === 'string')) return false;
  return globs.some((g) => globMatch(/** @type {string} */ (g), filePath));
}

/**
 * `globs` is usable as a governing list (an allowlist or a denylist) only when
 * it is a non-empty array of strings. An empty or malformed list can prove
 * nothing about a path, which is a DIFFERENT failure than "a valid list simply
 * did not match" — the two must be distinguishable reasons (see pathVerdict).
 * @param {unknown} globs
 * @returns {boolean}
 */
function isUsableGlobList(globs) {
  return Array.isArray(globs) && globs.length > 0 && globs.every((g) => typeof g === 'string');
}

/**
 * Resolve the nearest existing ancestor of `absPosixPath` (POSIX-spelled,
 * absolute) through `fs.realpathSync.native`, then report the unresolved
 * tail. When the whole path exists, the "ancestor" is the path itself and the
 * tail is empty — this single loop is both "resolve fully" and "resolve the
 * parent and re-append the leaf", unified by walking one segment at a time.
 * @param {string} absPosixPath
 * @returns {{ resolvedPosix: string, tailSegments: string[] } | null}
 */
function resolveDeepestExisting(absPosixPath) {
  const segments = absPosixPath.split('/');
  for (let i = segments.length; i >= 1; i--) {
    const candidate = segments.slice(0, i).join('/') || '/';
    try {
      const real = fs.realpathSync.native(candidate);
      return {
        resolvedPosix: toPosixSlashes(real).replace(/\/+$/, '') || '/',
        tailSegments: segments.slice(i).filter(Boolean),
      };
    } catch {
      // Try a shallower ancestor.
    }
  }
  return null;
}

/**
 * Canonicalise `targetPath` and express it relative to `rootPath`.
 *
 * Resolve the deepest ancestor that exists through the filesystem (which
 * resolves symlinks and returns the stored case), re-append the unresolved
 * tail, convert separators to `/`, and strip the root prefix.
 *
 * Returns `null` when the path is not inside the root, or when it cannot be
 * resolved at all. `null` is NOT "permit" — the caller decides, and for a write
 * it must deny.
 *
 * @param {string} targetPath may be absolute or relative, any separator dialect
 * @param {string} rootPath
 * @returns {string | null} repo-relative POSIX path, or null
 */
export function toRepoRelative(targetPath, rootPath) {
  if (typeof targetPath !== 'string' || targetPath === '') return null;
  if (typeof rootPath !== 'string' || rootPath === '') return null;

  /** @type {string} */
  let rootResolved;
  try {
    rootResolved = fs.realpathSync.native(rootPath);
  } catch {
    return null;
  }
  const rootPosix = toPosixSlashes(rootResolved).replace(/\/+$/, '') || '/';

  const targetPosix = toPosixSlashes(targetPath);
  const absoluteTargetPosix = targetPosix.startsWith('/') ? targetPosix : `${rootPosix}/${targetPosix}`;

  const resolved = resolveDeepestExisting(absoluteTargetPosix);
  if (!resolved) return null;

  const fullResolvedPosix = resolved.tailSegments.length > 0
    ? `${resolved.resolvedPosix}/${resolved.tailSegments.join('/')}`
    : resolved.resolvedPosix;

  if (fullResolvedPosix === rootPosix) return '';
  if (fullResolvedPosix.startsWith(`${rootPosix}/`)) {
    return fullResolvedPosix.slice(rootPosix.length + 1);
  }
  return null;
}

/**
 * Verdict for a path access.
 *
 * Writes are an allowlist: no match denies. Reads are a denylist: only a match
 * against the forbidden set denies. That asymmetry is deliberate and is why
 * case folding is applied to reads only — folding widens the match, which is
 * fail-closed for a denylist and fail-OPEN for an allowlist.
 *
 * Every field is validated. A missing role, an unknown mode, a null relPath, or
 * a glob list that is not an array of strings must deny.
 *
 * @param {object} input
 * @param {string} input.role bare role name, namespace already stripped
 * @param {'read'|'write'} input.mode
 * @param {string | null} input.relPath repo-relative, from toRepoRelative
 * @param {unknown} input.testGlobs
 * @param {unknown} input.sourceGlobs
 * @returns {Verdict}
 */
export function pathVerdict({ role, mode, relPath, testGlobs, sourceGlobs } = /** @type {any} */ ({})) {
  if (mode !== 'read' && mode !== 'write') {
    return deny(`the guard does not recognise mode '${mode}'; failing closed`);
  }
  if (typeof role !== 'string' || !ROLES.includes(/** @type {any} */ (role))) {
    return deny(`the guard does not recognise role '${role}'; failing closed`);
  }
  if (typeof relPath !== 'string' || relPath === '') {
    return deny('no resolvable path was provided for this call; the guard fails closed');
  }

  const isRed = role === 'tdd-red';

  if (mode === 'write') {
    const allowGlobs = isRed ? testGlobs : sourceGlobs;
    const kind = isRed ? 'test' : 'source';
    if (!isUsableGlobList(allowGlobs)) {
      return deny(`no ${kind} globs are configured, so no write can be verified; the guard fails closed`);
    }
    if (matchesAny(relPath, allowGlobs)) {
      return allow();
    }
    return deny(`${role} may only write ${kind} files; ${relPath} is not under the configured ${kind} globs`);
  }

  // mode === 'read'
  const denyGlobs = isRed ? sourceGlobs : testGlobs;
  const kind = isRed ? 'source' : 'test';
  if (!isUsableGlobList(denyGlobs)) {
    const cannotBe = kind === 'source' ? 'source' : 'a test';
    return deny(`no ${kind} globs are configured, so ${relPath} cannot be shown not to be ${cannotBe}; the guard fails closed`);
  }
  const folded = relPath.toLowerCase();
  if (matchesAny(relPath, denyGlobs) || matchesAny(folded, denyGlobs)) {
    return deny(`${role} may not read ${kind} files; ${relPath} is under the configured ${kind} globs`);
  }
  return allow();
}

/** Shell metacharacters banned from the agent-supplied delta. Shell-agnostic
 * on purpose: Git Bash and PowerShell disagree on syntax but not on which of
 * these are special to at least one of them. `&&` is not listed separately —
 * banning `&` alone also catches it. */
const BASH_METACHARACTERS = [';', '|', '&', '>', '<', '`', '$(', '\n'];

/**
 * Verdict for a Bash command against one configured command template.
 *
 * The command must begin with the template's static prefix — everything before
 * the first `{` placeholder. Whatever the agent added beyond that prefix (the
 * delta) must contain no shell metacharacter and no `..`.
 *
 * An empty static prefix must DENY: a prefix that matches everything leaves
 * only the metacharacter ban, so any clean-looking command would run.
 *
 * @param {string} command
 * @param {string} template
 * @returns {Verdict}
 */
export function bashVerdict(command, template) {
  if (typeof template !== 'string') {
    return deny('no command is configured for this phase; the guard fails closed');
  }

  const placeholderIdx = template.indexOf('{');
  const rawPrefix = placeholderIdx === -1 ? template : template.slice(0, placeholderIdx);
  const prefix = rawPrefix.replace(/\s+$/, '');

  if (prefix === '') {
    return deny('the configured command for this phase has no static prefix, so it cannot constrain anything; the guard fails closed');
  }

  if (typeof command !== 'string') {
    return deny('no command was provided for this call; the guard fails closed');
  }

  if (!command.startsWith(prefix)) {
    return deny(`only the configured command for this phase may be run; expected it to start with '${prefix}'`);
  }

  const delta = command.slice(prefix.length);

  for (const metachar of BASH_METACHARACTERS) {
    if (delta.includes(metachar)) {
      return deny(`shell metacharacters are not permitted in arguments; got '${delta}'`);
    }
  }

  if (delta.includes('..')) {
    return deny(`'..' is not permitted in arguments; got '${delta}'`);
  }

  return allow();
}

/**
 * True when `version` satisfies the floor. A FLOOR, never equality — the host
 * chooses the interpreter, and a newer major is correct rather than an error.
 *
 * @param {string} version e.g. process.version, "v22.23.2"
 * @returns {boolean}
 */
export function runtimeSupported(version) {
  if (typeof version !== 'string') return false;
  const match = version.match(/^v?(\d+)\./);
  if (!match) return false;
  const major = Number(match[1]);
  if (!Number.isFinite(major)) return false;
  return major >= NODE_FLOOR;
}
