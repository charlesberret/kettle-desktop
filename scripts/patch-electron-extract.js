#!/usr/bin/env node
/** Replace extract-zip in @electron/packager with ditto on macOS (extract-zip hangs on Electron 42+). */
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  console.log('[patch-electron-extract] skip (not macOS)');
  process.exit(0);
}

const unzipPath = path.join(__dirname, '..', 'node_modules', '@electron', 'packager', 'dist', 'unzip.js');
if (!fs.existsSync(unzipPath)) {
  console.warn('[patch-electron-extract] packager not found — run npm install');
  process.exit(0);
}

const patched = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractElectronZip = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
async function extractElectronZip(zipPath, targetDir) {
    // extract-zip hangs mid-archive on Electron 42+ with Node 22+; ditto is reliable on macOS.
    await execFileAsync('/usr/bin/ditto', ['-xk', zipPath, targetDir]);
}
exports.extractElectronZip = extractElectronZip;
`;

const cur = fs.readFileSync(unzipPath, 'utf8');
if (cur.includes('ditto')) {
  console.log('[patch-electron-extract] already patched');
  process.exit(0);
}

fs.writeFileSync(unzipPath, patched);
console.log('[patch-electron-extract] patched @electron/packager/dist/unzip.js → ditto');
