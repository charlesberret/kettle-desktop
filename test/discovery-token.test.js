'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { tokenForProbe } = require('../lib/discovery-token');

test('uses the discovery token only when it names the probed port', () => {
  const discovery = { port: 4242, token: 'desk-token' };
  assert.equal(tokenForProbe(discovery, 4242), 'desk-token');
  assert.equal(tokenForProbe(discovery, 54817), null);
  assert.equal(tokenForProbe({ port: 4242, token: '' }, 4242), null);
  assert.equal(tokenForProbe(null, 4242), null);
});
