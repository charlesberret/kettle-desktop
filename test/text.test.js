'use strict';

/**
 * Unit-test the display-only frontmatter unescape (LAB-28) without a browser
 * DOM. Loads app/text.js via vm, same idiom as commands-filter.test.js.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'text.js'),
  'utf8'
);
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { unescapeMeta } = sandbox.window.KettleText;

test('turns literal \\n into a real newline', () => {
  assert.equal(unescapeMeta('Foo\\nBar'), 'Foo\nBar');
});

test('turns literal \\t into a real tab', () => {
  assert.equal(unescapeMeta('col\\tval'), 'col\tval');
});

test('collapses a literal \\r\\n pair to one newline', () => {
  assert.equal(unescapeMeta('a\\r\\nb'), 'a\nb');
});

test('leaves already-real whitespace untouched', () => {
  assert.equal(unescapeMeta('Foo\nBar\tBaz'), 'Foo\nBar\tBaz');
});

test('leaves text with no escapes untouched', () => {
  assert.equal(unescapeMeta('a plain title'), 'a plain title');
});

test('does not touch unrelated backslash sequences', () => {
  assert.equal(unescapeMeta('C:\\\\Users\\\\x'), 'C:\\\\Users\\\\x');
  assert.equal(unescapeMeta('\\d+'), '\\d+');
});

test('null / undefined / empty coerce to empty string', () => {
  assert.equal(unescapeMeta(null), '');
  assert.equal(unescapeMeta(undefined), '');
  assert.equal(unescapeMeta(''), '');
});

test('coerces non-string input', () => {
  assert.equal(unescapeMeta(42), '42');
});
