import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { DesktopBridge } from '../src/desktop-bridge.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Every endpoint is fake and confined to a short-lived directory beside this
// test. The tests never discover or connect to the user's real desktop bridge.
async function fixture(t, handler = () => ({ ok: true, guests: [] }), options = {}) {
  const directory = await mkdtemp(join(testDirectory, '.bridge-fixture-'));
  const endpointPath = join(directory, 'dsh-builtin-browser-bridge.json');
  const token = 'isolated-unit-test-credential';
  const sockets = new Set(), requests = [];
  let connections = 0;
  const server = createServer(socket => {
    connections++;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        const { token: supplied, ...request } = JSON.parse(line);
        const reply = answer => { if (!socket.destroyed) socket.write(JSON.stringify(answer) + '\n'); };
        if (supplied !== token) {
          Promise.resolve(options.authRejected?.()).then(() => reply({ ok: false, error: 'bad token' }));
          continue;
        }
        requests.push(request); // Credentials never enter diagnostics/request assertions.
        Promise.resolve(handler(request, { socket, reply })).then(answer => {
          if (answer !== undefined) reply(answer);
        }).catch(() => reply({ ok: false, error: 'test handler failed' }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const endpoint = { port: server.address().port, token, pid: process.pid };
  const publish = changes => writeFile(endpointPath, JSON.stringify({ ...endpoint, ...changes }));
  await publish();
  const bridge = new DesktopBridge({ endpointPath, timeoutMs: 500, retryDelayMs: 5, presentationTimeoutMs: 250, ...options.bridge });
  t.after(async () => {
    await bridge.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
    // Check the resolved cleanup target before deleting these two test artifacts.
    assert.equal(dirname(resolve(directory)), resolve(testDirectory));
    assert.ok(directory.startsWith(join(testDirectory, '.bridge-fixture-')));
    await rm(endpointPath, { force: true });
    await rmdir(directory);
  });
  return { bridge, endpointPath, directory, publish, requests, sockets, server,
    get connections() { return connections; } };
}

const guests = [
  { id: 98, type: 'window', url: 'app://other', title: 'Other window' },
  { id: 99, type: 'window', url: 'app://shell', title: 'Desktop' },
  { id: 77, type: 'webview', url: 'https://same.example/', title: 'Same title', destroyed: false },
  { id: 78, type: 'webview', url: 'https://same.example/', title: 'Same title', destroyed: false },
];
const evaluated = value => ({ ok: true, result: { result: { type: typeof value, value } } });

test('authenticates, discovers and normalizes only live sidebar guests', async t => {
  const f = await fixture(t, () => ({ ok: true, guests: [...guests,
    { id: 79, type: 'webview', destroyed: true }, { id: -1, type: 'webview' },
    { id: 78, type: 'webview', url: 'duplicate' }, { id: 80, type: 'webview' }, null] }));
  assert.equal(await f.bridge.discover(), true);
  assert.deepEqual(await f.bridge.list(), [
    { id: 77, type: 'webview', url: 'https://same.example/', title: 'Same title' },
    { id: 78, type: 'webview', url: 'https://same.example/', title: 'Same title' },
    { id: 80, type: 'webview', url: '', title: '' },
  ]);
  assert.deepEqual(f.requests, [{ op: 'list' }, { op: 'list' }]);
});

test('uses DSH_HOME for default endpoint resolution without reading a real endpoint', async t => {
  const f = await fixture(t);
  const before = process.env.DSH_HOME;
  process.env.DSH_HOME = f.directory;
  const bridge = new DesktopBridge({ timeoutMs: 300 });
  try { assert.equal(await bridge.discover(), true); }
  finally {
    await bridge.close();
    if (before === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = before;
  }
});

test('evaluation preserves the caller expression and JSON values', async t => {
  const expression = '({text: "quotes \\" and 中文\\n", nested: [0, false, null]})';
  const value = { text: 'quotes " and 中文\n', nested: [0, false, null] };
  const f = await fixture(t, request => {
    assert.equal(request.method, 'Runtime.evaluate');
    assert.equal(request.id, 78);
    assert.equal(request.params.expression, expression);
    assert.equal(request.params.returnByValue, true);
    assert.equal(request.params.awaitPromise, true);
    assert.ok(request.params.timeout > 0 && request.params.timeout <= 500);
    return evaluated(value);
  });
  assert.deepEqual(await f.bridge.evaluate('78', expression), value);
});

test('evaluation throws CDP exceptionDetails and redacts bridge credentials in errors', async t => {
  const f = await fixture(t, () => ({ ok: true, result: {
    result: { type: 'object', subtype: 'error' },
    exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: isolated-unit-test-credential failure' } },
  } }));
  await assert.rejects(f.bridge.evaluate(78, 'throw new Error()'), error =>
    error.code === 'EEVALUATE' && error.message.includes('[redacted]') && !error.message.includes('isolated-unit-test-credential'));
});

test('rejects malformed nested CDP results without crashing the transport', async t => {
  const answers = [
    { ok: true, result: { exceptionDetails: 'malformed' } },
    { ok: true, result: { exceptionDetails: [] } },
    { ok: true, result: [] },
    { ok: true, result: { result: { type: 'object', objectId: 'not-returned-by-value' } } },
  ];
  const f = await fixture(t, () => answers.shift());
  for (let index = 0; index < 4; index++) {
    await assert.rejects(f.bridge.evaluate(78, 'value'), { code: 'EPROTOCOL' });
  }
});

test('redacts credentials from remote command failures and navigation errors', async t => {
  let next = 0;
  const f = await fixture(t, () => next++ === 0
    ? { ok: false, error: 'Failed: isolated-unit-test-credential' }
    : { ok: true, result: { errorText: 'Failed: isolated-unit-test-credential' } });
  const redacted = error => error.message.includes('[redacted]') && !error.message.includes('isolated-unit-test-credential');
  await assert.rejects(f.bridge.evaluate(78, 'value'), redacted);
  await assert.rejects(f.bridge.navigate(78, 'https://example.test'), redacted);
});

test('decodes undefined, non-finite numbers, negative zero and BigInt', async t => {
  const values = [
    [{ type: 'undefined' }, undefined], [{ type: 'number', unserializableValue: 'NaN' }, NaN],
    [{ type: 'number', unserializableValue: 'Infinity' }, Infinity],
    [{ type: 'number', unserializableValue: '-Infinity' }, -Infinity],
    [{ type: 'number', unserializableValue: '-0' }, -0],
    [{ type: 'bigint', unserializableValue: '9007199254740993n' }, 9007199254740993n],
  ];
  let next = 0;
  const f = await fixture(t, () => ({ ok: true, result: { result: values[next++][0] } }));
  for (const [, expected] of values) assert.ok(Object.is(await f.bridge.evaluate(78, 'value'), expected));
});

test('navigation uses Page.navigate and rejects unsafe URL schemes/credentials', async t => {
  const f = await fixture(t, () => ({ ok: true, result: { frameId: 'main' } }));
  assert.equal(await f.bridge.navigate(78, 'https://example.test/a?q=x#hash'), undefined);
  await f.bridge.navigate(78, 'about:blank');
  assert.deepEqual(f.requests[0], { op: 'cdp', id: 78, method: 'Page.navigate', params: { url: 'https://example.test/a?q=x#hash' } });
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///secret', 'http://user:password@example.test', '/relative']) {
    await assert.rejects(f.bridge.navigate(78, url), /absolute HTTP/);
  }
  assert.equal(f.requests.length, 2);
});

test('navigation surfaces CDP navigation errors and downloads', async t => {
  let request = 0;
  const f = await fixture(t, () => ({ ok: true, result: request++ === 0 ? { errorText: 'net::ERR_FAILED' } : { isDownload: true } }));
  await assert.rejects(f.bridge.navigate(78, 'https://example.test'), /net::ERR_FAILED/);
  await assert.rejects(f.bridge.navigate(78, 'https://example.test'), /download/);
});

test('concurrent commands cannot consume one another\'s uncorrelated responses', async t => {
  const f = await fixture(t, async request => {
    await delay(request.params.expression === 'first' ? 20 : 1);
    return evaluated(request.params.expression);
  });
  assert.deepEqual(await Promise.all([f.bridge.evaluate(78, 'first'), f.bridge.evaluate(77, 'second')]), ['first', 'second']);
  assert.equal(f.connections, 2);
});

test('reads a fresh endpoint after token rejection', async t => {
  let f;
  f = await fixture(t, () => ({ ok: true, guests: [] }), { authRejected: () => f.publish() });
  await f.publish({ token: 'stale-test-credential' });
  assert.equal(await f.bridge.discover(), true);
  assert.equal(f.connections, 2);
  assert.equal(f.requests.length, 1);
});

test('reads a fresh endpoint after a refused connection', async t => {
  const f = await fixture(t, undefined, { bridge: { retryDelayMs: 50 } });
  const retired = createServer();
  await new Promise(resolve => retired.listen(0, '127.0.0.1', resolve));
  const oldPort = retired.address().port;
  await new Promise(resolve => retired.close(resolve));
  await f.publish({ port: oldPort });
  const publish = setTimeout(() => { void f.publish(); }, 10);
  t.after(() => clearTimeout(publish));
  assert.equal(await f.bridge.discover(), true);
  assert.equal(f.requests.length, 1);
});

test('does not replay an ambiguously dispatched command after disconnection', async t => {
  const f = await fixture(t, (_request, { socket }) => { socket.destroy(); });
  await assert.rejects(f.bridge.navigate(78, 'https://example.test'), { code: 'ECONNECTION' });
  assert.equal(f.connections, 1);
  assert.equal(f.requests.length, 1);
});

test('bounds a stalled response and close cancels owned sockets only', async t => {
  const f = await fixture(t, () => undefined, { bridge: { timeoutMs: 40 } });
  const start = Date.now();
  await assert.rejects(f.bridge.list(), { code: 'ETIMEDOUT' });
  assert.ok(Date.now() - start < 1000);
  assert.equal(f.connections, 1);
  const pending = f.bridge.evaluate(78, '1');
  const rejection = assert.rejects(pending, { code: 'ECLOSED' });
  await delay(5);
  await f.bridge.close();
  await rejection;
  await assert.rejects(f.bridge.list(), { code: 'ECLOSED' });
  assert.equal(await f.bridge.discover(), false);
  assert.ok(f.requests.every(request => request.op === 'list' || request.op === 'cdp'));
});

test('rejects malformed, extra, oversized and truncated protocol responses', async t => {
  const cases = [
    ['not-json\n', 'EPROTOCOL'], ['[]\n', 'EPROTOCOL'], ['{"ok":true}\n{}\n', 'EPROTOCOL'],
    ['x'.repeat(300), 'ELIMIT'], ['{"ok":true', 'ECONNECTION'],
  ];
  for (const [raw, code] of cases) await t.test(code + ':' + raw.length, async t => {
    const f = await fixture(t, (_request, { socket }) => { socket.end(raw); }, { bridge: { maxResponseBytes: 256 } });
    await assert.rejects(f.bridge.list(), { code });
    assert.equal(f.connections, 1);
  });
});

test('accepts a fragmented UTF-8 JSON response', async t => {
  const bytes = Buffer.from(JSON.stringify(evaluated('中文')) + '\n');
  const cut = bytes.indexOf(Buffer.from('中')) + 1;
  const f = await fixture(t, async (_request, { socket }) => {
    socket.write(bytes.subarray(0, cut));
    await delay(5);
    socket.end(bytes.subarray(cut));
  });
  assert.equal(await f.bridge.evaluate(78, 'text'), '中文');
});

test('invalid endpoints never cause non-loopback connections or expose parser input', async t => {
  const f = await fixture(t, undefined, { bridge: { staleRetries: 0 } });
  for (const content of [
    '{"token":"DO_NOT_ECHO"', 'x'.repeat(17000),
    JSON.stringify({ port: 1234, token: 'x', host: 'example.test' }),
    JSON.stringify({ port: 1234, token: 'x', host: 'localhost' }),
    JSON.stringify({ port: 70000, token: 'x' }),
  ]) {
    await writeFile(f.endpointPath, content);
    await assert.rejects(f.bridge.list(), error => error.code === 'EENDPOINT' && !error.message.includes('DO_NOT_ECHO'));
  }
  assert.equal(f.connections, 0);
  assert.equal(await f.bridge.discover(), false);
});

test('validates IDs, expression size and request byte limits before sending', async t => {
  const f = await fixture(t, undefined, { bridge: { maxRequestBytes: 256 } });
  for (const id of [null, true, -1, 0, 1.5, '78;bad']) await assert.rejects(f.bridge.evaluate(id, '1'), TypeError);
  await assert.rejects(f.bridge.evaluate(78, ''), TypeError);
  await assert.rejects(f.bridge.evaluate(78, 'x'.repeat(600000)), { code: 'ELIMIT' });
  await assert.rejects(f.bridge.evaluate(78, 'x'.repeat(400)), { code: 'ELIMIT' });
  assert.equal(f.connections, 0);
});

// Minimal DOM fixture for the observed shell contract. The fake bridge executes
// the actual expression generated by DesktopBridge (not an expected substring).
// Duplicate strips in retained hidden hosts mirror the installed DockLayout.
class Element {
  constructor(tag, attributes = {}, rect = { left: 0, top: 0, right: 900, bottom: 800 }) {
    this.tagName = tag;
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = null;
    this.inert = false;
    this.disabled = false;
    this.rect = rect;
    this.style = { display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'visible' };
  }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.attributes.hidden = ''; else delete this.attributes.hidden; }
  get isConnected() { return this.parentElement !== null || this.tagName === 'html'; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } }
  matches(selector) {
    return selector.split(',').some(selector => {
      selector = selector.trim();
      const tag = selector.match(/^[a-z]+/)?.[0];
      if (tag && tag !== this.tagName) return false;
      return [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) =>
        value === undefined ? this.hasAttribute(name) : this.getAttribute(name) === value);
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return this.rect; }
  click() { this.onClick?.(); }
}

function shellFixture({ collapsed = false, hiddenSession = false, overlay = false, deferExpansion = false } = {}) {
  const root = new Element('html');
  const session = new Element('div', { 'data-sidebar-right-session': 'session-a' });
  session.hidden = hiddenSession;
  const panel = new Element('div', { 'data-sidebar-right-session': 'session-a', 'data-sidebar-right-panel': 'push' });
  if (collapsed) panel.setAttribute('aria-hidden', 'true'); else panel.setAttribute('data-sidebar-right-open', 'true');
  root.append(session); session.append(panel);
  const hosts = [], controls = [], views = [];
  const state = { selected: [], expanded: 0, bring: [] };
  for (let bodyIndex = 0; bodyIndex < 2; bodyIndex++) {
    const host = new Element('div', { 'data-dockkit-host': 'dock' });
    host.hidden = bodyIndex !== 0;
    const pane = new Element('section', { 'data-dockkit-pane': 'pane-a' });
    pane.inert = bodyIndex !== 0;
    panel.append(host); host.append(pane); hosts.push({ host, pane });
    for (let tabIndex = 0; tabIndex < 2; tabIndex++) {
      const rect = { left: 30 + tabIndex * 160, top: 20, right: 170 + tabIndex * 160, bottom: 50 };
      const tab = new Element('div', { role: 'tab', 'data-dockkit-tab': `tab-${tabIndex}`, 'aria-selected': String(tabIndex === 0) }, rect);
      const label = new Element('span', { 'data-sidebar-right-tab': `tab-${tabIndex}`, 'data-sidebar-right-occurrence': `occurrence-${tabIndex}` }, rect);
      tab.append(label); pane.append(tab); controls.push(tab);
      tab.onClick = () => {
        state.selected.push(tabIndex);
        hosts.forEach(({ host, pane }, index) => { host.hidden = index !== tabIndex; pane.inert = index !== tabIndex; });
        controls.forEach(control => control.setAttribute('aria-selected', String(control.getAttribute('data-dockkit-tab') === `tab-${tabIndex}`)));
      };
    }
    const toggle = new Element('button', { 'data-sidebar-right-toggle': 'true' }, { left: 500, top: 20, right: 530, bottom: 50 });
    toggle.onClick = () => {
      state.expanded++;
      if (!deferExpansion) { panel.setAttribute('data-sidebar-right-open', 'true'); panel.removeAttribute('aria-hidden'); }
    };
    pane.append(toggle);
    const body = new Element('div', { 'data-sidebar-right-tab': `tab-${bodyIndex}`, 'data-sidebar-right-occurrence': `occurrence-${bodyIndex}` },
      { left: 30, top: 80, right: 600, bottom: 600 });
    const view = new Element('webview', { 'data-sidebar-browser-frame': 'webview' }, { left: 30, top: 80, right: 600, bottom: 600 });
    view.getWebContentsId = () => 77 + bodyIndex;
    pane.append(body); body.append(view); views.push(view);
  }
  const document = {
    visibilityState: 'visible',
    querySelectorAll: selector => root.querySelectorAll(selector),
    elementFromPoint(x, y) {
      if (overlay && y > 60) return root;
      return root.querySelectorAll('*').filter(element => {
        for (let node = element; node; node = node.parentElement) if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
        const r = element.rect;
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      }).at(-1) ?? root;
    },
  };
  return { root, panel, views, document, state,
    evaluate: expression => runInNewContext(expression, { document, innerWidth: 900, innerHeight: 800, getComputedStyle: element => element.style }, { timeout: 100 }),
  };
}

async function presentationFixture(t, domOptions, options = {}) {
  const shell = shellFixture(domOptions);
  const f = await fixture(t, request => {
    if (request.op === 'list') return { ok: true, guests };
    if (request.method === 'Page.bringToFront') {
      assert.equal(request.id, 78);
      assert.equal(shell.views[1].closest('[data-dockkit-host]').hidden, false);
      shell.state.bring.push(request.id);
      options.onBring?.(shell);
      return { ok: true, result: {} };
    }
    assert.equal(request.method, 'Runtime.evaluate');
    if (request.id === 98) return evaluated({ found: false, presented: false });
    assert.equal(request.id, 99);
    return evaluated(shell.evaluate(request.params.expression));
  }, { bridge: { presentationTimeoutMs: 300, ...options.bridge } });
  return { ...f, shell };
}

test('presents the exact inactive guest using matching DOM IDs despite duplicate URL/title', async t => {
  const f = await presentationFixture(t);
  assert.deepEqual(await f.bridge.present(78), { presented: true });
  assert.deepEqual(f.shell.state.selected, [1]);
  assert.deepEqual(f.shell.state.bring, [78]);
  assert.ok(f.requests.every(request => request.op === 'list' || ['Runtime.evaluate', 'Page.bringToFront'].includes(request.method)));
});

test('expands only the mapped collapsed panel, then selects and verifies the exact tab', async t => {
  const f = await presentationFixture(t, { collapsed: true });
  assert.deepEqual(await f.bridge.present(78), { presented: true });
  assert.equal(f.shell.state.expanded, 1);
  assert.deepEqual(f.shell.state.selected, [1]);
});

test('does not repeat a sidebar toggle while the frontend has not committed expansion', async t => {
  const f = await presentationFixture(t, { collapsed: true, deferExpansion: true });
  assert.equal((await f.bridge.present(78)).presented, false);
  assert.equal(f.shell.state.expanded, 1);
  assert.deepEqual(f.shell.state.selected, []);
  assert.deepEqual(f.shell.state.bring, []);
});

test('a hidden session is not replaced with another visible tab or a duplicated URL', async t => {
  const f = await presentationFixture(t, { hiddenSession: true });
  const result = await f.bridge.present(78);
  assert.equal(result.presented, false);
  assert.match(result.reason, /hidden session/);
  assert.deepEqual(f.shell.state.selected, []);
  assert.deepEqual(f.shell.state.bring, []);
});

test('does not claim presentation or bringToFront while the selected guest is covered', async t => {
  const f = await presentationFixture(t, { overlay: true });
  const proofs = [];
  const evaluate = f.shell.evaluate;
  f.shell.evaluate = expression => {
    const proof = evaluate(expression);
    proofs.push(proof);
    return proof;
  };
  const result = await f.bridge.present(78);
  assert.equal(result.presented, false);
  assert.deepEqual(f.shell.state.selected, [1]);
  assert.ok(proofs.some(proof => proof.found === true && proof.presented === false &&
    proof.reason === 'The selected guest is not visibly exposed in the desktop shell.'));
  // The last visibility request may exhaust the presentation deadline before
  // replying. Both outcomes must refuse presentation after observing the cover.
  assert.match(result.reason, /exposed|visible|^Desktop bridge: request timed out$/);
  assert.deepEqual(f.shell.state.bring, []);
  assert.equal(f.requests.some(request => request.method === 'Page.bringToFront'), false);
});

test('fails closed when shell markers are missing even if another tab is visible', async t => {
  const f = await presentationFixture(t);
  f.shell.views[1].closest('[data-sidebar-right-tab]').removeAttribute('data-sidebar-right-occurrence');
  const result = await f.bridge.present(78);
  assert.equal(result.presented, false);
  assert.match(result.reason, /occurrence/);
  assert.deepEqual(f.shell.state.selected, []);
  assert.deepEqual(f.shell.state.bring, []);
});

test('rechecks visibility after bringToFront and refuses a false success', async t => {
  const f = await presentationFixture(t, {}, { onBring: shell => { shell.document.visibilityState = 'hidden'; } });
  const result = await f.bridge.present(78);
  assert.equal(result.presented, false);
  assert.match(result.reason, /not visible/);
  assert.deepEqual(f.shell.state.bring, [78]);
});

test('missing guests are reported without any shell or guest mutation', async t => {
  const f = await presentationFixture(t);
  assert.equal((await f.bridge.present(12345)).presented, false);
  assert.deepEqual(f.requests, [{ op: 'list' }]);
});


test('production scoping excludes another profile even when URLs and titles are equal', async t => {
  const all = [
    { id: 1, type: 'window', url: 'http://127.0.0.1:54321/session/a' },
    { id: 2, type: 'window', url: 'http://127.0.0.1:54322/session/b' },
    { id: 77, type: 'webview', url: 'https://same.example/' },
    { id: 78, type: 'webview', url: 'https://same.example/' },
  ];
  const f = await fixture(t, request => {
    if (request.op === 'list') return { ok: true, guests: all };
    if (request.method === 'Runtime.evaluate' && request.id === 1) {
      const context = { location: { origin: 'http://127.0.0.1:54321' }, document: {
        querySelectorAll: () => [{ getWebContentsId: () => 77 }],
      } };
      return evaluated(runInNewContext(request.params.expression, context));
    }
    if (request.method === 'Page.navigate' && request.id === 77) return { ok: true, result: {} };
    throw new Error('Must not operate on another profile');
  }, { bridge: { profileUrl: 'http://127.0.0.1:54321/nested/', requireProfile: true } });
  assert.deepEqual((await f.bridge.list()).map(guest => guest.id), [77]);
  await f.bridge.navigate(77, 'https://proxy.example/article');
  await assert.rejects(f.bridge.navigate(78, 'https://proxy.example/article'), { code: 'EPROFILE' });
  await assert.rejects(f.bridge.evaluate(78, 'location.href'), { code: 'EPROFILE' });
  assert.equal(f.requests.some(request => request.id === 2 || request.id === 78), false);
});

test('production scoping fails closed without the active profile URL', async t => {
  const f = await fixture(t, () => ({ ok: true, guests }), { bridge: { requireProfile: true } });
  assert.equal(await f.bridge.discover(), false);
  await assert.rejects(f.bridge.list(), { code: 'EPROFILE' });
  assert.equal(f.requests.length, 0);
});


test('profile scope can bind after server startup and clears stale guest authorization', async t => {
  let currentUrl;
  const all = [
    { id: 1, type: 'window', url: 'http://127.0.0.1:54321/' },
    { id: 77, type: 'webview', url: 'https://same.example/' },
  ];
  const f = await fixture(t, request => request.op === 'list'
    ? { ok: true, guests: all } : evaluated([77]),
  { bridge: { profileUrl: () => currentUrl, requireProfile: true } });
  assert.equal(await f.bridge.discover(), false);
  currentUrl = 'http://127.0.0.1:54321';
  assert.equal(await f.bridge.discover(), true);
  assert.deepEqual((await f.bridge.list()).map(guest => guest.id), [77]);
  currentUrl = undefined;
  await assert.rejects(f.bridge.navigate(77, 'https://proxy.example/'), { code: 'EPROFILE' });
  assert.equal(await f.bridge.discover(), false);
});
