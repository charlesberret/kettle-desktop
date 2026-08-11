'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'app', 'index.html');
const mainPath = path.join(root, 'main.js');
const apiPath = path.join(root, 'app', 'api.js');
const appPath = path.join(root, 'app', 'app.js');
const preloadPath = path.join(root, 'preload.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const main = fs.readFileSync(mainPath, 'utf8');
const api = fs.readFileSync(apiPath, 'utf8');
const appJs = fs.readFileSync(appPath, 'utf8');
const preload = fs.readFileSync(preloadPath, 'utf8');

test('sitting chrome is plugin-shaped: queue · editor · desk', () => {
  assert.match(html, /name="kettle-desktop-ui" content="v2-sitting"/);
  assert.match(html, /data-sitting="queue-editor-desk"/);
  assert.match(html, /id="queuePane"/);
  assert.match(html, /id="editorPane"/);
  assert.match(html, /id="deskPane"/);
  assert.match(html, /aria-label="Ritual"/);
  // Ritual order must match plugin: Approve · Comment · Sweep
  const ritual = html.match(
    /aria-label="Ritual"[\s\S]*?<\/div>/,
  );
  assert.ok(ritual, 'ritual toolbar missing');
  const ids = [...ritual[0].matchAll(/id="(btnApprove|btnComment|btnSweep)"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(ids, ['btnApprove', 'btnComment', 'btnSweep']);
});

test('loads local app sitting + shared ritual parity — not core static shell', () => {
  assert.match(main, /loadFile\(path\.join\(__dirname,\s*'app',\s*'index\.html'\)\)/);
  assert.doesNotMatch(main, /loadURL\([^)]*static\/index\.html/);
  assert.doesNotMatch(html, /static\/index\.html/);
  assert.match(html, /src="\.\.\/lib\/ritual-parity\.js"/);
  assert.match(preload, /never loads core static\/index\.html/);
  // file:// sitting ⇒ Origin: null + CORS preflight; boot surfaces core skew clearly
  assert.match(appJs, /Origin: null/);
  assert.match(appJs, /getCoreToken/);
});

test('API client registers projects with root (core contract)', () => {
  assert.match(api, /function addProjectBody/);
  assert.match(api, /root:\s*opts\.root\s*\|\|\s*opts\.path/);
  assert.match(api, /jpost\("\/api\/projects\/add"/);
  assert.match(api, /\/api\/found/);
  assert.match(api, /\/api\/interview/);
  assert.match(api, /\/api\/propose/);
  assert.match(api, /\/api\/refresh-briefs/);
  // Must not send a bare path-only add body as the primary field.
  assert.doesNotMatch(api, /jpost\("\/api\/projects\/add",\s*body\)/);
});

test('sitting app wires Found Desk and interview chat mode', () => {
  assert.match(appJs, /approveOrFound/);
  assert.match(appJs, /KettleApi\.found/);
  assert.match(appJs, /chatModeForPhase/);
  assert.match(appJs, /addProject\(\{\s*root:\s*folder/);
  assert.doesNotMatch(appJs, /addProject\(\{\s*path:\s*folder/);
});
