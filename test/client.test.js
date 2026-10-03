import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_HOSTNAMES } from '../src/default-hostnames.js';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const legacyDefaults = () => ({ enabled: true, useDefaultHostnames: true, customHostnames: [], loginUrlScheme: '', proxiedUrlScheme: '' });
const defaults = () => ({ ...legacyDefaults(), language: 'zh-CN', renameEnabled: false, namingFields: ['title', 'year', 'platform'], downloadDirectory: '' });
const envelope = (settings = defaults(), revision = 0, status = { mode: 'unconfigured' }) => ({ settings, revision, status, defaultHostnames: [...DEFAULT_HOSTNAMES] });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

function clock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(delay) {
      const end = now + delay;
      for (let count = 0; count < 1000; count++) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) { now = end; await settle(); return; }
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await settle();
      }
      throw new Error('Timer loop did not settle');
    },
    size: () => timers.size,
  };
}

function bundle(fetchImpl = async () => { throw new Error('Unexpected network request'); }) {
  const events = new Map();
  const registrations = [];
  const cleanups = [];
  const lifecycle = { localeDisposed: 0, slotDisposed: 0 };
  let exports, loaderId, dictionaries;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {}, useId: () => ':test:',
  };
  const window = {
    __ModuleLoader__: { load(entry) { loaderId = entry.id; exports = entry.factory(name => { assert.equal(name, 'react'); return react; }); } },
    addEventListener: (type, callback) => events.set(type, callback),
    removeEventListener: (type, callback) => { assert.equal(events.get(type), callback); events.delete(type); },
  };
  vm.runInNewContext(source, { window, fetch: fetchImpl, AbortController, URL, setTimeout, clearTimeout }, { filename: 'client.js' });
  const ctx = {
    effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); },
    locale: {
      register(namespace, values) {
        assert.equal(namespace, 'settings.dsh-academic-web-proxy'); dictionaries = values;
        return () => lifecycle.localeDisposed++;
      },
      bind: () => (key, vars) => dictionaries.zh[key].replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? '')),
    },
    slots: {
      inject(name, fn) { assert.equal(name, 'settings.section'); cleanups.push(fn()); },
      register(options, component) { registrations.push({ options, component }); return () => lifecycle.slotDisposed++; },
    },
  };
  return { exports, loaderId, ctx, events, registrations, lifecycle,
    dictionaries: () => dictionaries,
    dispose() { for (const cleanup of cleanups.reverse()) cleanup(); },
  };
}

function setup(handler) {
  const time = clock();
  const loaded = bundle();
  const calls = [];
  const controller = loaded.exports.createSettingsController({ ...time, fetch: async (url, options) => {
    const call = { url, options, body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    return handler(call, calls);
  } });
  return { controller, calls, time, loaded };
}
const saves = calls => calls.filter(call => call.options.method === 'POST');
function nodes(tree) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null) return '';
  if (typeof tree !== 'object') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (tree.type === 'style') return '';
  return text(tree.props?.children);
}
function render(loaded, controller, language = 'zh') {
  if (!loaded.registrations.length) loaded.exports.apply(loaded.ctx);
  const dictionary = loaded.dictionaries()[language];
  return loaded.registrations[0].component({ controller, t: (key, vars) => dictionary[key].replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? '')) });
}

test('registers an independent DSH settings section, three complete locales and disposable effects', () => {
  const loaded = bundle();
  assert.equal(loaded.loaderId, 'dsh-academic-web-proxy');
  assert.equal(loaded.exports.name, 'dsh-academic-web-proxy');
  assert.deepEqual(plain(loaded.exports.inject), ['slots', 'locale']);
  loaded.exports.apply(loaded.ctx);
  assert.equal(loaded.registrations.length, 1);
  const { options } = loaded.registrations[0];
  assert.equal(options.id, 'dsh-academic-web-proxy');
  assert.equal(options.name, 'settings.section');
  assert.equal(options.label(), '学术网页代理');
  assert.equal(options.locale, 'settings.dsh-academic-web-proxy');
  assert.ok(options.inject().controller);
  assert.equal(loaded.dictionaries().en.nav, 'Academic Web Proxy');
  assert.equal(loaded.dictionaries()['zh-TW'].nav, '學術網頁代理');
  for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
    const dictionary = loaded.dictionaries()[language];
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(loaded.dictionaries().zh).sort());
    assert.ok(Object.values(dictionary).every(value => typeof value === 'string' && value.trim()), language);
  }
  assert.deepEqual(Object.keys(loaded.dictionaries().zh).sort(), Object.keys(loaded.dictionaries().en).sort());
  assert.ok(loaded.events.has('beforeunload'));
  options.inject().controller.setHostnameInput('unsaved.example.org');
  let prevented = false;
  const unloadEvent = { preventDefault() { prevented = true; }, returnValue: undefined };
  loaded.events.get('beforeunload')(unloadEvent);
  assert.equal(prevented, true);
  assert.equal(unloadEvent.returnValue, '');
  loaded.dispose();
  assert.deepEqual(loaded.lifecycle, { localeDisposed: 1, slotDisposed: 1 });
  assert.equal(loaded.events.size, 0);
});

