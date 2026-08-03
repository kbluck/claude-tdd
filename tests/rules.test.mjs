// node:test port of tests/rules.test.sh, run with `node --test tests/`.
//
// Ported against hooks/lib/rules.mjs, which is currently a STUB: every export
// denies or returns false (see that file's header comment). Every assertion
// below is expected to fail RED against the stub, for one of two reasons:
//   (a) the stub always denies/returns false, so an ALLOW expectation fails; or
//   (b) the stub returns the SAME reason text for every call, so a
//       distinct-reasons expectation fails even where the boolean matches.
// Reason (b) exists on purpose — see assertDistinctReasons in
// tests/helpers/verdict-assertions.mjs — and is what stops a future
// implementation from denying-for-the-wrong-reason while still reading green.
//
// Role vocabulary: rules.mjs exports ROLES = ['tdd-red', 'tdd-green',
// 'tdd-refactor', 'tdd-mutate'] — the NAMESPACE-STRIPPED form ("claude-tdd:"
// removed, the "tdd-" kept). This is a deliberate departure from the retired
// hooks/lib/rules.sh, which used bare names ('red', 'green', 'mutation') —
// those never appear outside guard.sh/rules.sh, both retired by the port, and
// every other user-visible surface (agents/*.md `name:`, the spec's boundary
// table, the measured `agent_type` payload) spells the role WITH the `tdd-`
// prefix. Every role literal in this file is drawn from the imported ROLES
// array rather than retyped, so a wrong guess here is a one-line fix, not a
// silent mass-mismatch across every row.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  NODE_FLOOR,
  globMatch,
  matchesAny,
  pathVerdict,
  bashVerdict,
  runtimeSupported,
} from '../hooks/lib/rules.mjs';
import {
  assertAllow,
  assertDeny,
  assertVerdictShape,
  assertDistinctReasons,
  assertSameVerdict,
} from './helpers/verdict-assertions.mjs';

const [RED, GREEN, REFACTOR, MUTATE] = ROLES;

const TEST_GLOBS = ['tests/**', '**/test_*.py'];
const SOURCE_GLOBS = ['src/**'];

// ---------------------------------------------------------------------------
// Glob dialect: globMatch(pattern, filePath)
//
// `*` matches within one segment; `**` crosses `/`; a LEADING `**/` matches at
// ZERO depth. This is the S3 defect (spec: "`**` at the start of a glob must
// match zero depth") — the bash matcher rewrote `**` to `*` and relied on
// bash's `*` crossing `/`, which is correct for `src/**` but wrong for a
// leading `**/test_*.py`, which then required at least one directory
// component. Every positive case here is paired with a negative: the stub
// returns false unconditionally, so an all-positive suite would pass a
// matcher that says yes to everything, and an all-negative suite would pass
// this one today by accident.
// ---------------------------------------------------------------------------

test('globMatch: ** crosses directory separators', () => {
  assert.equal(globMatch('src/**', 'src/pkg/module.py'), true);
});

test('globMatch: ** negative — a sibling tree does not match', () => {
  assert.equal(globMatch('src/**', 'tests/pkg/module.py'), false);
});

test('globMatch: * matches within a single segment', () => {
  assert.equal(globMatch('src/*.py', 'src/a.py'), true);
});

test('globMatch: * negative — a single * does not cross a directory boundary', () => {
  assert.equal(globMatch('src/*.py', 'src/pkg/a.py'), false);
});

test('globMatch: leading **/ matches at ZERO depth (root-level file)', () => {
  assert.equal(globMatch('**/test_*.py', 'test_foo.py'), true);
});

test('globMatch: leading **/ also matches at nested depth', () => {
  assert.equal(globMatch('**/test_*.py', 'a/b/test_foo.py'), true);
});

test('globMatch: leading **/ negative — a non-matching basename at any depth', () => {
  assert.equal(globMatch('**/test_*.py', 'tests/helpers.py'), false);
});

test('globMatch: leading **/ zero depth — idiomatic Go test file', () => {
  // The spec names this the worst case: a root-level main_test.go is
  // idiomatic Go, and the bash matcher missed it, letting Green read it.
  assert.equal(globMatch('**/*_test.go', 'main_test.go'), true);
});

test('globMatch: leading **/ negative — a Go file that is not a _test.go', () => {
  assert.equal(globMatch('**/*_test.go', 'main.go'), false);
});

