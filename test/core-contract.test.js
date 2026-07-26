'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  validateCoreIndex,
  validateCorePing,
  validateReleaseProvenance,
} = require('../lib/core-contract');

const compatibility = {
  apiVersions: [0],
  deskSchemaVersions: [0],
};

const ping = {
  app: 'kettle',
  version: '0.2.0',
  api_version: 0,
  desk_schema_version: 0,
  port: 43123,
};

const index = Buffer.from('<!doctype html><title>Kettle</title>');
const provenance = {
  shell: '0.1.0',
  kettle: '0.2.0',
  apiVersion: 0,
  deskSchemaVersion: 0,
  kettleCommit: 'abc1234def56',
  kettleDirty: false,
  kettleIndexSha256: crypto.createHash('sha256').update(index).digest('hex'),
};

test('accepts a compatible core identity', () => {
  assert.equal(
    validateCorePing(ping, { port: 43123, compatibility }),
    ping
  );
});

test('accepts a legacy Setsweep core only as an external attachment', () => {
  const legacy = { ...ping, app: 'setsweep' };
  assert.equal(
    validateCorePing(legacy, { port: 43123, compatibility }),
    legacy
  );
  assert.throws(
    () => validateCorePing(legacy, { port: 43123, compatibility, provenance }),
    /Bundled sidecar must identify as Kettle/
  );
});

test('rejects missing contract identity', () => {
  assert.throws(
    () => validateCorePing(
      { app: 'kettle', version: '0.2.0', port: 43123 },
      { port: 43123, compatibility }
    ),
    /API version is missing/
  );
});

test('rejects unsupported contracts', () => {
  assert.throws(
    () => validateCorePing(
      { ...ping, api_version: 1 },
      { port: 43123, compatibility }
    ),
    /Unsupported Kettle API version 1/
  );
});

test('requires packaged identity to match clean build provenance', () => {
  assert.equal(
    validateCorePing(ping, { port: 43123, compatibility, provenance }),
    ping
  );
  assert.throws(
    () => validateCorePing(
      { ...ping, version: '0.3.0' },
      { port: 43123, compatibility, provenance }
    ),
    /does not match sidecar/
  );
  assert.throws(
    () => validateReleaseProvenance({ ...provenance, kettleDirty: true }),
    /is not clean/
  );
});

test('verifies the served UI against canonical core index provenance', () => {
  assert.equal(validateCoreIndex(index, provenance), provenance.kettleIndexSha256);
  assert.throws(
    () => validateCoreIndex(Buffer.from('<title>fork</title>'), provenance),
    /does not match build provenance/
  );
});
