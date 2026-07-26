'use strict';

const crypto = require('crypto');

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing or invalid`);
  }
  return value;
}

function requireInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} is missing or invalid`);
  }
  return value;
}

function requireVersion(value, label) {
  if (typeof value !== 'string' || !value.trim() || value === 'unknown' || value === 'dev') {
    throw new Error(`${label} is missing or unversioned`);
  }
  return value;
}

function requireSupported(value, supported, label) {
  if (!Array.isArray(supported) || !supported.every(Number.isInteger)) {
    throw new Error(`Desktop ${label} compatibility manifest is invalid`);
  }
  if (!supported.includes(value)) {
    throw new Error(
      `Unsupported Kettle ${label} ${value}; desktop supports ${supported.join(', ') || 'none'}`
    );
  }
}

function validateReleaseProvenance(provenance) {
  const release = requireObject(provenance, 'Bundled Kettle provenance');
  requireVersion(release.kettle, 'Bundled Kettle version');
  requireInteger(release.apiVersion, 'Bundled Kettle API version');
  requireInteger(release.deskSchemaVersion, 'Bundled Kettle desk schema version');

  if (release.kettleDirty !== false) {
    throw new Error('Bundled Kettle provenance is not clean');
  }
  if (typeof release.kettleCommit !== 'string'
      || !/^[0-9a-f]{7,64}$/i.test(release.kettleCommit)) {
    throw new Error('Bundled Kettle commit is missing or invalid');
  }
  if (typeof release.kettleIndexSha256 !== 'string'
      || !/^[0-9a-f]{64}$/i.test(release.kettleIndexSha256)) {
    throw new Error('Bundled Kettle index provenance is missing or invalid');
  }
  return release;
}

function validateCorePing(ping, options) {
  const identity = requireObject(ping, 'Kettle /api/ping identity');
  const {
    port,
    compatibility,
    provenance = null,
  } = options;

  if (!['kettle', 'setsweep'].includes(identity.app)) {
    throw new Error('Sidecar ping did not identify Kettle or its Setsweep predecessor');
  }
  if (identity.port !== port) {
    throw new Error(`Sidecar ping reported port ${identity.port}; expected ${port}`);
  }

  const version = requireVersion(identity.version, 'Kettle core version');
  const apiVersion = requireInteger(identity.api_version, 'Kettle API version');
  const deskSchemaVersion = requireInteger(
    identity.desk_schema_version,
    'Kettle desk schema version'
  );
  const supported = requireObject(compatibility, 'Desktop compatibility manifest');
  requireSupported(apiVersion, supported.apiVersions, 'API version');
  requireSupported(deskSchemaVersion, supported.deskSchemaVersions, 'desk schema version');

  if (provenance) {
    const release = validateReleaseProvenance(provenance);
    if (identity.app !== 'kettle') {
      throw new Error('Bundled sidecar must identify as Kettle');
    }
    if (release.kettle !== version) {
      throw new Error(
        `Bundled Kettle version ${release.kettle} does not match sidecar ${version}`
      );
    }
    if (release.apiVersion !== apiVersion) {
      throw new Error(
        `Bundled API version ${release.apiVersion} does not match sidecar ${apiVersion}`
      );
    }
    if (release.deskSchemaVersion !== deskSchemaVersion) {
      throw new Error(
        `Bundled desk schema ${release.deskSchemaVersion} does not match sidecar `
        + deskSchemaVersion
      );
    }
  }

  return identity;
}

function validateCoreIndex(body, provenance) {
  const release = validateReleaseProvenance(provenance);
  const actual = crypto.createHash('sha256').update(body).digest('hex');
  if (actual !== release.kettleIndexSha256) {
    throw new Error(
      `Bundled Kettle index hash ${actual} does not match build provenance `
      + release.kettleIndexSha256
    );
  }
  return actual;
}

module.exports = {
  validateCoreIndex,
  validateCorePing,
  validateReleaseProvenance,
};