test('globMatch: non-matching pattern and path entirely unrelated', () => {
  assert.equal(globMatch('src/**', 'README.md'), false);
});

// ---------------------------------------------------------------------------
// matchesAny(filePath, globs): true when ANY glob matches. `globs` must be an
// array of strings — a non-array, or an array containing a non-string, must
// return false ENTIRELY (not "skip the bad entry and check the rest").
// ---------------------------------------------------------------------------

test('matchesAny: matches when any glob in the array matches', () => {
  assert.equal(matchesAny('src/a.py', ['tests/**', 'src/**']), true);
});

test('matchesAny: no match when none of the globs match', () => {
  assert.equal(matchesAny('docs/readme.md', ['tests/**', 'src/**']), false);
});

test('matchesAny: empty array is simply no match', () => {
  assert.equal(matchesAny('src/a.py', []), false);
});

test('matchesAny: a non-array input (string) returns false', () => {
  assert.equal(matchesAny('src/a.py', 'src/**'), false);
});

test('matchesAny: a non-array input (null) returns false', () => {
  assert.equal(matchesAny('src/a.py', null), false);
});

test('matchesAny: a non-array input (undefined) returns false', () => {
  assert.equal(matchesAny('src/a.py', undefined), false);
});

test('matchesAny: a non-array input (plain object) returns false', () => {
  assert.equal(matchesAny('src/a.py', { 0: 'src/**' }), false);
});

test('matchesAny: an array containing a non-string invalidates the WHOLE array, even with a matching glob present', () => {
  // The discriminating spelling: 'src/**' alone would match 'src/a.py'. If
  // the implementation merely skipped the bad element (5) instead of
  // rejecting the array, this would incorrectly return true.
  assert.equal(matchesAny('src/a.py', ['src/**', 5]), false);
});

test('matchesAny: an array containing null invalidates the whole array', () => {
  assert.equal(matchesAny('src/a.py', ['src/**', null]), false);
});

// ---------------------------------------------------------------------------
// pathVerdict role/mode boundaries — structural (no filesystem). Mirrors the
// per-role sections of the retired rules.test.sh, translated to the
// namespace-stripped role spelling.
// ---------------------------------------------------------------------------

