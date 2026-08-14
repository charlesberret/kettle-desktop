'use strict';

/**
 * The renderer client must attach X-Kettle-Token on every /api/ call
 * (LAB-63, kettle-core docs/AUTH-TOKEN.md). Load app/api.js in a vm with a
 * fake fetch and assert the header, same idiom as commands-filter.test.js.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApi(onFetch) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api.js'), 'utf8');
  const sandbox = {
    window: {},
    console,
    TextDecoder,
    fetch: async (url, opts) => {
      onFetch(url, opts || {});
      return { ok: true, json: async () => ({ app: 'kettle' }) };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.KettleApi;
}

test('attaches X-Kettle-Token on GET when a token is set', async () => {
  let headers = null;
  const api = loadApi((_u, opts) => (headers = opts.headers || {}));
  api.setBaseUrl('http://127.0.0.1:4242');
  api.setToken('tok-abc');
  await api.ping();
  assert.equal(headers['X-Kettle-Token'], 'tok-abc');
});

test('attaches X-Kettle-Token on POST alongside Content-Type', async () => {
  let headers = null;
  const api = loadApi((_u, opts) => (headers = opts.headers || {}));
  api.setBaseUrl('http://127.0.0.1:4242');
  api.setToken('tok-xyz');
  await api.approve('proj', 'id1');
  assert.equal(headers['X-Kettle-Token'], 'tok-xyz');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('omits the token header when none is set', async () => {
  let headers = null;
  const api = loadApi((_u, opts) => (headers = opts.headers || {}));
  api.setBaseUrl('http://127.0.0.1:4242');
  await api.ping();
  assert.ok(!('X-Kettle-Token' in (headers || {})));
});

test('setToken tolerates null/undefined', async () => {
  let headers = null;
  const api = loadApi((_u, opts) => (headers = opts.headers || {}));
  api.setBaseUrl('http://127.0.0.1:4242');
  api.setToken(null);
  await api.ping();
  assert.ok(!('X-Kettle-Token' in (headers || {})));
});
