'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { planSidecarStartup } = require('../lib/sidecar-startup');

test('spawns an owned core on 4242 when the canonical port is free', async () => {
  let pinged = false;
  let foundFallback = false;
  const plan = await planSidecarStartup({
    defaultPort: 4242,
    isPortFree: async () => true,
    pingCompatibleCore: async () => {
      pinged = true;
    },
    findFreePort: async () => {
      foundFallback = true;
      return 49100;
    },
  });

  assert.deepEqual(plan, {
    mode: 'spawn',
    port: 4242,
    reason: 'default-port-free',
  });
  assert.equal(pinged, false);
  assert.equal(foundFallback, false);
});

test('attaches non-destructively when a compatible core already owns 4242', async () => {
  let foundFallback = false;
  const identity = {
    app: 'kettle',
    version: '0.2.0',
    api_version: 0,
    desk_schema_version: 0,
    port: 4242,
  };
  const plan = await planSidecarStartup({
    defaultPort: 4242,
    isPortFree: async () => false,
    pingCompatibleCore: async () => identity,
    findFreePort: async () => {
      foundFallback = true;
      return 49100;
    },
  });

  assert.deepEqual(plan, {
    mode: 'attach',
    port: 4242,
    identity,
    reason: 'compatible-core-already-running',
  });
  assert.equal(foundFallback, false);
});

test('falls back deliberately when the 4242 occupant is incompatible', async () => {
  const incompatible = new Error('Unsupported Kettle API version 1');
  incompatible.code = 'incompatible-core';
  const plan = await planSidecarStartup({
    defaultPort: 4242,
    isPortFree: async () => false,
    pingCompatibleCore: async () => {
      throw incompatible;
    },
    findFreePort: async () => 49100,
  });

  assert.deepEqual(plan, {
    mode: 'spawn',
    port: 49100,
    reason: 'default-port-incompatible',
    detail: 'Unsupported Kettle API version 1',
  });
});

test('does not spawn a second core when the 4242 probe times out or is refused', async () => {
  for (const code of ['core-timeout', 'core-auth']) {
    let foundFallback = false;
    const err = new Error(code);
    err.code = code;
    await assert.rejects(
      () => planSidecarStartup({
        defaultPort: 4242,
        isPortFree: async () => false,
        pingCompatibleCore: async () => {
          throw err;
        },
        findFreePort: async () => {
          foundFallback = true;
          return 49100;
        },
      }),
      (caught) => caught === err,
    );
    assert.equal(foundFallback, false, code);
  }
});
