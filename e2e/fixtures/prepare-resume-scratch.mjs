#!/usr/bin/env node
// @ts-check
/**
 * Builds a scratch git worktree whose e2e/ fixture matches the INTERRUPTED
 * state `checklist-resume-seed.json` (sibling file) describes: add() is
 * implemented and committed, subtract()'s test exists but subtract() has not
 * been written yet (item 2: status "red"), and divide() has neither test nor
 * implementation (item 3: status "pending").
 *
 * A human then points a live Claude Code session at that worktree and runs
 * `/tdd e2e/spec.md`, to exercise the actual resume branch in `## Decompose`
 * of skills/run-tdd-cycle/SKILL.md (Task 6) -- a subagent cannot dispatch
 * subagents, so this script only does the mechanical setup. See AGENTS.md's
 * "Running the plugin against itself" section for the full procedure,
 * including how to compare the result with checklist-invariants.mjs.
 *
 * Also imported by e2e/smoke.mjs to headlessly verify the scratch this
 * produces is well-formed -- clean tree, subtract genuinely red, divide
 * genuinely untested -- before any human spends a live session on it.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SEED_PATH = path.join(HERE, 'checklist-resume-seed.json');

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * @param {string} [targetDir] defaults to a fresh mkdtemp directory
 * @returns {{ scratchDir: string, cleanup: () => void }}
 */
export function prepareResumeScratch(targetDir) {
  const dir = targetDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-resume-scratch-'));

  // A linked worktree at HEAD, detached so it never contends with whatever
  // branch the main working tree has checked out. Only tracked files come
  // across -- .tdd/config.json and .tdd/checklist.json are gitignored, so
  // the worktree starts with neither, matching a fresh clone.
  git(['worktree', 'add', '--detach', '--quiet', dir, 'HEAD'], REPO_ROOT);

  const calcPath = path.join(dir, 'e2e', 'src', 'calc', '__init__.py');
  fs.writeFileSync(calcPath, 'def add(a, b):\n    return a + b\n');

  const dividePath = path.join(dir, 'e2e', 'tests', 'test_divide.py');
  fs.rmSync(dividePath, { force: true });

  git(['add', '-A'], dir);
  git(
    [
      'commit',
      '-q',
      '-m',
      'scratch: roll back e2e/ to the interrupted state checklist-resume-seed.json describes (local resume test only)',
    ],
    dir,
  );

  fs.mkdirSync(path.join(dir, '.tdd'), { recursive: true });
  fs.copyFileSync(SEED_PATH, path.join(dir, '.tdd', 'checklist.json'));

  const cleanup = () => {
    try {
      git(['worktree', 'remove', '--force', dir], REPO_ROOT);
    } finally {
      // Deliberately NOT `git worktree prune`: `remove --force` above already
      // deregisters *this* worktree, and `prune` sweeps every worktree entry
      // whose directory is currently unreachable -- including a developer's
      // own unrelated worktree if its volume happens to be unmounted at this
      // moment. This script must never touch state it did not create in the
      // real repository's .git.
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  return { scratchDir: dir, cleanup };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  const { scratchDir } = prepareResumeScratch(target);
  const invariantsPath = path.join(REPO_ROOT, 'e2e', 'lib', 'checklist-invariants.mjs');
  const resultPath = path.join(scratchDir, '.tdd', 'checklist.json');
  console.log(scratchDir);
  console.log('');
  console.log('Scratch worktree ready. Next, in a live Claude Code session:');
  console.log(`  1. cd ${scratchDir}`);
  console.log('  2. Confirm .tdd/config.json exists (run /tdd-init if not -- it is gitignored, so a fresh worktree never has one).');
  console.log('  3. Run: /tdd e2e/spec.md');
  console.log('  4. After it resumes and advances at least one item, compare:');
  console.log(`     node ${invariantsPath} ${SEED_PATH} ${resultPath}`);
  console.log(`  5. Remove the worktree when done: git -C ${REPO_ROOT} worktree remove --force ${scratchDir}`);
}
