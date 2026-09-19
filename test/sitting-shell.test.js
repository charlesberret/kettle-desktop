'use strict';

/**
 * Desktop is a thin host. The product sitting is core static/index.html served
 * by the sidecar. A second in-app sitting (legacy/v2-scaffold) must not return.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');

test('loads the sidecar sitting, not a local app/ fork', () => {
  assert.match(
    main,
    /loadURL\(`http:\/\/127\.0\.0\.1:\$\{serverPort\}\/\?ui=/,
    'window must load core static/index.html from the sidecar'
  );
  assert.doesNotMatch(
    main,
    /loadFile\(path\.join\(__dirname,\s*'app',\s*'index\.html'\)\)/,
    'must not load a desktop-owned sitting'
  );
});

test('injects desktop-shell so the sitting gets titlebar insets', () => {
  assert.match(main, /classList\.add\('desktop-shell'\)/);
  assert.match(main, /pywebviewready/);
});

test('preload still exposes the native folder picker the sitting calls', () => {
  assert.match(preload, /pick_folder/);
  assert.match(preload, /pywebview/);
});
