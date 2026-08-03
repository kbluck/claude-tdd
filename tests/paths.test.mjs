// The spelling matrix — the centrepiece of the Task 2 port.
//
// hooks/lib/rules.sh tested one spelling per property and treated a pass as
// proof; four live bypasses shipped in the gap between "spellings someone
// thought of" and "spellings that exist" (spec: "Paths are canonicalised
// before matching"). This file states each property ONCE — for a given
// role × mode × canonical target, every spelling of that target must produce
// an identical verdict — and iterates spellings as DATA, so a newly
// discovered spelling is one array entry, not one more review finding.
//
// Exercises hooks/lib/rules.mjs's toRepoRelative() + pathVerdict() together,
// against REAL fixtures on disk (a temp directory, including a real
// symlink) — canonicalisation needs a real filesystem to resolve against;
// nothing here is achievable by mocking fs.
//
// Every combo below runs a HARD check first: the reference (correctly)
// spelled path must produce the documented, correct verdict. That check is
// what makes this file genuinely red against the stub — the *other* checks
// in a combo (every alternate spelling must match the reference's ACTUAL
// verdict) would pass vacuously under a stub that is uniformly wrong for
// every input, so on its own "all spellings agree with each other" is not
// evidence of anything. Both checks together are: canonicalisation collapses
// every spelling to the SAME identity (relative check), and that identity is
// judged correctly (absolute check against the reference).

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROLES, toRepoRelative, pathVerdict } from '../hooks/lib/rules.mjs';
import { assertAllow, assertDeny, assertSameVerdict, assertVerdictShape } from './helpers/verdict-assertions.mjs';

const [RED, GREEN, REFACTOR, MUTATE] = ROLES;
const TEST_GLOBS = ['tests/**', '**/test_*.py'];
const SOURCE_GLOBS = ['src/**'];

/** @type {string} */
let ROOT;
/** @type {boolean} */
let CASE_INSENSITIVE_FS;

before(() => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-paths-matrix-'));
  // Resolve the scratch dir itself through the SAME canonicalisation the
  // matcher uses. On macOS, os.tmpdir() is itself under a symlink
  // (/tmp -> /private/tmp) -- comparing an unresolved ROOT against a
  // resolved child path would fail for a reason that has nothing to do with
  // the matcher under test. This mirrors what the guard does in production:
  // CLAUDE_PROJECT_DIR is a real, already-existing directory, and the guard
  // canonicalises the target against it, not the other way around.
  ROOT = fs.realpathSync.native(scratch);

  fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'a.py'), '# source\n');
  fs.writeFileSync(path.join(ROOT, 'tests', 'test_a.py'), '# test\n');
  fs.writeFileSync(path.join(ROOT, 'README.md'), '# unclassified\n');

  fs.symlinkSync(path.join(ROOT, 'src'), path.join(ROOT, 'linksrc'), 'dir');
  fs.symlinkSync(path.join(ROOT, 'tests'), path.join(ROOT, 'linktests'), 'dir');

  // Case-sensitivity probe: on a case-insensitive filesystem (macOS's
  // default APFS), looking up the upper-cased name of a file created
  // lower-case finds it. The uppercase-directory/uppercase-basename rows
  // below adapt their expectation to whichever this machine actually is,
  // rather than assuming one -- see the comment above EXPECTED_UPPERCASE.
  CASE_INSENSITIVE_FS = fs.existsSync(path.join(ROOT, 'SRC', 'a.py'));
  // eslint-disable-next-line no-console
  console.log(`[paths.test.mjs] filesystem under ${ROOT} is case-${CASE_INSENSITIVE_FS ? 'INsensitive' : 'sensitive'}`);
});

