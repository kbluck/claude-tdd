// Pins the resolution rule Claude Code documents for plugin versioning:
// `plugin.json`'s `version` always wins over a `version` set on the same
// plugin's marketplace entry, silently — a stale value in the entry never
// surfaces as a warning, it is simply ignored. Task 11 (README and
// packaging) found `version` duplicated in both `.claude-plugin/plugin.json`
// and `.claude-plugin/marketplace.json`, which is exactly the shape that
// invites the two to drift with nothing to notice: the marketplace copy can
// go stale forever without any effect on what actually installs, because it
// is never read while plugin.json declares one.
//
// The fix applied is not "keep both in sync" (a second copy to maintain) but
// "delete the redundant one" (nothing left to sync). `plugin.json.version`
// becomes the single source of truth, and this file's job is to keep it that
// way: assert plugin.json still declares a non-empty version (the fact that
// makes deleting the marketplace copy safe in the first place), and assert
// no entry in marketplace.json's `plugins` array re-introduces a competing
// `version` field.
//
// JSON is parsed inside each test body, not cached at module scope — see
// config-contract.test.mjs's comment on parseSpecBlock for why: a throw
// during collection can report zero failures, which is exactly the kind of
// green-means-nothing result this project does not tolerate.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

const PLUGIN_JSON_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');

function readPluginJson() {
  return JSON.parse(fs.readFileSync(PLUGIN_JSON_PATH, 'utf8'));
}

function readMarketplaceJson() {
  return JSON.parse(fs.readFileSync(MARKETPLACE_JSON_PATH, 'utf8'));
}

test('plugin.json declares a non-empty version — the fact that makes it safe to have no version elsewhere', () => {
  const pluginJson = readPluginJson();
  assert.equal(typeof pluginJson.version, 'string', 'plugin.json must declare version as a string');
  assert.notEqual(pluginJson.version.trim(), '', 'plugin.json.version must not be empty — an empty or missing value would fall through to the marketplace entry or the git SHA, and the reasoning below no longer holds');
});

test('marketplace.json plugins array is non-empty — a loop over zero entries would assert nothing below', () => {
  const marketplaceJson = readMarketplaceJson();
  assert.ok(Array.isArray(marketplaceJson.plugins), 'marketplace.json must declare a plugins array');
  assert.ok(marketplaceJson.plugins.length > 0, 'marketplace.json must declare at least one plugin entry');
});

test('no entry in marketplace.json declares a competing version field', () => {
  const marketplaceJson = readMarketplaceJson();
  const entriesWithVersion = marketplaceJson.plugins
    .map((entry, index) => ({ index, name: entry && entry.name }))
    .filter((_, index) => Object.prototype.hasOwnProperty.call(marketplaceJson.plugins[index] ?? {}, 'version'));
  assert.deepEqual(
    entriesWithVersion,
    [],
    `marketplace.json plugin entr(y/ies) declare a version field: ${JSON.stringify(entriesWithVersion)} — ` +
      'plugin.json.version always wins silently when both are set (per Claude Code\'s documented resolution order), ' +
      'so a duplicate here is dead weight that can drift from plugin.json with no effect and no warning; delete it ' +
      'rather than keep both in sync',
  );
});
