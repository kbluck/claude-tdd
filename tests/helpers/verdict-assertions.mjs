// Shared assertion helpers for Verdict objects ({ allow: boolean, reason: string }),
// used by both rules.test.mjs and paths.test.mjs.
//
// Why this exists: the brief and AGENTS.md both call out the same defect class —
// "nearly every deny assertion checked a boolean, so a mutation that denied for
// the wrong reason passed." A helper that ONLY compares `.allow` invites exactly
// that mistake by making the shallow check the path of least resistance. These
// helpers make the deeper check (which rule fired) as easy to write as the
// shallow one.
//
// None of these depend on the WORDING of any reason string produced by
// hooks/lib/rules.mjs — rules.mjs is not yet implemented, so its message text is
// unknown. They only depend on the *relations* the Verdict typedef itself states:
// allow <=> reason === ''; two verdicts are "the same rule" iff both fields match;
// two verdicts are "different rules" iff their reasons differ.

import assert from 'node:assert/strict';

/**
 * Assert a value has the Verdict shape and honours the typedef's own invariant:
 * `reason` is empty when `allow` is true, and non-empty otherwise.
 * @param {{allow: unknown, reason: unknown}} v
 * @param {string} [label]
 */
export function assertVerdictShape(v, label = 'verdict') {
  assert.equal(typeof v?.allow, 'boolean', `${label}: .allow must be a boolean, got ${JSON.stringify(v)}`);
  assert.equal(typeof v?.reason, 'string', `${label}: .reason must be a string, got ${JSON.stringify(v)}`);
  if (v.allow) {
    assert.equal(v.reason, '', `${label}: allow===true must carry an empty reason`);
  } else {
    assert.notEqual(v.reason, '', `${label}: allow===false must name a reason (a thrown error and a considered denial are different outcomes)`);
  }
}

/**
 * Assert `v` is an ALLOW verdict (and therefore carries the empty reason).
 * @param {{allow: unknown, reason: unknown}} v
 * @param {string} [label]
 */
export function assertAllow(v, label = 'verdict') {
  assertVerdictShape(v, label);
  assert.equal(v.allow, true, `${label}: expected allow, got deny: ${v.reason}`);
}

/**
 * Assert `v` is a DENY verdict (and therefore carries a non-empty reason).
 * @param {{allow: unknown, reason: unknown}} v
 * @param {string} [label]
 */
export function assertDeny(v, label = 'verdict') {
  assertVerdictShape(v, label);
  assert.equal(v.allow, false, `${label}: expected deny, got allow`);
}

/**
 * Assert two verdicts are THE SAME RULE: identical allow bit AND identical
 * reason text. Used by the spelling matrix — every spelling of one canonical
 * target must produce not merely "also a deny" but the *same* deny.
 * @param {{allow: unknown, reason: unknown}} a
 * @param {{allow: unknown, reason: unknown}} b
 * @param {string} label
 */
export function assertSameVerdict(a, b, label) {
  assertVerdictShape(a, `${label} (a)`);
  assertVerdictShape(b, `${label} (b)`);
  assert.equal(a.allow, b.allow, `${label}: allow bit differs (a=${a.allow} reason="${a.reason}"; b=${b.allow} reason="${b.reason}")`);
  assert.equal(a.reason, b.reason, `${label}: same allow bit but different reason — denied for a different rule (a="${a.reason}"; b="${b.reason}")`);
}

/**
 * Assert every deny verdict in `verdicts` names a DIFFERENT rule (pairwise
 * distinct reason text). Allow verdicts are ignored — they legitimately share
 * the empty reason and that is not a collision.
 *
 * Use this to pin "empty config fails closed for a reason distinct from an
 * ordinary non-match" and "an unknown role/mode fails closed for a reason
 * distinct from a recognised one being denied" — properties a boolean-only
 * check cannot see.
 * @param {Array<{allow: unknown, reason: unknown}>} verdicts
 * @param {string} label
 */
export function assertDistinctReasons(verdicts, label) {
  const denies = verdicts.filter((v) => {
    assertVerdictShape(v, label);
    return v.allow === false;
  });
  const reasons = denies.map((v) => v.reason);
  const uniqueCount = new Set(reasons).size;
  assert.equal(
    uniqueCount,
    reasons.length,
    `${label}: expected ${reasons.length} distinguishable deny reasons, saw ${uniqueCount} — ` +
      `two different failure causes produced the same message: ${JSON.stringify(reasons)}`,
  );
}
