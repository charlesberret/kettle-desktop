#!/usr/bin/env node
/** Fail closed when Electron Forge exits without producing the expected app. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22 || nodeMajor >= 26) {
  throw new Error(
    `Kettle Desktop packaging supports Node 22 through 25; found ${process.versions.node}`
  );
}

if (process.platform !== 'darwin') {
  throw new Error('Kettle Desktop currently packages only on macOS');
}

if (process.argv.includes('--preflight')) {
  console.log(`package preflight ok: Node ${process.versions.node} on macOS`);
  process.exit(0);
}

const app = path.join(
  root,
  'out',
  `Kettle-darwin-${process.arch}`,
  'Kettle.app'
);
const resources = path.join(app, 'Contents', 'Resources');
const required = [
  path.join(app, 'Contents', 'Info.plist'),
  path.join(resources, 'app.asar'),
  path.join(resources, 'kettle-compatibility.json'),
  path.join(resources, 'kettle-sidecar', 'kettle-sidecar'),
  path.join(resources, 'version.json'),
];

for (const target of required) {
  if (!fs.existsSync(target)) {
    throw new Error(`Packaged Kettle.app is incomplete: missing ${target}`);
  }
}

const provenance = JSON.parse(
  fs.readFileSync(path.join(resources, 'version.json'), 'utf8')
);
if (
  Object.prototype.hasOwnProperty.call(provenance, 'kettleSource') ||
  provenance.kettleDirty !== false ||
  typeof provenance.kettleCommit !== 'string' ||
  !/^[0-9a-f]{12,40}$/.test(provenance.kettleCommit)
) {
  throw new Error('Packaged Kettle.app lacks clean, versioned core provenance');
}

const plist = JSON.parse(
  execFileSync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', path.join(app, 'Contents', 'Info.plist')],
    { encoding: 'utf8' }
  )
);
const transport = plist.NSAppTransportSecurity || {};
if (
  transport.NSAllowsArbitraryLoads !== false ||
  transport.NSAllowsLocalNetworking !== true
) {
  throw new Error('Packaged Kettle.app must allow local networking, not arbitrary loads');
}
for (const key of [
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
]) {
  if (Object.prototype.hasOwnProperty.call(plist, key)) {
    throw new Error(`Packaged Kettle.app declares unused privacy key ${key}`);
  }
}

console.log(`package check ok: ${app} (core ${provenance.kettleCommit})`);
