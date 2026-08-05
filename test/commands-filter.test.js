'use strict';

/**
 * Unit-test the command filter logic without a browser DOM.
 * Mirrors app/commands.js filterCommands (kept in sync by intentional copy).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'commands.js'),
  'utf8'
);
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { filterCommands, buildCatalog } = sandbox.window.KettleCommands;

test('buildCatalog exposes backend-facing commands', () => {
  const cat = buildCatalog();
  const ids = new Set(cat.map((c) => c.id));
  for (const need of [
    'ping',
    'refreshQueue',
    'registerProject',
    'sweep',
    'refreshBriefs',
    'compactSession',
    'clearSession',
    'beginFounding',
    'proposeFounding',
    'foundDesk',
    'approve',
    'comment',
  ]) {
    assert.ok(ids.has(need), `missing command ${need}`);
  }
});

test('filterCommands matches title tokens', () => {
  const items = buildCatalog();
  const hits = filterCommands(items, 'refresh brief');
  assert.ok(hits.some((c) => c.id === 'refreshBriefs'));
  assert.ok(!hits.some((c) => c.id === 'ping'));
});

test('filterCommands matches keywords', () => {
  const items = buildCatalog();
  const hits = filterCommands(items, 'doctor');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'ping');
});

test('empty query returns all', () => {
  const items = buildCatalog();
  assert.equal(filterCommands(items, '').length, items.length);
  assert.equal(filterCommands(items, '   ').length, items.length);
});
