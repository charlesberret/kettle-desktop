#!/usr/bin/env node
/** Remove unused Electron privacy descriptions from the assembled macOS app. */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  throw new Error('Kettle Desktop currently packages only on macOS');
}

const app = path.join(
  path.resolve(__dirname, '..'),
  'out',
  `Kettle-darwin-${process.arch}`,
  'Kettle.app'
);
const plist = path.join(app, 'Contents', 'Info.plist');
if (!fs.existsSync(plist)) {
  throw new Error(`Cannot finalize missing package: ${plist}`);
}
const unusedDescriptions = [
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

for (const key of unusedDescriptions) {
  try {
    execFileSync('/usr/bin/plutil', ['-remove', key, plist], { stdio: 'ignore' });
  } catch {
    // Electron versions differ; absence is the desired final state.
  }
}

console.log(`package plist finalized: ${plist}`);
