#!/usr/bin/env node
// @ts-check
/**
 * Structural invariants a resumed `checklist.json` must satisfy relative to
 * the state it resumed from (Task 6: `## Decompose` in
 * `skills/run-tdd-cycle/SKILL.md` loads the file on a resume rather than
 * overwriting it).
 *
 * This checks SHAPE, not whether the workflow's decisions were correct. It
 * cannot know whether Green *should* have landed by the time you compare —
 * only that whatever did happen did not silently discard what a resume must
 * preserve: terminal items' status and recorded fields, `knownRed`, and
 * `mutationRoundsRun` never regressing.
 *
 * Used two ways:
 *   1. Headlessly, from `e2e/smoke.mjs` — bite-checked against a fabricated
 *      "Decompose overwrote the file" reconstruction, which is exactly the
 *      pre-Task-6 bug, and against a legitimately advanced checklist, which
 *      must pass.
 *   2. By a human after a REAL live resume, as a CLI:
 *
 *          node e2e/lib/checklist-invariants.mjs <seed.json> <result.json>
 *
 *      See AGENTS.md's "Running the plugin against itself" section and
 *      `e2e/fixtures/prepare-resume-scratch.mjs` for how to produce both
 *      files from an actual `/tdd` resume.
 */

/**
 * @typedef {{ id: number|string, behavior?: string, status: string, testId?: string|null, [k: string]: any }} ChecklistItem
 * @typedef {{ spec?: string, knownRed?: string[], mutationRoundsRun?: number, items?: ChecklistItem[] }} Checklist
 */

const TERMINAL_STATUSES = new Set(['done', 'redundant', 'blocked']);

// Legitimate progress only ever moves an item forward through this order.
// `done`, `redundant`, and `blocked` share a rank because they are mutually
// exclusive terminal outcomes, not a sequence -- which of the three seed
// landed on must still match exactly (checked separately, below); this rank
// only catches a terminal item sliding back to a non-terminal one, or a
// non-terminal item sliding backward (e.g. "red" reverting to "pending",
// which a fresh Decompose does to every item).
const STATUS_RANK = { pending: 0, red: 1, green: 2, done: 3, redundant: 3, blocked: 3 };

/**
 * @param {Checklist} seed the checklist as it existed before the resumed run
 * @param {Checklist} result the checklist after the resumed run touched it
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkResumePreserved(seed, result) {
  const violations = [];

  if (!seed || typeof seed !== 'object') {
    return { ok: false, violations: ['seed is not a checklist object'] };
  }
  if (!result || typeof result !== 'object') {
    return { ok: false, violations: ['result is not a checklist object'] };
  }

  if (seed.spec !== undefined && result.spec !== seed.spec) {
    violations.push(`spec changed: seed="${seed.spec}" result="${result.spec}"`);
  }

  const seedKnownRed = Array.isArray(seed.knownRed) ? seed.knownRed : [];
  const resultKnownRed = Array.isArray(result.knownRed) ? result.knownRed : [];
  for (const id of seedKnownRed) {
    if (!resultKnownRed.includes(id)) {
      violations.push(`knownRed dropped an entry a resume must preserve: "${id}"`);
    }
  }

  const seedRounds = typeof seed.mutationRoundsRun === 'number' ? seed.mutationRoundsRun : 0;
  const resultRounds = result.mutationRoundsRun;
  if (typeof resultRounds !== 'number') {
    violations.push(`mutationRoundsRun is missing or not a number in the result (got ${JSON.stringify(resultRounds)})`);
  } else if (resultRounds < seedRounds) {
    violations.push(`mutationRoundsRun regressed: seed=${seedRounds} result=${resultRounds}`);
  }

  const seedItems = Array.isArray(seed.items) ? seed.items : [];
  const resultItems = Array.isArray(result.items) ? result.items : [];
  if (resultItems.length < seedItems.length) {
    violations.push(`item count shrank: seed had ${seedItems.length}, result has ${resultItems.length}`);
  }

  const resultById = new Map(resultItems.map((it) => [it.id, it]));
  for (const seedItem of seedItems) {
    const found = resultById.get(seedItem.id);
    if (!found) {
      violations.push(`item ${seedItem.id} ("${seedItem.behavior ?? ''}") is missing from the result`);
      continue;
    }

    const seedRank = STATUS_RANK[seedItem.status];
    const foundRank = STATUS_RANK[found.status];
    if (foundRank === undefined) {
      violations.push(`item ${seedItem.id}: result has an unrecognised status "${found.status}"`);
    } else if (seedRank !== undefined && foundRank < seedRank) {
      violations.push(`item ${seedItem.id}: status regressed from "${seedItem.status}" to "${found.status}"`);
    }

    if (TERMINAL_STATUSES.has(seedItem.status)) {
      // A terminal item (done/redundant/blocked) is finished work. A resume
      // must load it unchanged -- only an unconditional Decompose rewrite
      // would touch it, and that is exactly the bug Task 6 fixed. The rank
      // check above only confirms it didn't slide back to non-terminal; the
      // three terminal outcomes are mutually exclusive, so an exact match is
      // still required here.
      if (found.status !== seedItem.status) {
        violations.push(`item ${seedItem.id}: terminal status "${seedItem.status}" was overwritten with "${found.status}"`);
      }
      if ((found.testId ?? null) !== (seedItem.testId ?? null)) {
        violations.push(
          `item ${seedItem.id}: testId changed on a terminal item (seed=${JSON.stringify(seedItem.testId ?? null)}, result=${JSON.stringify(found.testId ?? null)})`,
        );
      }
    } else if (seedItem.testId) {
      // A non-terminal item (pending/red/green) that already recorded a
      // testId must never regress back to null -- that is the fingerprint of
      // a fresh Decompose, which always initialises testId to null.
      if (!found.testId) {
        violations.push(`item ${seedItem.id}: testId "${seedItem.testId}" was cleared (result has no testId)`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [seedPath, resultPath] = process.argv.slice(2);
  if (!seedPath || !resultPath) {
    console.error('usage: node checklist-invariants.mjs <seed.json> <result.json>');
    process.exit(2);
  }
  const fs = await import('node:fs');
  /** @type {Checklist} */
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  /** @type {Checklist} */
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const verdict = checkResumePreserved(seed, result);
  if (verdict.ok) {
    console.log('resume preserved: OK');
    process.exit(0);
  } else {
    console.error('resume preserved: FAILED');
    for (const v of verdict.violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}
