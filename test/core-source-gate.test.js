'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const GATE = path.resolve(__dirname, '..', 'scripts', 'check-core-source.sh');

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

// The layout the gate checks: package sources under kettle/, and the packaging
// recipe this shell consumes from core instead of keeping its own copy.
function makeCore(root) {
  fs.mkdirSync(path.join(root, 'kettle', 'static'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packaging'), { recursive: true });
  fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project]\nname="kettle"\nversion="0.2.0"\n');
  fs.writeFileSync(path.join(root, 'kettle', 'kettle_contract.py'), 'API_VERSION=0\nDESK_SCHEMA_VERSION=0\n');
  fs.writeFileSync(path.join(root, 'kettle', 'static', 'index.html'), '<!doctype html>\n');
  fs.writeFileSync(path.join(root, 'packaging', 'kettle.spec'), '# fixture spec\n');
  fs.writeFileSync(path.join(root, 'packaging', 'entry.py'), 'from kettle.kettle_main import main\n');
}

function runGate(source, env = {}) {
  return spawnSync('bash', [GATE, source], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('accepts only a clean, versioned core by default', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kettle-core-gate-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  makeCore(tmp);
  git(tmp, ['init', '-q']);
  git(tmp, ['add', '.']);
  git(tmp, ['-c', 'user.name=Kettle Test', '-c', 'user.email=test@example.invalid',
    'commit', '-qm', 'fixture']);

  const clean = runGate(tmp);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /^[0-9a-f]{12}\tfalse\t/);

  fs.appendFileSync(path.join(tmp, 'kettle', 'static', 'index.html'), '<!-- dirty -->\n');
  const dirty = runGate(tmp);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stderr, /refusing to bundle an unverified kettle-core tree/);
});

test('keeps the unverified override local-only', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kettle-core-override-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  makeCore(tmp);

  const local = runGate(tmp, { KETTLE_ALLOW_UNVERIFIED_CORE: '1', CI: '' });
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /local-only override/);

  const release = runGate(tmp, {
    KETTLE_ALLOW_UNVERIFIED_CORE: '1',
    KETTLE_RELEASE_BUILD: '1',
    CI: '',
  });
  assert.notEqual(release.status, 0);
  assert.match(release.stderr, /cannot bypass a release\/CI gate/);

  const ci = runGate(tmp, {
    KETTLE_ALLOW_UNVERIFIED_CORE: '1',
    CI: 'true',
  });
  assert.notEqual(ci.status, 0);
  assert.match(ci.stderr, /cannot bypass a release\/CI gate/);
});
