'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadKettleApi() {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'app', 'api.js'),
    'utf8',
  );
  const calls = [];
  const context = {
    globalThis: null,
    fetch: async (url, opts = {}) => {
      calls.push({
        url: String(url),
        method: opts.method || 'GET',
        body: opts.body ? JSON.parse(opts.body) : null,
        headers: opts.headers || {},
      });
      const streamBody = {
        getReader() {
          return {
            async read() {
              return { done: true, value: undefined };
            },
          };
        },
      };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ ok: true }),
        body: streamBody,
      };
    },
    TextDecoder: class {
      decode() {
        return '';
      }
    },
  };
  context.globalThis = context;
  vm.runInNewContext(src, context);
  return { api: context.KettleApi, calls };
}

test('addProjectBody prefers root and keeps optional founding fields', () => {
  const { api } = loadKettleApi();
  // Objects from the vm realm are not === to host Object; compare as JSON.
  assert.equal(
    JSON.stringify(api.addProjectBody({ name: 'Alpha', root: '/home/u/alpha' })),
    JSON.stringify({ name: 'Alpha', root: '/home/u/alpha' }),
  );
  assert.equal(
    JSON.stringify(
      api.addProjectBody({ name: 'Legacy', path: '/home/u/legacy', note: 'steer' }),
    ),
    JSON.stringify({ name: 'Legacy', root: '/home/u/legacy', note: 'steer' }),
  );
});

test('addProject POSTs /api/projects/add with root', async () => {
  const { api, calls } = loadKettleApi();
  api.setBaseUrl('http://127.0.0.1:43123');
  await api.addProject({ name: 'Desk', root: '/home/u/desk' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'http://127.0.0.1:43123/api/projects/add');
  assert.equal(
    JSON.stringify(calls[0].body),
    JSON.stringify({ name: 'Desk', root: '/home/u/desk' }),
  );
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].body, 'path'), false);
});

test('queue and ritual routes match core plugin MVP + founding tiers', async () => {
  const { api, calls } = loadKettleApi();
  api.setBaseUrl('http://127.0.0.1:43123');
  await api.queue('alpha');
  await api.approve('alpha', 'e1');
  await api.comment('alpha', 'e1', 'note');
  await api.sweep('alpha');
  await api.interviewStatus('alpha');
  await api.propose('alpha');
  await api.found('alpha');
  await api.refreshBriefs('alpha');

  const urls = calls.map((c) => c.url.replace('http://127.0.0.1:43123', ''));
  assert.equal(urls[0], '/api/queue?project=alpha');
  assert.doesNotMatch(urls[0], /mutate=/);
  assert.equal(
    JSON.stringify(calls[1].body),
    JSON.stringify({ project: 'alpha', id: 'e1' }),
  );
  assert.equal(
    JSON.stringify(calls[2].body),
    JSON.stringify({ project: 'alpha', id: 'e1', text: 'note' }),
  );
  assert.equal(urls[3], '/api/sweep');
  assert.equal(urls[4], '/api/interview?project=alpha');
  assert.equal(urls[5], '/api/propose');
  assert.equal(urls[6], '/api/found');
  assert.equal(urls[7], '/api/refresh-briefs');
});

test('API requests send X-Kettle-Token from setToken', async () => {
  const { api, calls } = loadKettleApi();
  api.setBaseUrl('http://127.0.0.1:43123');
  api.setToken('test-token-abc');
  await api.ping();
  await api.save('alpha', '/tmp/x.md', 'hi');
  assert.equal(calls[0].headers['X-Kettle-Token'], 'test-token-abc');
  assert.equal(calls[1].headers['X-Kettle-Token'], 'test-token-abc');
});