for (const [language, title, filenameLabel, directoryLabel, mode, pendingLogin, pendingChallenge] of [
  ['zh-CN', '学术网页代理', '文件名字段', '本地下载文件夹（绝对路径）', '桌面浏览器监测已启用', '请在对应原页面完成机构登录。', '请在对应原页面完成人机验证；自动操作已暂停。'],
  ['zh-TW', '學術網頁代理', '檔名欄位', '本機下載資料夾（絕對路徑）', '桌面瀏覽器監測已啟用', '請在對應原頁面完成機構登入。', '請在對應原頁面完成人機驗證；自動操作已暫停。'],
  ['en-US', 'Academic Web Proxy', 'Filename fields', 'Local download folder (absolute path)', 'Desktop browser monitoring active', 'Complete institutional login on the corresponding original page.', 'Complete human verification on the corresponding original page. Automatic actions are paused.'],
]) test(`renders the whole settings page in persisted ${language}, independently of the DSH locale`, async t => {
  const status = { mode: 'desktop-bridge', message: '不要显示此服务端中文消息', pending: [
    { id: 1, kind: 'login', message: '不要显示服务端登录文本' },
    { id: 2, kind: 'challenge', message: '不要显示服务端验证文本', presented: false },
  ] };
  const env = setup(() => response(envelope({ ...defaults(), language }, 0, status)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  const tree = render(env.loaded, env.controller, language === 'en-US' ? 'zh' : 'en');
  const content = text(tree);
  assert.equal(tree.props.lang, language);
  for (const expected of [title, filenameLabel, directoryLabel, mode, pendingLogin, pendingChallenge]) assert.ok(content.includes(expected), expected);
  assert.doesNotMatch(content, /不要显示|desktop-bridge/);
  if (language === 'en-US') assert.doesNotMatch(content, /[\u3400-\u9fff]/u);
  const selector = nodes(tree).find(node => node.type === 'select');
  assert.equal(selector.props.value, language);
  assert.deepEqual(plain(nodes(selector).filter(node => node.type === 'option').map(node => node.props.value)), ['zh-CN', 'zh-TW', 'en-US']);
  const dictionary = env.loaded.dictionaries()[language];
  for (const key of ['languageHint', 'renameHint', 'downloadDirectoryHint', 'namingHint', 'namingMissing', 'namingSafety', 'presentUnconfirmed']) {
    assert.ok(content.includes(dictionary[key]), key);
  }
  for (const input of nodes(tree).filter(node => ['input', 'select'].includes(node.type))) {
    assert.ok(nodes(tree).some(node => node.type === 'label' && node.props.htmlFor === input.props.id), input.props.id);
  }
  const directory = nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-downloadDirectory'));
  assert.equal(directory.props.value, '');
  assert.equal(directory.props.placeholder, undefined);
  const naming = nodes(tree).filter(node => node.type === 'input' && /-naming-(title|author|year|venue|platform)$/.test(node.props.id));
  assert.equal(naming.length, 5);
  assert.deepEqual(plain(naming.map(node => node.props.checked)), [true, false, true, false, true]);
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-renameEnabled')).props.checked, false);
});

test('language selection applies before autosave and reloads with opt-in, fields and the explicit folder', async t => {
  let persisted = defaults();
  let revision = 4;
  const handler = call => {
    if (call.body) { persisted = call.body.settings; revision++; }
    return response(envelope(persisted, revision));
  };
  const env = setup(handler);
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  const select = () => nodes(render(env.loaded, env.controller)).find(node => node.type === 'select');
  select().props.onChange({ target: { value: 'zh-TW' } });
  assert.match(text(render(env.loaded, env.controller)), /等待自動儲存/);
  assert.equal(select().props.value, 'zh-TW');
  assert.equal(saves(env.calls).length, 0);
  select().props.onChange({ target: { value: 'en-US' } });
  let tree = render(env.loaded, env.controller);
  assert.match(text(tree), /Changes waiting to save/);
  assert.doesNotMatch(text(tree), /[\u3400-\u9fff]/u);
  nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-renameEnabled')).props.onChange({ target: { checked: true } });
  tree = render(env.loaded, env.controller);
  nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-naming-author')).props.onChange({ target: { checked: true } });
  tree = render(env.loaded, env.controller);
  nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-naming-title')).props.onChange({ target: { checked: false } });
  tree = render(env.loaded, env.controller);
  const downloadDirectory = 'C:\\Users\\Reader\\Downloads';
  nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-downloadDirectory')).props.onChange({ target: { value: downloadDirectory } });
  assert.equal(text(nodes(render(env.loaded, env.controller)).find(node => node.type === 'output')), 'Ming Zhang_2025_Example.org.pdf');
  await env.time.advance(599);
  assert.equal(saves(env.calls).length, 0);
  await env.time.advance(1);
  assert.deepEqual(saves(env.calls)[0].body, { revision: 4, settings: { ...defaults(), language: 'en-US', renameEnabled: true, namingFields: ['author', 'year', 'platform'], downloadDirectory } });
  assert.equal(env.controller.hasUnsaved(), false);
  const reopened = setup(handler);
  t.after(() => { reopened.controller.dispose(); reopened.loaded.dispose(); });
  await reopened.controller.load();
  tree = render(reopened.loaded, reopened.controller, 'zh');
  assert.equal(tree.props.lang, 'en-US');
  assert.equal(nodes(tree).find(node => node.type === 'select').props.value, 'en-US');
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-renameEnabled')).props.checked, true);
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.id.endsWith('-downloadDirectory')).props.value, downloadDirectory);
  assert.deepEqual(plain(reopened.controller.getState().settings.namingFields), ['author', 'year', 'platform']);
});