test('red may write a test file', () => {
  assertAllow(pathVerdict({ role: RED, mode: 'write', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('red may not write source', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('red may not read source', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'read', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('red may read an unclassified file', () => {
  assertAllow(pathVerdict({ role: RED, mode: 'read', relPath: 'README.md', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('red may read its own tests', () => {
  assertAllow(pathVerdict({ role: RED, mode: 'read', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('green may write source', () => {
  assertAllow(pathVerdict({ role: GREEN, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('green may not write tests', () => {
  assertDeny(pathVerdict({ role: GREEN, mode: 'write', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('green may not read tests', () => {
  assertDeny(pathVerdict({ role: GREEN, mode: 'read', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('green may read source', () => {
  assertAllow(pathVerdict({ role: GREEN, mode: 'read', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('refactor may write source', () => {
  assertAllow(pathVerdict({ role: REFACTOR, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('refactor may not read tests', () => {
  assertDeny(pathVerdict({ role: REFACTOR, mode: 'read', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

// tdd-mutate: same path rules as refactor; the revert discipline (every write
// reverted before handover) is the agent's and the orchestrator's job, not
// the guard's.
test('tdd-mutate may write source', () => {
  assertAllow(pathVerdict({ role: MUTATE, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('tdd-mutate may not write tests', () => {
  assertDeny(pathVerdict({ role: MUTATE, mode: 'write', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('tdd-mutate may not read tests', () => {
  assertDeny(pathVerdict({ role: MUTATE, mode: 'read', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

// ---------------------------------------------------------------------------
// Vocabulary pin — names exactly which role spelling the suite expects.
//
// If a future implementation (or this test file) guesses the wrong bare-role
// spelling, EVERY matrix row above denies with "unknown role" — red, but red
// for a reason that can never turn green, and indistinguishable from an
// ordinary boundary denial by a boolean-only check. This test converts that
// invisible mass-failure mode into one named assertion: every member of
// ROLES, given a well-formed mode/path/globs call, must NOT be denied for the
// same reason as a role the guard genuinely does not recognise.
// ---------------------------------------------------------------------------

test('vocabulary pin: every ROLES member is recognised as a role, not denied like an unknown one', () => {
  const unknown = pathVerdict({ role: 'not-a-real-role', mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  assertDeny(unknown, 'unknown role');

  for (const role of ROLES) {
    // Each role can write SOMETHING under this config: red -> a test file,
    // the other three -> a source file. Use whichever is legal so the call
    // exercises "role recognised" without also depending on "boundary
    // correctly enforced" (that's the sections above).
    const relPath = role === RED ? 'tests/test_a.py' : 'src/a.py';
    const v = pathVerdict({ role, mode: 'write', relPath, testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
    assertVerdictShape(v, `pathVerdict for role ${role}`);
    if (!v.allow) {
      assert.notEqual(
        v.reason,
        unknown.reason,
        `role '${role}' must not be denied for the same reason as an unrecognised role (got "${v.reason}")`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Fail-closed inputs. Every one of these must DENY. Grouped so that the
// "empty config" family and the "ordinary non-match" family are asserted
// DISTINCT from each other — that distinction IS the fail-open this design
// exists to prevent (spec: "Writes are an allowlist; reads are a denylist"),
// and a check that only inspects the allow bit cannot see it.
// ---------------------------------------------------------------------------

test('fail-closed: empty role denies', () => {
  assertDeny(pathVerdict({ role: '', mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('fail-closed: unknown role denies', () => {
  assertDeny(pathVerdict({ role: 'bogus', mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('fail-closed: unknown mode denies', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'delete', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('fail-closed: null relPath denies', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'write', relPath: null, testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

// A null relPath denies on READ too, not merely on write — a deliberate
// departure from the retired bash guard, which left an out-of-root path
// absolute, matched no glob, and (reads being a denylist) PERMITTED it. An
// unresolvable/unplaceable path cannot be classified against the
// test/source/ignore partition the whole read-isolation argument depends on
// being exhaustive; that is the "check cannot be evaluated" case, and this
// design's governing rule is that such a case must not reach allow. See the
// spec's canonicalisation section for the write-up. Compared with
// assertSameVerdict rather than two separate assertDeny calls so this reads
// as ONE property (denies identically regardless of mode), not two
// coincidentally-identical ones — and so the reason is asserted to actually
// NAME the rule, not merely that the call denied.
test('fail-closed: null relPath denies for read too, with the identical reason as write (one property, not two)', () => {
  const writeVerdict = pathVerdict({ role: RED, mode: 'write', relPath: null, testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  const readVerdict = pathVerdict({ role: RED, mode: 'read', relPath: null, testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  assertDeny(writeVerdict, 'null relPath denies a write');
  assertDeny(readVerdict, 'null relPath denies a read');
  assertSameVerdict(writeVerdict, readVerdict, 'a null relPath must be denied identically regardless of mode — the path cannot be classified at all, before mode-specific rules ever run');
});

test('fail-closed: testGlobs that is not an array (string) denies a red write', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'write', relPath: 'tests/test_a.py', testGlobs: 'tests/**', sourceGlobs: SOURCE_GLOBS }));
});

test('fail-closed: testGlobs array containing a non-string denies, even though the string entry would otherwise match', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'write', relPath: 'tests/test_a.py', testGlobs: ['tests/**', 7], sourceGlobs: SOURCE_GLOBS }));
});

test('fail-closed: sourceGlobs as a plain object (not an array) denies a green write', () => {
  assertDeny(pathVerdict({ role: GREEN, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: { 0: 'src/**' } }));
});

// --- the central fail-open this design exists to prevent ---
//
// Empty *source* globs on a *read* must DENY — not "no match, therefore
// allow". Reads are a denylist: if globs.source is incomplete or empty, a
// source file that matches nothing is readable by Red and read isolation
// disappears silently. This is a DIFFERENT failure cause than "the path just
// doesn't happen to match a configured glob", and the two must be
// distinguishable reasons, not merely two denials.
test('fail-open prevention: empty source globs deny a red read, with a reason distinct from an ordinary non-match', () => {
  const emptyConfig = pathVerdict({ role: RED, mode: 'read', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: [] });
  assertDeny(emptyConfig, 'red read with empty source globs');

  const ordinaryMatch = pathVerdict({ role: RED, mode: 'read', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  assertDeny(ordinaryMatch, 'red read of a real source file against a real config');

  assertDistinctReasons(
    [emptyConfig, ordinaryMatch],
    'empty-config deny vs matches-the-denylist deny must name different rules',
  );
});

test('fail-open prevention: MISSING (undefined) source globs deny a red read identically to an explicit []', () => {
  const missing = pathVerdict({ role: RED, mode: 'read', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: undefined });
  const explicitNull = pathVerdict({ role: RED, mode: 'read', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: null });
  assertDeny(missing, 'red read with sourceGlobs undefined (key absent from config)');
  assertDeny(explicitNull, 'red read with sourceGlobs explicitly null');
});

test('fail-open prevention: empty test globs deny a green read (green may not read tests)', () => {
  const emptyConfig = pathVerdict({ role: GREEN, mode: 'read', relPath: 'tests/test_a.py', testGlobs: [], sourceGlobs: SOURCE_GLOBS });
  assertDeny(emptyConfig, 'green read with empty test globs');

  const ordinaryMatch = pathVerdict({ role: GREEN, mode: 'read', relPath: 'tests/test_a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  assertDeny(ordinaryMatch, 'green read of a real test file against a real config');

  assertDistinctReasons(
    [emptyConfig, ordinaryMatch],
    'empty-config deny vs matches-the-denylist deny must name different rules (green read)',
  );
});

test('fail-open prevention: empty test globs deny a red WRITE (allowlist collapses to nothing, not to everything)', () => {
  assertDeny(pathVerdict({ role: RED, mode: 'write', relPath: 'tests/test_a.py', testGlobs: [], sourceGlobs: SOURCE_GLOBS }));
});

test('fail-open prevention: empty source globs deny a green WRITE (allowlist collapses to nothing)', () => {
  assertDeny(pathVerdict({ role: GREEN, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: [] }));
});

test('structural denies (unknown role, unknown mode) are distinguishable from each other', () => {
  const unknownRole = pathVerdict({ role: 'bogus', mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  const unknownMode = pathVerdict({ role: RED, mode: 'delete', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  const nullPath = pathVerdict({ role: RED, mode: 'write', relPath: null, testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS });
  assertDistinctReasons(
    [unknownRole, unknownMode, nullPath],
    'unknown role, unknown mode, and null relPath are three different reasons a call cannot be evaluated',
  );
});

// ---------------------------------------------------------------------------
// Case-fold asymmetry (spec: "Paths are canonicalised before matching" /
// "Fold case only in the direction that fails closed").
//
// A READ matches the denylist against the literal path OR its case-folded
// form, and either match denies. A WRITE matches the allowlist on the
// literal path ONLY — folding a write would permit MORE, which is fail-open
// for an allowlist. Tested here directly against pathVerdict with a
// wrong-case relPath string, independent of the filesystem: this property is
// pathVerdict's own contract (its JSDoc: "folding widens the match, which is
// fail-closed for a denylist and fail-OPEN for an allowlist"), not a
// filesystem behaviour — the on-disk case-insensitive-vs-sensitive nuance is
// covered separately in tests/paths.test.mjs.
// ---------------------------------------------------------------------------

test('case-fold: a wrong-case READ still denies (denylist widened by folding)', () => {
  // 'SRC/a.py' does not literally match 'src/**', but its case-folded form
  // ('src/a.py') does — and for a read, either match must deny.
  assertDeny(pathVerdict({ role: RED, mode: 'read', relPath: 'SRC/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('case-fold: a wrong-case READ of an uppercase test file still denies for green', () => {
  assertDeny(pathVerdict({ role: GREEN, mode: 'read', relPath: 'TESTS/TEST_A.PY', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('case-fold: a wrong-case WRITE is DENIED, not folded into an allow (allowlist must not widen)', () => {
  // 'SRC/a.py' case-folds to something 'src/**' would match, but a write
  // matches the allowlist on the LITERAL path only. Folding here would
  // permit more than the config actually authorised — the exact asymmetry
  // the spec calls out as "a false denial ... loud and safe" being the
  // correct, deliberate outcome.
  assertDeny(pathVerdict({ role: GREEN, mode: 'write', relPath: 'SRC/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('case-fold: a wrong-case WRITE of a test file is DENIED for red too, against a directory-anchored glob', () => {
  // The shared TEST_GLOBS cannot demonstrate this property: its second entry,
  // '**/test_*.py', is DIRECTORY-AGNOSTIC by construction — a leading '**/'
  // consumes whatever segment precedes the basename, including 'TESTS',
  // without regard to case, because there is no literal character in '**' to
  // be case-sensitive about. 'TESTS/test_a.py' therefore matches
  // '**/test_*.py' LITERALLY, with no folding involved at all, and the
  // config genuinely authorises that write — asserting DENY against
  // TEST_GLOBS would pin a false property, not a folding bug (ruled: the
  // TEST_GLOBS-based version of this test was wrong, not the implementation;
  // bash's tdd_glob_match has the identical directory-agnostic behaviour).
  //
  // A DIRECTORY-ANCHORED glob (tests/**-shaped, no leading **/) is what
  // actually exercises "the allowlist matches the literal path only": the
  // wrong-case 'TESTS' segment fails a literal 'tests/**' match, so the
  // write must stay denied rather than being folded into an allow — the
  // same asymmetry the 'SRC/a.py' sibling test above pins for green/source.
  const DIRECTORY_ANCHORED_TEST_GLOBS = ['tests/**'];
  assertDeny(pathVerdict({ role: RED, mode: 'write', relPath: 'TESTS/test_a.py', testGlobs: DIRECTORY_ANCHORED_TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

test('case-fold: literal-case WRITE still allows (sanity baseline — folding is additive for reads only, not a break of the ordinary case)', () => {
  assertAllow(pathVerdict({ role: GREEN, mode: 'write', relPath: 'src/a.py', testGlobs: TEST_GLOBS, sourceGlobs: SOURCE_GLOBS }));
});

// ---------------------------------------------------------------------------
// Bash allowlist: bashVerdict(command, template)
// ---------------------------------------------------------------------------

const T_SINGLE = 'pytest -q {testId}';
const T_FULL = 'pytest -q';
const T_COV = 'pytest -q --cov --cov-report=json:.tdd/coverage.json';

test('bash: substituted test id is allowed', () => {
  assertAllow(bashVerdict('pytest -q tests/test_a.py::test_x', T_SINGLE));
});

test('bash: exact template match is allowed', () => {
  assertAllow(bashVerdict('pytest -q', T_FULL));
});

test('bash: template containing a colon path is allowed verbatim', () => {
  assertAllow(bashVerdict(T_COV, T_COV));
});

test('bash: unrelated command is denied', () => {
  assertDeny(bashVerdict('rm -rf src', T_FULL));
});

test('bash: unrelated command and a delta-metacharacter denial are different reasons', () => {
  const unrelated = bashVerdict('rm -rf src', T_FULL);
  const metachar = bashVerdict('pytest -q; rm -rf src', T_FULL);
  assertDeny(unrelated);
  assertDeny(metachar);
  assertDistinctReasons([unrelated, metachar], 'prefix mismatch vs metacharacter-in-delta are different rules');
});

// Every banned metacharacter, individually — the spec (iteration 2) explicitly
// widened this list to add `&`, `<` and a literal newline, each of which the
// bash implementation banned but an earlier spec draft omitted.
const METACHARS = [
  [';', 'pytest -q; rm -rf src'],
  ['|', 'pytest -q | tee out.txt'],
  ['&&', 'pytest -q && rm -rf src'],
  ['&', 'pytest -q & rm -rf src'],
  ['>', 'pytest -q > out.txt'],
  ['<', 'pytest -q < /etc/passwd'],
  ['`', 'pytest -q `whoami`'],
  ['$(', 'pytest -q $(whoami)'],
  ['newline', 'pytest -q\nrm -rf src'],
];

for (const [name, cmd] of METACHARS) {
  test(`bash: '${name}' in the delta is denied`, () => {
    assertDeny(bashVerdict(cmd, T_FULL));
  });
}

// Spec: "The delta check must also reject traversal (iteration 2)" — defence
// in depth behind the orchestrator-side testId validation (plan Task 13,
// I4). This delta-level check (bashVerdict's own '..' rejection) landed in
// Task 3 and is what this test pins directly. The orchestrator-side testId
// validation it backs up landed later, in Task 13 (SKILL.md's Red section);
// tests/skill-consistency.test.mjs pins that prose AND re-checks this same
// rules.mjs rejection from the I4 side (see its "still rejects '..' in the
// Bash delta as defence in depth" test).
test('bash: .. traversal in the delta is denied', () => {
  assertDeny(bashVerdict('pytest -q ../../etc/passwd', T_SINGLE));
});

test('bash: in-place edit via bash is denied (unrelated command)', () => {
  assertDeny(bashVerdict('sed -i s/a/b/ src/a.py', T_SINGLE));
});

test('bash: empty template denies', () => {
  assertDeny(bashVerdict('pytest -q', ''));
});

// --- REGRESSION: a template with no static prefix must not wave everything
// through. An empty prefix makes the prefix test match any string, leaving
// only the metacharacter ban — so an arbitrary clean-looking command would
// be permitted.
test('bash: whitespace-only template denies rather than allowing any clean command', () => {
  assertDeny(bashVerdict('cp -r /etc /tmp/exfil', '   '));
});

test('bash: placeholder-only template denies', () => {
  assertDeny(bashVerdict('rm -rf /tmp/pwned', '{cmd}'));
});

test('bash: template starting with a placeholder denies', () => {
  assertDeny(bashVerdict('anything at all', '{a} {b}'));
});

test('bash: an empty-prefix denial and an ordinary metacharacter denial name different rules', () => {
  const emptyPrefix = bashVerdict('cp -r /etc /tmp/exfil', '   ');
  const metachar = bashVerdict('pytest -q; rm -rf src', T_FULL);
  assertDistinctReasons([emptyPrefix, metachar], 'an unconstrainable template is a different failure than a constrained one being violated');
});

test('bash: trailing tab before the placeholder is trimmed from the static prefix', () => {
  assertAllow(bashVerdict('pytest -q tests/t.py::x', 'pytest -q\t{testId}'));
});

// --- REGRESSION: characters in the agent-supplied portion are DATA, not a
// pattern. Pytest parametrized node ids routinely contain `[` and `-k`
// expressions routinely contain `*`; neither is a shell metacharacter and
// neither may be mistaken for a matching pattern.
test('bash: glob characters in a parametrized test id are data, not a pattern', () => {
  assertAllow(bashVerdict('pytest -q tests/test_a.py::test_x[case-1]', T_SINGLE));
});

test('bash: glob characters after the prefix are literal data, not a pattern', () => {
  assertAllow(bashVerdict('pytest -q -k test_*', T_FULL));
});

// --- REGRESSION: a missing (undefined) template argument must deny, not
// throw. A caller bug must degrade to deny, never to an exception that (per
// the exit-2-only semantics) permits the tool call.
test('bash: missing template argument denies rather than throwing', () => {
  assert.doesNotThrow(() => bashVerdict('pytest -q', undefined));
  assertDeny(bashVerdict('pytest -q', undefined));
});

test('bash: missing command argument denies rather than throwing', () => {
  assert.doesNotThrow(() => bashVerdict(undefined, T_FULL));
  assertDeny(bashVerdict(undefined, T_FULL));
});

// ---------------------------------------------------------------------------
// Node floor: runtimeSupported(version) — a FLOOR test, never equality. The
// host chooses the interpreter; a newer major is correct, not an error.
// Expressed via the exported NODE_FLOOR rather than a hardcoded 22, so this
// file tracks rules.mjs's own stated floor instead of asserting a second,
// independently-typed copy of it.
// ---------------------------------------------------------------------------

test(`runtimeSupported: v${NODE_FLOOR}.0.0 (exactly the floor) passes`, () => {
  assert.equal(runtimeSupported(`v${NODE_FLOOR}.0.0`), true);
});

test(`runtimeSupported: v${NODE_FLOOR}.23.2 (a real patch on the floor major) passes`, () => {
  assert.equal(runtimeSupported(`v${NODE_FLOOR}.23.2`), true);
});

test(`runtimeSupported: v${NODE_FLOOR + 4}.0.0 (a newer major) passes — newer is correct, not an error`, () => {
  assert.equal(runtimeSupported(`v${NODE_FLOOR + 4}.0.0`), true);
});

test(`runtimeSupported: v${NODE_FLOOR - 2}.11.0 (below the floor) fails`, () => {
  assert.equal(runtimeSupported(`v${NODE_FLOOR - 2}.11.0`), false);
});

test(`runtimeSupported: v${NODE_FLOOR - 1}.99.99 (one major below the floor, high patch) still fails — the floor is on the major only`, () => {
  assert.equal(runtimeSupported(`v${NODE_FLOOR - 1}.99.99`), false);
});

test('runtimeSupported: garbage input fails rather than throwing', () => {
  assert.doesNotThrow(() => runtimeSupported('garbage'));
  assert.equal(runtimeSupported('garbage'), false);
});

test('runtimeSupported: empty string fails rather than throwing', () => {
  assert.doesNotThrow(() => runtimeSupported(''));
  assert.equal(runtimeSupported(''), false);
});
