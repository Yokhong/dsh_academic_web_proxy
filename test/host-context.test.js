import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { resolveSettingsPath, resolveWebUrl } from '../src/host-context.js';

const context = directory => ({ get(name) { assert.equal(name, 'profileContext'); return { dir: directory }; } });

test('settings paths follow the host profile service independently for each profile', () => {
  for (const name of ['alpha', 'beta']) {
    const directory = resolve('test', 'tmp', name);
    assert.equal(resolveSettingsPath(context(directory)), join(directory, 'plugins', 'dsh-academic-web-proxy', 'settings.json'));
  }
  assert.notEqual(resolveSettingsPath(context(resolve('test/tmp/alpha'))), resolveSettingsPath(context(resolve('test/tmp/beta'))));
});

test('a missing or relative host profile never silently falls back to the shell environment', () => {
  assert.throws(() => resolveSettingsPath({ get: () => undefined }), /active DSH profile/);
  assert.throws(() => resolveSettingsPath(context('relative-profile')), /active DSH profile/);
});

test('browser scope follows the bound webServer port and fails closed until ready', () => {
  assert.equal(resolveWebUrl(undefined), undefined);
  assert.equal(resolveWebUrl({ get port() { throw new Error('not bound'); } }), undefined);
  assert.equal(resolveWebUrl({ port: 0 }), undefined);
  assert.equal(resolveWebUrl({ port: 54321 }), 'http://127.0.0.1:54321');
  assert.equal(resolveWebUrl({ port: 54322 }), 'http://127.0.0.1:54322');
});
