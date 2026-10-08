import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStoredTheme, writeStoredTheme, THEME_KEY } from '../src/hooks/themeStorage.js';

const mem = (init = {}) => {
    const d = { ...init };
    return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, d };
};
const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
};

test('defaults to light', () => assert.equal(readStoredTheme(mem()), 'light'));
test('reads a stored dark', () => assert.equal(readStoredTheme(mem({ [THEME_KEY]: 'dark' })), 'dark'));
test('ignores garbage', () => assert.equal(readStoredTheme(mem({ [THEME_KEY]: 'purple' })), 'light'));
test('blocked storage falls back to light', () => assert.equal(readStoredTheme(broken), 'light'));
test('missing storage falls back to light', () => assert.equal(readStoredTheme(undefined), 'light'));
test('writes the theme', () => {
    const s = mem();
    writeStoredTheme('dark', s);
    assert.equal(s.d[THEME_KEY], 'dark');
});
test('write to blocked storage does not throw', () => assert.doesNotThrow(() => writeStoredTheme('dark', broken)));
