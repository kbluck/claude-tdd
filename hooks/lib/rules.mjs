// @ts-check
/**
 * Pure decision functions for the TDD guard hook.
 *
 * STUB — every export denies. Task 3 implements these; Task 2's suite must run
 * red against this file. The stub denies rather than throwing so that a test
 * asserting a *deny* cannot pass by accident: a thrown error and a considered
 * denial are different outcomes, and only one of them is evidence.
 *
 * Imported, never executed. No load-time side effects.
 */

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
  void pattern; void filePath;
  return false;
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
  void filePath; void globs;
  return false;
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
  void targetPath; void rootPath;
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
export function pathVerdict(input) {
  void input;
  return { allow: false, reason: 'stub: not implemented' };
}

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
  void command; void template;
  return { allow: false, reason: 'stub: not implemented' };
}

/**
 * True when `version` satisfies the floor. A FLOOR, never equality — the host
 * chooses the interpreter, and a newer major is correct rather than an error.
 *
 * @param {string} version e.g. process.version, "v22.23.2"
 * @returns {boolean}
 */
export function runtimeSupported(version) {
  void version;
  return false;
}