test('legacy envelopes default only missing new keys and do not trigger an unsolicited save', async t => {
  const env = setup(call => response(envelope(call.body?.settings || legacyDefaults(), call.body ? 1 : 0)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  assert.deepEqual(plain(env.controller.getState().settings), defaults());
  const tree = render(env.loaded, env.controller, 'en');
  assert.equal(tree.props.lang, 'zh-CN');
  assert.match(text(tree), /学术网页代理/);
  await env.time.advance(5000);
  assert.equal(saves(env.calls).length, 0);
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  assert.deepEqual(saves(env.calls)[0].body.settings, { ...defaults(), enabled: false });
  const partial = setup(() => response(envelope({ ...legacyDefaults(), language: 'zh-TW', namingFields: [] })));
  t.after(() => partial.controller.dispose());
  await partial.controller.load();
  assert.deepEqual(plain(partial.controller.getState().settings), { ...defaults(), language: 'zh-TW', namingFields: [] });
});

test('invalid persisted language, opt-in, folder and naming fields reject the envelope', async t => {
  const invalid = [
    ...['en', 'zh', 'en-us', 'zh-cn', 'fr-FR', '', null, 3].map(value => ['language', value]),
    ...[null, 'title', ['unknown'], ['title', 'title'], ['year', 4], ['__proto__']].map(value => ['namingFields', value]),
    ...[null, 'true', 0].map(value => ['renameEnabled', value]),
    ...[null, 3, []].map(value => ['downloadDirectory', value]),
  ];
  for (const [field, value] of invalid) {
    const env = setup(() => response(envelope({ ...defaults(), [field]: value })));
    t.after(() => env.controller.dispose());
    await env.controller.load();
    assert.equal(env.controller.getState().settings, null, `${field}: ${JSON.stringify(value)}`);
    assert.equal(env.controller.getState().loadError.key, 'invalidResponse');
    assert.equal(saves(env.calls).length, 0);
  }
});

test('invalid local language and naming values leave the draft and save queue unchanged', async t => {
  const env = setup(() => response(envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  const initial = env.controller.getState();
  for (const [field, values] of [
    ['language', ['en', 'zh', 'en-us', 'fr-FR', '', null, undefined, 3]],
    ['namingFields', [null, undefined, 'title', ['unknown'], ['title', 'title'], ['title', null], ['__proto__'], new Array(1)]],
    ['renameEnabled', ['yes', 1, undefined, null]],
    ['downloadDirectory', [null, 3, []]],
  ]) for (const value of values) {
    assert.equal(env.controller.edit(field, value), false, field);
    assert.equal(env.controller.getState(), initial, field);
  }
  await env.time.advance(1000);
  assert.equal(saves(env.calls).length, 0);
});

test('filename checkboxes use canonical order and update the example preview independently of opt-in', async t => {
  const env = setup(call => response(envelope(call.body?.settings || { ...defaults(), language: 'en-US' }, call.body ? 1 : 0)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  const tree = () => render(env.loaded, env.controller);
  const toggleField = (field, checked) => nodes(tree()).find(node => node.type === 'input' && node.props.id.endsWith('-naming-' + field)).props.onChange({ target: { checked } });
  const labels = nodes(tree()).filter(node => node.type === 'label' && /-naming-(title|author|year|venue|platform)$/.test(node.props.htmlFor));
  assert.deepEqual(plain(labels.map(node => text(node).trim())), ['Paper title', 'Author (first author)', 'Publication year', 'Journal or conference', 'Platform']);
  assert.equal(text(nodes(tree()).find(node => node.type === 'output')), 'Academic Web Proxy Research_2025_Example.org.pdf');
  toggleField('venue', true);
  toggleField('author', true);
  assert.deepEqual(plain(env.controller.getState().settings.namingFields), ['title', 'author', 'year', 'venue', 'platform']);
  assert.equal(text(nodes(tree()).find(node => node.type === 'output')), 'Academic Web Proxy Research_Ming Zhang_2025_Example Research Journal_Example.org.pdf');
  assert.equal(env.controller.getState().settings.renameEnabled, false);
  for (const field of ['title', 'author', 'year', 'venue', 'platform']) toggleField(field, false);
  assert.equal(text(nodes(tree()).find(node => node.type === 'output')), 'Original filename is kept');
  assert.match(text(tree()), /Missing fields are skipped/);
  assert.match(text(tree()), /Invalid filename characters are replaced/);
  assert.match(text(tree()), /backend numbers duplicate filenames automatically/);
  await env.time.advance(600);
  assert.deepEqual(saves(env.calls)[0].body.settings.namingFields, []);
  assert.equal(saves(env.calls)[0].body.settings.renameEnabled, false);
});

test('preview skips missing values, replaces filename characters and keeps the original when empty', () => {
  const { filenamePreview, normalizeNamingFields } = bundle().exports;
  assert.deepEqual(plain(normalizeNamingFields(['platform', 'venue', 'year', 'author', 'title'])), ['title', 'author', 'year', 'venue', 'platform']);
  assert.equal(normalizeNamingFields(['title', 'title']), null);
  assert.equal(normalizeNamingFields(['title', 'filename']), null);
  assert.equal(filenamePreview({ title: ' A: title/part? ', author: '', year: 2024, platform: 'Example.org' }, ['platform', 'author', 'title', 'year']), 'A_ title_part_2024_Example.org.pdf');
  assert.equal(filenamePreview({ title: 'Missing author' }, ['author'], 'download-17.pdf'), 'download-17.pdf');
  assert.equal(filenamePreview({ title: '   ' }, ['title'], 'download-18.pdf'), 'download-18.pdf');
  assert.equal(filenamePreview({ title: 'A title' }, [], 'download-19.pdf'), 'download-19.pdf');
});

test('loaded, edited and submitted naming arrays are cloned and canonically ordered', async t => {
  const original = { ...defaults(), namingFields: ['platform', 'title', 'year'] };
  const env = setup(call => response(envelope(call.body?.settings || original, call.body ? 1 : 0)));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  assert.deepEqual(plain(env.controller.getState().settings.namingFields), ['title', 'year', 'platform']);
  original.namingFields.push('venue');
  original.customHostnames.push('external.example.org');
  assert.deepEqual(plain(env.controller.getState().settings.namingFields), ['title', 'year', 'platform']);
  assert.deepEqual(plain(env.controller.getState().settings.customHostnames), []);
  const fields = ['platform', 'author', 'title'];
  env.controller.edit('namingFields', fields);
  fields.push('venue');
  assert.deepEqual(plain(env.controller.getState().settings.namingFields), ['title', 'author', 'platform']);
  await env.time.advance(600);
  assert.deepEqual(saves(env.calls)[0].body.settings.namingFields, ['title', 'author', 'platform']);
  saves(env.calls)[0].body.settings.namingFields.push('year');
  assert.deepEqual(plain(env.controller.getState().settings.namingFields), ['title', 'author', 'platform']);
  assert.equal(env.controller.hasUnsaved(), false);
});

test('hostname input normalizes host-only strings and rejects URL/path/port/wildcard syntax', () => {
  const { normalizeHostname } = bundle().exports;
  assert.equal(normalizeHostname('  Journals.Example.ORG  '), 'journals.example.org');
  assert.equal(normalizeHostname('EXAMPLE.ORG.'), 'example.org');
  assert.equal(normalizeHostname('例子.测试'), 'xn--fsqu00a.xn--0zwm56d');
  for (const input of ['https://example.org', '//example.org', 'example.org/path', 'example.org:443', 'example.org?q=x',
    '*.example.org', 'user@example.org', 'example.org\\path', 'example..org', 'localhost', 'ex ample.org', '%65xample.org',
    '-example.org', 'example-.org', 'example.org\nother.org', null, 3]) assert.equal(normalizeHostname(input), null, String(input));
});

test('loads the entire settings contract and displays 47 defaults and blank scheme values', async t => {
  const env = setup(() => response(envelope()));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  assert.equal(env.controller.getState().defaultHostnames.length, 47);
  const tree = render(env.loaded, env.controller);
  const inputs = nodes(tree).filter(node => node.type === 'input');
  const templates = inputs.filter(node => /UrlScheme$/.test(node.props.id));
  assert.equal(templates.length, 2);
  for (const input of templates) { assert.equal(input.props.value, ''); assert.equal(input.props.placeholder, undefined); }
  assert.match(text(tree), /默认域名（47）/);
  assert.match(text(tree), /Login URL Scheme/);
  assert.match(text(tree), /%u：编码整个原始 URL/);
  assert.match(text(tree), /HTTPS 主机名中的点号会替换为连字符/);
  assert.match(text(tree), /%p：原始路径、查询参数和片段/);
  for (const input of inputs) assert.ok(nodes(tree).some(node => node.type === 'label' && node.props.htmlFor === input.props.id));
  env.controller.edit('language', 'en-US');
  assert.match(text(render(env.loaded, env.controller, 'zh')), /Academic Web Proxy/);
  assert.equal(env.calls[0].url, 'api/dsh-academic-web-proxy/settings');
  assert.equal(env.calls[0].options.credentials, 'same-origin');
  assert.equal(env.calls[0].options.mode, 'same-origin');
  assert.equal(env.calls[0].options.redirect, 'error');
});

test('coalesces edits for 600ms and sends a full object with the loaded revision', async t => {
  const env = setup(call => response(call.body ? envelope(call.body.settings, 8) : envelope(defaults(), 7)));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('loginUrlScheme', 'https://login.example.edu/login?qurl=');
  await env.time.advance(500);
  env.controller.edit('loginUrlScheme', 'https://login.example.edu/login?qurl=%u');
  env.controller.edit('enabled', false);
  await env.time.advance(599);
  assert.equal(saves(env.calls).length, 0);
  await env.time.advance(1);
  const [save] = saves(env.calls);
  assert.deepEqual(save.body, { settings: { ...defaults(), enabled: false, loginUrlScheme: 'https://login.example.edu/login?qurl=%u' }, revision: 7 });
  assert.equal(env.controller.getState().saveState, 'saved');
  assert.equal(env.controller.getState().revision, 8);
  assert.equal(env.controller.hasUnsaved(), false);
});

test('serializes saves and never replaces newer input with an older save response', async t => {
  const firstSave = defer();
  const env = setup(call => call.body ? saves(env.calls).length === 1 ? firstSave.promise : response(envelope(call.body.settings, 2)) : response(envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('loginUrlScheme', 'first');
  await env.time.advance(600);
  assert.equal(saves(env.calls).length, 1);
  env.controller.edit('loginUrlScheme', 'second');
  env.controller.edit('useDefaultHostnames', false);
  await env.time.advance(900);
  assert.equal(saves(env.calls).length, 1);
  firstSave.resolve(response(envelope({ ...defaults(), loginUrlScheme: 'first' }, 1)));
  await settle();
  assert.equal(env.controller.getState().settings.loginUrlScheme, 'second');
  assert.equal(env.controller.getState().settings.useDefaultHostnames, false);
  await env.time.advance(0);
  assert.equal(saves(env.calls).length, 2);
  assert.equal(saves(env.calls)[1].body.revision, 1);
  assert.equal(saves(env.calls)[1].body.settings.loginUrlScheme, 'second');
  assert.equal(env.controller.getState().saveState, 'saved');
});

test('waits for the latest edit debounce even when the preceding save finishes sooner', async t => {
  const inFlight = defer();
  const env = setup(call => call.body ? saves(env.calls).length === 1 ? inFlight.promise : response(envelope(call.body.settings, 2)) : response(envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  env.controller.edit('proxiedUrlScheme', 'new template');
  await env.time.advance(100);
  inFlight.resolve(response(envelope({ ...defaults(), enabled: false }, 1)));
  await settle();
  await env.time.advance(499);
  assert.equal(saves(env.calls).length, 1);
  await env.time.advance(1);
  assert.equal(saves(env.calls).length, 2);
});

test('retains unsaved fields and hostname draft on 409; reload reviews then merges against the new revision', async t => {
  let gets = 0;
  const remote = { ...defaults(), enabled: false, proxiedUrlScheme: '%h.remote.example.edu/%p', customHostnames: ['remote.example.org'] };
  const env = setup(call => {
    if (!call.body) return response(++gets === 1 ? envelope() : envelope(remote, 3));
    return saves(env.calls).length === 1 ? response({ error: 'Revision conflict' }, 409) : response(envelope(call.body.settings, 4));
  });
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('loginUrlScheme', 'my template');
  env.controller.setHostnameInput(' LOCAL.Example.ORG ');
  assert.equal(env.controller.addHostname(), true);
  env.controller.setHostnameInput('not-added.example.org');
  await env.time.advance(600);
  assert.equal(env.controller.getState().saveState, 'conflict');
  env.controller.edit('loginUrlScheme', 'my newer template');
  await env.time.advance(6000);
  assert.equal(saves(env.calls).length, 1);
  await env.controller.load();
  assert.equal(env.controller.getState().saveState, 'review');
  assert.equal(env.controller.getState().settings.loginUrlScheme, 'my newer template');
  assert.equal(env.controller.getState().settings.enabled, true);
  assert.equal(env.controller.getState().hostnameInput, 'not-added.example.org');
  assert.equal(env.controller.getState().review.settings.enabled, false);
  await env.time.advance(6000);
  assert.equal(saves(env.calls).length, 1);
  env.controller.mergeAndSave();
  await env.time.advance(0);
  const save = saves(env.calls)[1];
  assert.equal(save.body.revision, 3);
  assert.deepEqual(save.body.settings, { ...remote, loginUrlScheme: 'my newer template', customHostnames: ['remote.example.org', 'local.example.org'] });
});

test('editing while a reload is pending keeps the latest draft instead of accepting the GET', async t => {
  const reload = defer();
  let gets = 0;
  const env = setup(() => ++gets === 1 ? response(envelope()) : reload.promise);
  t.after(() => env.controller.dispose());
  await env.controller.load();
  const reading = env.controller.load();
  env.controller.edit('loginUrlScheme', 'typed during GET');
  await env.time.advance(600);
  reload.resolve(response(envelope({ ...defaults(), loginUrlScheme: 'from server' }, 2)));
  await reading;
  assert.equal(env.controller.getState().settings.loginUrlScheme, 'typed during GET');
  assert.equal(env.controller.getState().review.settings.loginUrlScheme, 'from server');
  assert.equal(saves(env.calls).length, 0);
});

test('save errors keep edits and offer a retry without automatic request loops', async t => {
  const env = setup(call => !call.body ? response(envelope()) : saves(env.calls).length === 1
    ? response({ error: 'Invalid template' }, 400) : response(envelope(call.body.settings, 1)));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('proxiedUrlScheme', 'draft');
  await env.time.advance(600);
  assert.equal(env.controller.getState().saveState, 'error');
  assert.equal(env.controller.getState().saveError.message, 'Invalid template');
  assert.equal(env.controller.getState().settings.proxiedUrlScheme, 'draft');
  await env.time.advance(10000);
  assert.equal(saves(env.calls).length, 1);
  env.controller.retrySave();
  await env.time.advance(0);
  assert.equal(saves(env.calls).length, 2);
  assert.equal(env.controller.getState().saveState, 'saved');
});

test('initial load and malformed responses expose retryable errors', async t => {
  let calls = 0;
  const env = setup(() => ++calls === 1 ? response({ error: 'Offline' }, 503)
    : calls === 2 ? response({ settings: defaults(), revision: 'bad' }) : response(envelope()));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  assert.equal(env.controller.getState().settings, null);
  assert.equal(env.controller.getState().loadError.message, 'Offline');
  const errorTree = render(env.loaded, env.controller);
  assert.ok(nodes(errorTree).some(node => node.type === 'button' && text(node) === '重试读取'));
  await env.controller.load();
  assert.equal(env.controller.getState().loadError.key, 'invalidResponse');
  await env.controller.load();
  assert.equal(env.controller.getState().loadError, null);
  assert.equal(env.controller.getState().loading, false);
  assert.equal(env.controller.getState().saveState, 'saved');
});

test('custom domain edits work independently when defaults and global proxy are disabled', async t => {
  const env = setup(call => response(envelope(call.body?.settings || { ...defaults(), enabled: false, useDefaultHostnames: false }, call.body ? 1 : 0)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  env.controller.setHostnameInput(' PubS.AIP.ORG ');
  assert.equal(env.controller.addHostname(), true);
  env.controller.setHostnameInput('pubs.aip.org');
  assert.equal(env.controller.addHostname(), false);
  assert.equal(env.controller.getState().hostnameError, 'duplicateHostname');
  env.controller.setHostnameInput('https://example.org/path');
  assert.equal(env.controller.addHostname(), false);
  assert.equal(env.controller.getState().hostnameError, 'invalidHostname');
  await env.time.advance(600);
  assert.deepEqual(saves(env.calls)[0].body.settings.customHostnames, ['pubs.aip.org']);
  const tree = render(env.loaded, env.controller);
  assert.ok(nodes(tree).filter(node => node.type === 'input').every(node => !node.props.disabled));
  assert.match(text(tree), /关闭这组后，自定义域名仍然生效/);
  env.controller.removeHostname('pubs.aip.org');
  assert.deepEqual(plain(env.controller.getState().settings.customHostnames), []);
});

test('all known proxy runtime modes use the selected local dictionary instead of server messages', async t => {
  const modes = { starting: 'modeStarting', restricted: 'modeRestricted', unconfigured: 'modeUnconfigured', disabled: 'modeDisabled', unavailable: 'modeUnavailable', 'desktop-bridge': 'modeDesktop' };
  let currentStatus = { mode: 'starting', message: '服务器中文状态原文' };
  const env = setup(call => response(call.url.endsWith('/status') ? currentStatus : envelope(defaults(), 0, currentStatus)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  render(env.loaded, env.controller);
  for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
    env.controller.edit('language', language);
    for (const [mode, key] of Object.entries(modes)) {
      currentStatus = { mode, message: '服务器中文状态原文' };
      await env.controller.refreshStatus();
      const content = text(render(env.loaded, env.controller));
      assert.ok(content.includes(env.loaded.dictionaries()[language][key]), `${language} ${mode}`);
      assert.ok(content.includes(env.loaded.dictionaries()[language][key + 'Hint']), `${language} ${mode} hint`);
      assert.doesNotMatch(content, /服务器中文状态原文/);
    }
  }
});

test('renaming status renders only backend readiness and valid pending counts in all three languages', async t => {
  const modes = { ready: 'renamingReady', disabled: 'renamingDisabled', 'needs-directory': 'renamingNeedsDirectory', 'directory-unavailable': 'renamingDirectoryUnavailable', unsupported: 'renamingUnsupported' };
  let currentStatus = { mode: 'desktop-bridge', renaming: { enabled: true, mode: 'ready', pending: 2, recent: [{ status: 'future-outcome', filename: 'not-proof-of-success.pdf' }] } };
  const env = setup(call => response(call.url.endsWith('/status') ? currentStatus : envelope(defaults(), 0, currentStatus)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  render(env.loaded, env.controller);
  for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
    env.controller.edit('language', language);
    for (const [mode, key] of Object.entries(modes)) {
      currentStatus = { ...currentStatus, renaming: { ...currentStatus.renaming, mode } };
      await env.controller.refreshStatus();
      const content = text(render(env.loaded, env.controller));
      const dictionary = env.loaded.dictionaries()[language];
      assert.ok(content.includes(dictionary.renamingStatus), language);
      assert.ok(content.includes(dictionary[key]), `${language} ${mode}`);
      assert.ok(content.includes(dictionary.renamingPending.replace('{count}', '2')));
      assert.doesNotMatch(content, /not-proof-of-success|future-outcome/);
    }
  }
  for (const pending of [-1, 0.5, '2', null]) {
    currentStatus = { ...currentStatus, renaming: { ...currentStatus.renaming, pending } };
    await env.controller.refreshStatus();
    assert.doesNotMatch(text(render(env.loaded, env.controller)), /Pending downloads:/);
  }
});

test('unknown backend status data stays useful while URL secrets remain masked', async t => {
  const status = { mode: 'new-adapter-mode', message: 'Adapter fault at https://user:secret@example.org/check?token=private#fragment',
    pending: [{ id: 3, kind: 'new-kind', message: 'Provider diagnostic https://user:secret@example.org/help?code=private' }] };
  const env = setup(() => response(envelope({ ...defaults(), language: 'en-US' }, 0, status)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  const content = text(render(env.loaded, env.controller));
  assert.match(content, /new-adapter-mode/);
  assert.match(content, /Adapter fault at https:\/\/example.org\/check\?…#…/);
  assert.match(content, /Provider diagnostic https:\/\/example.org\/help\?…/);
  assert.doesNotMatch(content, /user:|secret|private|#fragment/);
});

test('status polling uses only /status and late status cannot overwrite settings edits', async t => {
  const env = setup(call => response(call.url.endsWith('/status') ? { mode: 'desktop-bridge', pending: [] } : call.body ? envelope(call.body.settings, 1) : envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  const stop = env.controller.subscribe(() => {});
  env.controller.edit('loginUrlScheme', 'local');
  await env.time.advance(0);
  assert.equal(env.controller.getState().settings.loginUrlScheme, 'local');
  assert.equal(env.controller.getState().status.mode, 'desktop-bridge');
  await env.time.advance(5000);
  assert.equal(env.calls.filter(call => call.url.endsWith('/settings') && call.options.method === 'GET').length, 1);
  assert.equal(env.calls.filter(call => call.url.endsWith('/status')).length, 2);
  stop();
  const count = env.calls.length;
  await env.time.advance(10000);
  assert.equal(env.calls.length, count);
});

test('an absent optional status endpoint stops polling and keeps settings response status', async t => {
  const env = setup(call => call.url.endsWith('/status') ? response({ error: 'Not found' }, 404) : response(envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.subscribe(() => {});
  await env.time.advance(0);
  assert.equal(env.controller.getState().statusUnavailable, true);
  assert.equal(env.controller.getState().status.mode, 'unconfigured');
  await env.time.advance(20000);
  assert.equal(env.calls.length, 2);
});

test('pending pages show exact guest IDs and masked URLs, and POST only the exact record ID', async t => {
  const pending = [{ id: 47, guestId: 'guest-exact-007', url: 'https://user:secret@login.example.edu/check?ticket=private#token', message: 'Login https://login.example.edu/check?ticket=private' }];
  const presentation = defer();
  const env = setup(call => call.url.endsWith('/present') ? presentation.promise : response(call.url.endsWith('/status')
    ? { mode: 'desktop-bridge', pending } : envelope(defaults(), 0, { mode: 'desktop-bridge', pending })));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  const tree = render(env.loaded, env.controller);
  assert.match(text(tree), /guest-exact-007/);
  assert.match(text(tree), /https:\/\/login.example.edu\/check\?…/);
  assert.doesNotMatch(text(tree), /secret|private|#token|user:/);
  const show = nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === '展示对应浏览器页面: guest-exact-007');
  assert.ok(show);
  show.props.onClick();
  void env.controller.present(47);
  assert.equal(env.calls.filter(call => call.url.endsWith('/present')).length, 1);
  assert.deepEqual(env.calls.find(call => call.url.endsWith('/present')).body, { id: 47 });
  presentation.resolve(response({ presented: true }));
  await settle();
  assert.deepEqual(plain(env.controller.getState().presenting), []);
  assert.deepEqual(plain(env.controller.getState().presented), ['number:47']);
});

test('leaving the settings section preserves its draft and finishes the queued save', async t => {
  const env = setup(call => response(envelope(call.body?.settings || defaults(), call.body ? 1 : 0)));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  const unsubscribe = env.controller.subscribe(() => {});
  env.controller.edit('enabled', false);
  unsubscribe();
  await env.time.advance(600);
  assert.equal(saves(env.calls).length, 1);
  assert.equal(env.controller.getState().saveState, 'saved');
  assert.equal(env.controller.getState().settings.enabled, false);
});

test('reverting a field while its prior value saves still persists the final visible value', async t => {
  const saving = defer();
  const env = setup(call => !call.body ? response(envelope()) : saves(env.calls).length === 1
    ? saving.promise : response(envelope(call.body.settings, 2)));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  env.controller.edit('enabled', true);
  await env.time.advance(600);
  saving.resolve(response(envelope({ ...defaults(), enabled: false }, 1)));
  await settle();
  assert.equal(env.controller.getState().settings.enabled, true);
  await env.time.advance(0);
  assert.equal(saves(env.calls)[1].body.settings.enabled, true);
  assert.equal(env.controller.hasUnsaved(), false);
});

test('a newer status reply takes precedence over an older settings response', async t => {
  const saving = defer();
  const env = setup(call => call.url.endsWith('/status') ? response({ mode: 'fresh-poll' })
    : call.body ? saving.promise : response(envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  await env.controller.refreshStatus();
  saving.resolve(response(envelope({ ...defaults(), enabled: false }, 1, { mode: 'older-save' })));
  await settle();
  assert.equal(env.controller.getState().status.mode, 'fresh-poll');
  assert.equal(env.controller.getState().revision, 1);
});

test('an older status poll cannot replace a newer save response', async t => {
  const polling = defer();
  const env = setup(call => call.url.endsWith('/status') ? polling.promise
    : response(call.body ? envelope(call.body.settings, 1, { mode: 'fresh-save' }) : envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  const poll = env.controller.refreshStatus();
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  polling.resolve(response({ mode: 'older-poll' }));
  await poll;
  assert.equal(env.controller.getState().status.mode, 'fresh-save');
});

test('a failed reload during editing leaves a retryable draft and no hidden save loop', async t => {
  const reload = defer();
  let gets = 0;
  const env = setup(call => call.body ? response(envelope(call.body.settings, 1))
    : ++gets === 1 ? response(envelope()) : reload.promise);
  t.after(() => env.controller.dispose());
  await env.controller.load();
  const loading = env.controller.load();
  env.controller.edit('enabled', false);
  reload.reject(new Error('Offline'));
  await loading;
  assert.equal(env.controller.getState().saveState, 'error');
  assert.equal(env.controller.getState().settings.enabled, false);
  await env.time.advance(10000);
  assert.equal(saves(env.calls).length, 0);
  env.controller.retrySave();
  await env.time.advance(0);
  assert.equal(saves(env.calls).length, 1);
  assert.equal(env.controller.getState().saveState, 'saved');
});

test('a negative presentation acknowledgement remains an actionable error', async t => {
  const env = setup(call => response(call.url.endsWith('/present') ? { presented: false } : envelope()));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  await env.controller.present(47);
  assert.equal(env.controller.getState().presentError.key, 'presentUnconfirmed');
  assert.deepEqual(plain(env.controller.getState().presented), []);
});

test('conflict merges preserve remote additions while applying local hostname removals', async t => {
  let gets = 0;
  const base = { ...defaults(), customHostnames: ['remove.example.org', 'unchanged.example.org'] };
  const remote = { ...base, customHostnames: [...base.customHostnames, 'remote.example.org'] };
  const env = setup(call => !call.body ? response(++gets === 1 ? envelope(base) : envelope(remote, 2))
    : saves(env.calls).length === 1 ? response({ error: 'Conflict' }, 409) : response(envelope(call.body.settings, 3)));
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.removeHostname('remove.example.org');
  env.controller.setHostnameInput('local.example.org');
  env.controller.addHostname();
  await env.time.advance(600);
  await env.controller.load();
  env.controller.mergeAndSave();
  await env.time.advance(0);
  assert.deepEqual(saves(env.calls)[1].body.settings.customHostnames, ['unchanged.example.org', 'remote.example.org', 'local.example.org']);
});

test('conflict merge retains independent naming checkbox edits and remote opt-in and folder changes', async t => {
  let gets = 0;
  const remote = { ...defaults(), language: 'zh-TW', renameEnabled: true, namingFields: ['title', 'year', 'venue'], downloadDirectory: 'D:\\Paper Downloads', proxiedUrlScheme: '%h.remote.example.edu/%p' };
  const env = setup(call => !call.body ? response(++gets === 1 ? envelope(defaults(), 2) : envelope(remote, 4))
    : saves(env.calls).length === 1 ? response({ error: 'Revision conflict' }, 409) : response(envelope(call.body.settings, 5)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  env.controller.edit('language', 'en-US');
  env.controller.edit('namingFields', ['platform', 'title', 'author']);
  await env.time.advance(600);
  assert.equal(env.controller.getState().saveState, 'conflict');
  await env.controller.load();
  const review = nodes(render(env.loaded, env.controller)).find(node => node.type === 'details' && node.props.open);
  assert.ok(review);
  for (const value of ['Interface language', 'Traditional Chinese', 'Enable PDF file renaming', 'Local download folder (absolute path)', 'Journal or conference', 'D:\\Paper Downloads']) {
    assert.ok(text(review).includes(value), value);
  }
  env.controller.mergeAndSave();
  const merged = env.controller.getState().settings;
  assert.equal(merged.language, 'en-US');
  assert.equal(merged.renameEnabled, true);
  assert.equal(merged.downloadDirectory, remote.downloadDirectory);
  assert.deepEqual(plain(merged.namingFields), ['title', 'author', 'venue']);
  assert.notEqual(merged.namingFields, remote.namingFields);
  await env.time.advance(0);
  assert.deepEqual(saves(env.calls)[1].body, { revision: 4, settings: { ...remote, language: 'en-US', namingFields: ['title', 'author', 'venue'] } });
});

test('editing naming and directory leaves a remote language change independent during merge', async t => {
  let gets = 0;
  const remote = { ...defaults(), language: 'zh-TW', renameEnabled: true, downloadDirectory: 'D:\\Remote Downloads' };
  const env = setup(call => !call.body ? response(++gets === 1 ? envelope() : envelope(remote, 3))
    : saves(env.calls).length === 1 ? response({ error: 'Revision conflict' }, 409) : response(envelope(call.body.settings, 4)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  env.controller.edit('namingFields', ['title', 'author']);
  env.controller.edit('downloadDirectory', 'C:\\My Downloads');
  await env.time.advance(600);
  await env.controller.load();
  env.controller.mergeAndSave();
  assert.equal(render(env.loaded, env.controller, 'en').props.lang, 'zh-TW');
  assert.match(text(render(env.loaded, env.controller, 'en')), /學術網頁代理/);
  await env.time.advance(0);
  assert.deepEqual(saves(env.calls)[1].body.settings, { ...remote, namingFields: ['title', 'author'], downloadDirectory: 'C:\\My Downloads' });
});

test('an older save cannot reset a newer language or naming field selection', async t => {
  const saving = defer();
  const env = setup(call => !call.body ? response(envelope()) : saves(env.calls).length === 1
    ? saving.promise : response(envelope(call.body.settings, 2)));
  t.after(() => { env.controller.dispose(); env.loaded.dispose(); });
  await env.controller.load();
  env.controller.edit('language', 'en-US');
  env.controller.edit('namingFields', ['author', 'title']);
  await env.time.advance(600);
  env.controller.edit('language', 'zh-TW');
  env.controller.edit('namingFields', []);
  const first = saves(env.calls)[0].body.settings;
  saving.resolve(response(envelope(first, 1)));
  await settle();
  assert.equal(env.controller.getState().settings.language, 'zh-TW');
  assert.deepEqual(plain(env.controller.getState().settings.namingFields), []);
  assert.equal(render(env.loaded, env.controller).props.lang, 'zh-TW');
  await env.time.advance(599);
  assert.equal(saves(env.calls).length, 1);
  await env.time.advance(1);
  assert.equal(saves(env.calls)[1].body.settings.language, 'zh-TW');
  assert.deepEqual(saves(env.calls)[1].body.settings.namingFields, []);
  assert.equal(env.controller.getState().saveState, 'saved');
});

test('request timeout releases saving state and preserves the draft for retry', async t => {
  const env = setup(call => {
    if (!call.body) return response(envelope());
    return new Promise((resolve, reject) => call.options.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  });
  t.after(() => env.controller.dispose());
  await env.controller.load();
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  await env.time.advance(15000);
  assert.equal(env.controller.getState().saveState, 'error');
  assert.equal(env.controller.getState().saveError.key, 'timeout');
  assert.equal(env.controller.getState().settings.enabled, false);
  assert.equal(saves(env.calls).length, 1);
});

test('plugin disposal cancels queued saves and ignores late in-flight responses', async () => {
  const saving = defer();
  const env = setup(call => call.body ? saving.promise : response(envelope()));
  await env.controller.load();
  env.controller.edit('enabled', false);
  await env.time.advance(600);
  const snapshot = env.controller.getState();
  env.controller.dispose();
  assert.equal(saves(env.calls)[0].options.signal.aborted, true);
  saving.resolve(response(envelope(defaults(), 99)));
  await settle();
  assert.equal(env.controller.getState(), snapshot);
  assert.equal(env.time.size(), 0);
  const queued = setup(() => response(envelope()));
  await queued.controller.load();
  queued.controller.edit('enabled', false);
  queued.controller.dispose();
  await queued.time.advance(600);
  assert.equal(saves(queued.calls).length, 0);
});
