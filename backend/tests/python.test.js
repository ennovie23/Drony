import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePythonBin } from '../lib/python.js';

test('uses python on Windows', () => {
  assert.equal(resolvePythonBin('win32', {}), 'python');
});

test('uses python3 elsewhere', () => {
  assert.equal(resolvePythonBin('linux', {}), 'python3');
});

test('PYTHON_BIN overrides the default', () => {
  assert.equal(resolvePythonBin('win32', { PYTHON_BIN: 'C:\venv\python.exe' }), 'C:\venv\python.exe');
});