after(() => {
  if (ROOT) fs.rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// toRepoRelative contract tests — not part of the spelling matrix (nothing
// here compares one spelling against another), but properties toRepoRelative
// must hold on its own before the matrix's assumptions are meaningful.
// ---------------------------------------------------------------------------

test('toRepoRelative: a real path OUTSIDE the root returns null (not "relative to something else")', () => {
  // os.tmpdir() is a real, resolvable directory, and an ANCESTOR of ROOT
  // (ROOT was created under it) -- so this exercises "not inside the root",
  // not "cannot resolve at all".
  const outside = fs.realpathSync.native(os.tmpdir());
  const rel = toRepoRelative(outside, ROOT);
  assert.equal(rel, null, 'a path that is an ancestor of the root, not inside it, must not be treated as in-root');
});

test('toRepoRelative: a root that does not resolve at all returns null', () => {
  const bogusRoot = path.join(ROOT, 'this-directory-was-never-created');
  const target = path.join(bogusRoot, 'src', 'a.py');
  assert.equal(toRepoRelative(target, bogusRoot), null);
});

test('toRepoRelative: resolves the nearest EXISTING ancestor and re-appends a non-existent leaf (a brand-new file)', () => {
  // Every Write of a new test is exactly this shape: 'tests/' exists,
  // 'test_brand_new.py' does not. realpath alone throws ENOENT on this;
  // resolving only the parent (the "obvious" recipe the spec warns against)
  // would also fail one level deeper. This is the case the design exists to
  // get right.
  const target = path.join(ROOT, 'tests', 'test_brand_new.py');
  assert.equal(toRepoRelative(target, ROOT), 'tests/test_brand_new.py');
});

test('toRepoRelative: resolves through a brand-new, not-yet-existing SUBDIRECTORY, not just a new leaf', () => {
  // A stricter version of the above: neither 'newpkg' nor the file exists.
  // "Resolve only the parent directory" rejects this legitimately (the
  // parent of the leaf is 'newpkg', which also doesn't exist); the spec
  // requires walking to the deepest EXISTING ancestor, which is 'src'.
  const target = path.join(ROOT, 'src', 'newpkg', 'mod.py');
  assert.equal(toRepoRelative(target, ROOT), 'src/newpkg/mod.py');
});

test('toRepoRelative: separators are converted to / even for a path that never touched the filesystem as a whole', () => {
  const target = path.join(ROOT, 'src', 'newpkg', 'mod.py');
  const rel = toRepoRelative(target, ROOT);
  assert.equal(rel?.includes('\\'), false, 'no backslash should survive into a repo-relative path on any platform');
});

// ---------------------------------------------------------------------------
// The spelling matrix.
// ---------------------------------------------------------------------------

/**
 * Every required spelling of `relPath` (POSIX, exactly one '/', e.g.
 * 'src/a.py'), rooted at `root`. Built with plain string concatenation, not
 * path.join/path.resolve — those functions collapse './' and '//' as a
 * normalisation step, which would silently erase the very defects these
 * rows exist to reproduce.
 *
 * Excludes the 'root spelled $ROOT/.' row (that changes the ROOT argument,
 * not the target) and 'drive-letter case' (structurally unreachable on a
 * POSIX filesystem — see the test.todo below) — both handled outside this
 * function.
 */
function spellingsFor(root, relPath) {
  const [dir, base] = relPath.split('/');
  const siblingDir = dir === 'src' ? 'tests' : 'src';
  const symlinkDir = dir === 'src' ? 'linksrc' : 'linktests';

  return {
    // 'x' (baseline) and 'absolute path' (iteration-1 fix) collapse to the
    // same spelling here: guard.mjs (Task 3) always hands toRepoRelative an
    // ABSOLUTE payload path — measured empirically, spec: "tool_input.file_path
    // arrives absolute, even when the agent was given a relative path" — so
    // the plain, correctly-spelled absolute path is simultaneously the
    // baseline every other row is compared against AND the case the
    // iteration-1 fix made work at all.
    reference: `${root}/${dir}/${base}`,

    // './x' (iteration-1 fix): a './' segment mid-path.
    dotSlash: `${root}/./${dir}/${base}`,

    // 'x//y' (iteration-1 fix): a doubled separator.
    doubleSlash: `${root}/${dir}//${base}`,

    // '..' traversal that resolves BACK INSIDE the root (iteration-1 fix).
    // realpath resolves '..' as an ordinary filesystem operation; this row
    // pins that an internal '..' is not mistaken for something suspicious.
    dotdotTraversal: `${root}/${siblingDir}/../${dir}/${base}`,

    // Bonus, beyond the required rows: a BARE relative path (no root prefix
    // at all). The spec doesn't say what a relative targetPath resolves
    // against, but this codebase has been bitten twice by verdicts that
    // depended on ambient process state (the bash `set -f` glob-expansion
    // bug; zsh's `path`/`PATH` aliasing) — so a toRepoRelative that resolves
    // relative input against process.cwd() rather than the ROOT it was
    // explicitly handed would reintroduce exactly that class of bug. This
    // expects resolution against `root`. If Task 3 has a documented reason
    // to resolve against cwd instead, this is the row to change — not the
    // ones above it.
    bareRelative: `${dir}/${base}`,

    // Uppercase directory / uppercase basename (S2, live at review time).
    // Expected outcome depends on the filesystem's case-sensitivity —
    // see EXPECTED_UPPERCASE below.
    upperDir: `${root}/${dir.toUpperCase()}/${base}`,
    upperBase: `${root}/${dir}/${base.toUpperCase()}`,

    // Symlinked route (S2 residual, recorded not fixed).
    symlinkRoute: `${root}/${symlinkDir}/${base}`,

    // Backslash separators (new: Windows). On this POSIX machine the
    // filesystem never splits on '\', so this exercises the STRING-LEVEL
    // separator conversion the spec requires ("Convert separators to /
    // ... immediately after canonicalisation") rather than a native
    // Windows path split — which is exactly the point: it is a row in the
    // spelling matrix like any other, not a test that requires Windows.
    backslashSeparators: `${root}/${dir}\\${base}`,
  };
}

const REQUIRED_ROW_LABELS = [
  'reference',
  'dotSlash',
  'doubleSlash',
  'dotdotTraversal',
  'bareRelative',
  'upperDir',
  'upperBase',
  'symlinkRoute',
  'backslashSeparators',
  'rootDot', // handled separately below (mutates the ROOT argument)
];

/**
 * The four roles' boundaries, both directions, over the two canonical
 * targets — covers every role at least once, and both a source file and a
 * test file for the two roles (red, green) whose boundary runs in both
 * directions.
 */
const COMBOS = [
  { name: 'red may not read source', role: RED, mode: 'read', relPath: 'src/a.py', expectAllow: false },
  { name: 'red may write a test file', role: RED, mode: 'write', relPath: 'tests/test_a.py', expectAllow: true },
  { name: 'green may not read tests', role: GREEN, mode: 'read', relPath: 'tests/test_a.py', expectAllow: false },
  { name: 'green may write source', role: GREEN, mode: 'write', relPath: 'src/a.py', expectAllow: true },
  { name: 'refactor may not read tests', role: REFACTOR, mode: 'read', relPath: 'tests/test_a.py', expectAllow: false },
  { name: 'refactor may write source', role: REFACTOR, mode: 'write', relPath: 'src/a.py', expectAllow: true },
  { name: 'tdd-mutate may not read tests', role: MUTATE, mode: 'read', relPath: 'tests/test_a.py', expectAllow: false },
  { name: 'tdd-mutate may write source', role: MUTATE, mode: 'write', relPath: 'src/a.py', expectAllow: true },
];

// Sanity: the matrix itself must not be able to silently enumerate nothing.
assert.ok(COMBOS.length === 8, `expected 8 canonical combos, found ${COMBOS.length}`);
assert.ok(REQUIRED_ROW_LABELS.length === 10, `expected 10 required spelling rows, found ${REQUIRED_ROW_LABELS.length}`);

// Each row is a NESTED subtest (t.test), not a bare assertion inside one big
// test(). Two reasons: (1) node:test reports each nested subtest in the TAP
// count, which is how "the row count is asserted so a matrix that silently
// enumerates nothing fails" (plan, Task 2 done-when) becomes a machine-checked
// number rather than a claim; (2) a thrown assertion inside a t.test() does
// NOT abort its siblings, so one failing row (e.g. the reference spelling,
// which is expected to fail against the stub) does not hide whether the
// other nine rows ran at all — exactly the granularity Task 3's implementer
// needs when only some rows still fail.
//
// Every rel/verdict used for COMPARISON is computed unconditionally, before
// any assertion — so a failed assertion in one subtest never leaves a later
// subtest computing against `undefined`.
let matrixRowsRun = 0;

for (const combo of COMBOS) {
  test(`spelling matrix: ${combo.name} — every spelling of the same target agrees`, async (t) => {
    const spellings = spellingsFor(ROOT, combo.relPath);
    const verdictFor = (relPath) => pathVerdict({ role: combo.role, mode: combo.mode, relPath, testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });

    // --- the hard check: the reference spelling must be judged CORRECTLY.
    // This is what makes the combo genuinely red against the stub; every
    // relative check below it would otherwise pass vacuously (a uniformly
    // wrong stub agrees with itself on every spelling).
    const referenceRel = toRepoRelative(spellings.reference, ROOT);
    const referenceVerdict = verdictFor(referenceRel);
    await t.test('reference spelling', () => {
      assert.equal(referenceRel, combo.relPath, `reference spelling must canonicalise to '${combo.relPath}'`);
      if (combo.expectAllow) assertAllow(referenceVerdict, `${combo.name}: reference spelling`);
      else assertDeny(referenceVerdict, `${combo.name}: reference spelling`);
    });
    matrixRowsRun++;

    // --- every OTHER spelling must canonicalise to the exact same
    // repo-relative path, and therefore produce the IDENTICAL verdict
    // (same allow bit, same reason) as the reference.
    for (const label of ['dotSlash', 'doubleSlash', 'dotdotTraversal', 'bareRelative', 'symlinkRoute', 'backslashSeparators']) {
      const rel = toRepoRelative(spellings[label], ROOT);
      const verdict = verdictFor(rel);
      await t.test(`'${label}' spelling`, () => {
        assert.equal(rel, combo.relPath, `${label} spelling of ${combo.relPath} must canonicalise identically`);
        assertSameVerdict(verdict, referenceVerdict, `${combo.name}: '${label}' spelling of the same file`);
      });
      matrixRowsRun++;
    }

    // --- 'root spelled $ROOT/.' (S2a: recorded FIXED, never reached the
    // code). Same target, root re-spelled instead of the target.
    const rootDotRel = toRepoRelative(spellings.reference, `${ROOT}/.`);
    const rootDotVerdict = verdictFor(rootDotRel);
    await t.test("root spelled '$ROOT/.'", () => {
      assert.equal(rootDotRel, combo.relPath, `root spelled '$ROOT/.' must canonicalise identically`);
      assertSameVerdict(rootDotVerdict, referenceVerdict, `${combo.name}: root spelled '$ROOT/.'`);
    });
    matrixRowsRun++;

    // --- uppercase directory / uppercase basename (S2). A READ's
    // denylist is folded, so it converges to the SAME verdict as the
    // reference regardless of the filesystem's case-sensitivity: on a
    // case-insensitive FS, realpath resolves the wrong-case ancestor to its
    // true stored spelling before pathVerdict ever runs; on a case-sensitive
    // FS the ancestor walk lands on ROOT and re-appends the wrong-case tail
    // verbatim, and the read-side fold matches it anyway. A WRITE's
    // allowlist is NOT folded — on a case-insensitive FS the same
    // OS-level resolution still makes it converge, but on a case-sensitive
    // FS the verbatim wrong-case tail fails the literal-only match, and the
    // correct outcome is a DENIAL where the reference allows (a false
    // denial — "loud and safe", per the spec, not a bug).
    for (const label of ['upperDir', 'upperBase']) {
      const rel = toRepoRelative(spellings[label], ROOT);
      const verdict = verdictFor(rel);
      const convergesToReference = combo.mode === 'read' || CASE_INSENSITIVE_FS;
      await t.test(`'${label}' spelling (${convergesToReference ? 'expected to converge' : 'expected false denial on a case-sensitive filesystem'})`, () => {
        assertVerdictShape(verdict, `${combo.name}: '${label}' spelling`);
        if (convergesToReference) {
          assert.equal(rel, combo.relPath, `${label} on a ${combo.mode} must canonicalise identically to '${combo.relPath}'`);
          assertSameVerdict(verdict, referenceVerdict, `${combo.name}: '${label}' spelling (expected to converge)`);
        } else {
          // case-sensitive filesystem, write mode: the wrong-case ancestor
          // does not resolve, the verbatim tail fails the literal-only
          // allowlist match, and the write must be denied even though the
          // reference (correctly-cased) spelling is allowed.
          assertDeny(verdict, `${combo.name}: '${label}' on a case-sensitive filesystem must deny rather than fold a write`);
        }
      });
      matrixRowsRun++;
    }
  });
}

test('spelling matrix: the total row count actually moved (no combo silently ran zero rows)', () => {
  // 8 combos * 10 rows each = 80. Asserted as a literal number, not derived
  // from the loop that produced it, so a change to either constant is a
  // visible, deliberate edit here too.
  const expected = COMBOS.length * REQUIRED_ROW_LABELS.length;
  assert.equal(expected, 80);
  assert.equal(matrixRowsRun, expected, `expected exactly ${expected} matrix rows to have run by this point, saw ${matrixRowsRun}`);
});

// ---------------------------------------------------------------------------
// Drive-letter case (C: vs c:) — new, Windows.
//
// Unreachable on a POSIX filesystem: fs.realpathSync.native here has no
// concept of a drive letter at all, and a repo-relative path (pathVerdict's
// actual input) cannot contain one regardless of platform — the concern
// lives entirely in toRepoRelative's root-strip step on a REAL Windows
// filesystem. Fabricating a Windows-shaped string on macOS would not
// exercise that code path; it would exercise POSIX's ordinary
// single-component-filename handling instead, and a pass or fail here would
// be evidence about neither. The plan document says it plainly: "Windows is
// not verified, only written for." Recorded as a TODO, not skipped silently.
// ---------------------------------------------------------------------------

test.todo('spelling matrix: drive-letter case (C:\\ vs c:\\) — requires a real Windows filesystem; not exercisable on POSIX (see plan: "Windows is not verified, only written for")');
