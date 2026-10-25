import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, SettingsStore, validateSettings } from '../src/settings.js';

const root = fileURLToPath(new URL('./tmp/', import.meta.url));
async function fixture(t) {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'settings-'));
  t.after(async () => {
    const target = resolve(directory), rel = relative(root, target);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    await rm(target, { recursive: true, force: true });
  });
  return { directory, filePath: join(directory, 'settings.json') };
}
const login = 'https://login.example.edu/login?qurl=%u';

test('version 0.1 settings migrate safely to disabled naming and an independent language', async context => {
  const { filePath } = await fixture(context);
  const legacy = { enabled: true, useDefaultHostnames: true, customHostnames: [], loginUrlScheme: login, proxiedUrlScheme: '' };
  await writeFile(filePath, JSON.stringify({ version: 1, revision: 7, settings: legacy }));
  const store = new SettingsStore({ filePath });
  const migrated = await store.load();
  assert.equal(migrated.language, 'zh-CN');
  assert.equal(migrated.renameEnabled, false);
  assert.equal(migrated.downloadDirectory, '');
  assert.deepEqual(migrated.namingFields, ['title', 'year', 'platform']);
  assert.equal(migrated.loginUrlScheme, login);
  migrated.namingFields.push('author');
  assert.deepEqual(store.get().namingFields, ['title', 'year', 'platform']);
  for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
    const saved = await store.save({ ...store.get(), language, namingFields: ['platform', 'author', 'title'] });
    assert.deepEqual(saved.settings.namingFields, ['title', 'author', 'platform']);
    assert.equal((await new SettingsStore({ filePath }).load()).language, language);
  }
});

test('new settings reject invalid language, naming fields and nonlocal paths', () => {
  for (const input of [{ language: 'en' }, { renameEnabled: 'true' }, { namingFields: ['doi'] }, { namingFields: ['title', 'title'] }, { namingFields: null }, { downloadDirectory: 'relative/path' }, { downloadDirectory: 'https://example.org/downloads' }, { downloadDirectory: '//server/share' }, { downloadDirectory: 42 }]) {
    assert.throws(() => validateSettings(input));
  }
  assert.deepEqual(validateSettings({ namingFields: [] }).namingFields, []);
  assert.equal(validateSettings({ downloadDirectory: root }).downloadDirectory, root.trim());
});

test('new profiles leave both schemes empty and keep independent host selections', () => {
  assert.equal(DEFAULT_SETTINGS.loginUrlScheme, '');
  assert.equal(DEFAULT_SETTINGS.proxiedUrlScheme, '');
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS.customHostnames));
  const value = validateSettings({ useDefaultHostnames: false, customHostnames: [' EXAMPLE.ORG ', 'example.org.', 'BÜCHER.example'], loginUrlScheme: ` ${login} ` });
  assert.deepEqual(value.customHostnames, ['example.org', 'xn--bcher-kva.example']);
  assert.equal(value.useDefaultHostnames, false);
  assert.equal(value.loginUrlScheme, login);
});

test('invalid fields, getter objects, excess hosts and schemes are rejected', () => {
  for (const value of [null, [], { enabled: 'yes' }, { status: {} }, { customHostnames: ['https://example.org'] }, { customHostnames: Array(1001).fill('example.org') }, { loginUrlScheme: 'javascript:%u' }, { proxiedUrlScheme: '%h/%p' }]) assert.throws(() => validateSettings(value));
  let invoked = false;
  assert.throws(() => validateSettings(Object.defineProperty({}, 'enabled', { get() { invoked = true; return true; } })));
  assert.equal(invoked, false);
});

test('atomic persistence survives reload, returns copies and removes temp files', async t => {
  const { directory, filePath } = await fixture(t);
  const store = new SettingsStore({ filePath });
  await store.load();
  assert.deepEqual(await readdir(directory), []);
  const input = { customHostnames: ['example.org'], loginUrlScheme: login };
  const pending = store.save(input, { revision: 0 });
  input.customHostnames[0] = 'changed.example';
  const saved = await pending;
  saved.settings.customHostnames.length = 0;
  assert.deepEqual(store.get().customHostnames, ['example.org']);
  const restarted = new SettingsStore({ filePath });
  assert.equal((await restarted.load()).loginUrlScheme, login);
  assert.equal(restarted.revision, 1);
  assert.deepEqual(await readdir(directory), ['settings.json']);
  assert.equal(JSON.parse(await readFile(filePath, 'utf8')).version, 1);
});

test('concurrent settings windows cannot silently overwrite each other', async t => {
  const { filePath } = await fixture(t);
  const store = new SettingsStore({ filePath });
  const result = await Promise.allSettled([store.save({ enabled: false }, { revision: 0 }), store.save({}, { revision: 0 })]);
  assert.equal(result[0].status, 'fulfilled');
  assert.equal(result[1].reason.code, 'SETTINGS_REVISION_CONFLICT');
  assert.equal(result[1].reason.statusCode, 409);
  assert.equal(store.get().enabled, false);
  assert.equal((await store.save({}, { revision: 1 })).revision, 2);
});

test('corrupt configuration is preserved and errors do not reveal its contents', async t => {
  const { filePath } = await fixture(t);
  const invalid = '{private-token-and-url';
  await writeFile(filePath, invalid);
  const store = new SettingsStore({ filePath });
  await assert.rejects(store.load(), error => error.code === 'SETTINGS_CORRUPT' && !error.stack.includes(invalid));
  await assert.rejects(store.save({}), { code: 'SETTINGS_CORRUPT' });
  assert.equal(await readFile(filePath, 'utf8'), invalid);
  await writeFile(filePath, JSON.stringify({ version: 1, revision: 6, settings: DEFAULT_SETTINGS }));
  await store.load();
  assert.equal((await store.save({}, { revision: 6 })).revision, 7);
});

test('concurrent readers always see a complete JSON document', async t => {
  const { filePath } = await fixture(t);
  const store = new SettingsStore({ filePath });
  await store.save({});
  const writer = Promise.all(Array.from({ length: 15 }, (_, index) => store.save({ enabled: index % 2 === 0 })));
  const reader = (async () => { for (let n = 0; n < 30; n++) assert.equal(JSON.parse(await readFile(filePath, 'utf8')).version, 1); })();
  await Promise.all([writer, reader]);
  assert.equal(store.revision, 16);
});

test('save before load uses persisted revision and cannot overflow it', async t => {
  const { filePath } = await fixture(t);
  await writeFile(filePath, JSON.stringify({ version: 1, revision: Number.MAX_SAFE_INTEGER, settings: DEFAULT_SETTINGS }));
  const store = new SettingsStore({ filePath });
  await assert.rejects(store.save({}, { revision: 0 }), { code: 'SETTINGS_REVISION_CONFLICT' });
  await assert.rejects(store.save({}), { code: 'SETTINGS_REVISION_EXHAUSTED' });
});
