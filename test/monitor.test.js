import test from 'node:test';
import assert from 'node:assert/strict';
import { ProxyMonitor } from '../src/monitor.js';
import { INSPECT_PAGE_SCRIPT } from '../src/page-scripts.js';

const settings = overrides => ({
  enabled: true, useDefaultHostnames: true, customHostnames: [],
  loginUrlScheme: '', proxiedUrlScheme: '%h.proxy.example.edu/%p',
  ...overrides,
});

const guest = (id, url, overrides = {}) => ({ id, url, type: 'webview', destroyed: false, ...overrides });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

class FakeBridge {
  constructor(guests = []) {
    this.guests = guests.map(value => ({ ...value }));
    this.pages = new Map();
    this.calls = [];
  }
  find(id) { return this.guests.find(value => value.id === id); }
  callsOf(name) { return this.calls.filter(call => call.name === name); }
  setPage(id, page) {
    if (page.url) this.find(id).url = page.url;
    this.pages.set(id, { title: 'Article', kind: 'ready', readyState: 'complete', ...page });
  }
  async discover() {
    this.calls.push({ name: 'discover' });
    return this.discoverImpl ? this.discoverImpl() : true;
  }
  async list() {
    this.calls.push({ name: 'list' });
    return this.listImpl ? this.listImpl() : this.guests.map(value => ({ ...value }));
  }
  async evaluate(id, script) {
    this.calls.push({ name: 'evaluate', id, script });
    if (this.evaluateImpl) return this.evaluateImpl(id, script);
    const current = this.find(id);
    if (!current) throw new Error('guest closed');
    if (script === 'location.href') return current.url;
    assert.equal(script, INSPECT_PAGE_SCRIPT, 'only the safe inspection script should run');
    return { url: current.url, title: 'Article', kind: 'ready', readyState: 'complete', ...this.pages.get(id) };
  }
  async navigate(id, url) {
    this.calls.push({ name: 'navigate', id, url });
    if (this.navigateImpl) return this.navigateImpl(id, url);
    this.find(id).url = url;
    this.pages.delete(id);
  }
  async present(id) {
    this.calls.push({ name: 'present', id });
    return this.presentImpl ? this.presentImpl(id) : { presented: true, id };
  }
  async close() { this.calls.push({ name: 'close' }); }
}

function setup(guests = [], overrides = {}, options = {}) {
  const bridge = new FakeBridge(guests);
  let config = settings(overrides);
  const monitor = new ProxyMonitor({ bridge, settings: () => config, ...options });
  return { bridge, monitor, updateSettings: next => { config = settings(next); monitor.configure(); } };
}

test('automatic redirects reach every matching live webview, including inactive tabs, and no other guests', async () => {
  const { bridge, monitor } = setup([
    guest(1, 'https://dl.acm.org/doi/paper'),
    guest(2, 'https://www.nature.com/articles/paper', { active: false }),
    guest(3, 'http://papers.custom.example/article'),
    guest(4, 'https://www.unrelated.example/article'),
    guest(5, 'https://dl.acm.org/other', { type: 'window' }),
    guest(6, 'https://dl.acm.org/closed', { destroyed: true }),
    guest(7, 'about:blank'),
    guest(8, 'https://dl.acm.org/devtools', { type: 'remote' }),
  ], { customHostnames: ['papers.custom.example'] });
  await monitor.tick();
  assert.deepEqual(bridge.callsOf('navigate'), [
    { name: 'navigate', id: 1, url: 'https://dl-acm-org.proxy.example.edu/doi/paper' },
    { name: 'navigate', id: 2, url: 'https://www-nature-com.proxy.example.edu/articles/paper' },
    { name: 'navigate', id: 3, url: 'http://papers.custom.example.proxy.example.edu/article' },
  ]);
  assert.deepEqual(bridge.callsOf('evaluate').map(call => call.id), [1, 2, 3]);
  await monitor.tick();
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 3, 'proxied pages must not be nested on later scans');
  assert.equal(monitor.status().mode, 'desktop-bridge');
});

test('the immediate URL recheck prevents a user navigation race', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')]);
  bridge.evaluateImpl = async (id, script) => {
    assert.equal(script, 'location.href');
    bridge.find(id).url = 'https://user-selected.example/new-page';
    return bridge.find(id).url;
  };
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 0);
  assert.equal(bridge.find(1).url, 'https://user-selected.example/new-page');
});

test('an abandoned URL recheck does not permanently suppress a later visit to the same article', async () => {
  let now = 1000;
  const original = 'https://dl.acm.org/article';
  const { bridge, monitor } = setup([guest(1, original)], {}, { now: () => now });
  bridge.evaluateImpl = async id => {
    bridge.find(id).url = 'https://user-selected.example/new-page';
    return bridge.find(id).url;
  };
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 0);
  bridge.evaluateImpl = undefined;
  bridge.find(1).url = original;
  now += 30_000;
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 1,
    'the attempt should be committed only once a navigation is actually dispatched');
});

test('busy or restricted state acquired during the final URL read prevents mutation', async () => {
  for (const state of ['busy', 'restricted']) {
    const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')]);
    bridge.evaluateImpl = async id => {
      monitor[state] = state === 'busy' ? 1 : true;
      return bridge.find(id).url;
    };
    await monitor.tick();
    assert.equal(bridge.callsOf('navigate').length, 0, state);
  }
});

test('login and challenge handoffs present the same guest and do not repeatedly retrigger', async () => {
  const { bridge, monitor } = setup([guest(17, 'https://dl.acm.org/article')]);
  await monitor.tick();
  const loginUrl = 'https://idp.university.example/login?ticket=secret#private';
  bridge.setPage(17, { url: loginUrl, kind: 'login', title: 'Sign in' });
  await monitor.tick();
  const login = monitor.status().pending[0];
  assert.equal(login.id, 17);
  assert.equal(login.kind, 'login');
  assert.equal(login.presented, true);
  assert.equal(login.displayUrl, 'https://idp.university.example/login');
  assert.doesNotMatch(JSON.stringify(monitor.status()), /ticket=secret|#private/);
  for (let scan = 0; scan < 5; scan++) await monitor.tick();
  assert.deepEqual(bridge.callsOf('present'), [{ name: 'present', id: 17 }]);
  bridge.setPage(17, { url: `${loginUrl}-changed`, kind: 'login' });
  await monitor.tick();
  assert.equal(bridge.callsOf('present').length, 1, 'query and fragment changes must not create repeated handoffs');
  bridge.setPage(17, { url: 'https://idp.university.example/verify?token=hidden', kind: 'challenge' });
  await monitor.tick();
  assert.equal(monitor.status().pending[0].kind, 'challenge');
  assert.deepEqual(bridge.callsOf('present').map(call => call.id), [17, 17]);
  for (let scan = 0; scan < 5; scan++) await monitor.tick();
  assert.equal(bridge.callsOf('present').length, 2);
  assert.equal(bridge.callsOf('navigate').length, 1);
  assert.equal(bridge.guests.length, 1);
});

test('already-open related login and challenge guests are detected without a preceding redirect', async () => {
  const { bridge, monitor } = setup([
    guest(1, 'https://login.example.edu/sso'),
    guest(2, 'https://dl-acm-org.proxy.example.edu/challenge'),
  ], { loginUrlScheme: 'https://login.example.edu/login?url=%u' });
  bridge.setPage(1, { kind: 'login' });
  bridge.setPage(2, { kind: 'challenge' });
  await monitor.tick();
  assert.deepEqual(monitor.status().pending.map(({ id, kind }) => ({ id, kind })), [
    { id: 1, kind: 'login' }, { id: 2, kind: 'challenge' },
  ]);
  assert.deepEqual(bridge.callsOf('present').map(call => call.id), [1, 2]);
  assert.equal(bridge.callsOf('navigate').length, 0);
});

test('a completed human interaction clears pending state, while a still-loading page retains it', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl-acm-org.proxy.example.edu/article')]);
  bridge.setPage(1, { kind: 'challenge' });
  await monitor.tick();
  assert.equal(monitor.status().pending.length, 1);
  const snapshot = monitor.status();
  snapshot.pending[0].message = 'mutated externally';
  snapshot.pending.length = 0;
  assert.equal(monitor.status().pending.length, 1);
  assert.notEqual(monitor.status().pending[0].message, 'mutated externally');
  bridge.setPage(1, { kind: 'ready', readyState: 'loading' });
  await monitor.tick();
  assert.equal(monitor.status().pending.length, 1);
  bridge.setPage(1, { kind: 'ready', readyState: 'complete' });
  await monitor.tick();
  assert.deepEqual(monitor.status().pending, []);
  assert.equal(bridge.callsOf('present').length, 1);
  assert.equal(bridge.callsOf('navigate').length, 0);
});

test('a proxy returning to the original URL clears pending without a redirect loop even after cooldown', async () => {
  let now = 1000;
  const original = 'https://dl.acm.org/article?doi=1#abstract';
  const { bridge, monitor } = setup([guest(1, original)], {}, { now: () => now });
  await monitor.tick();
  bridge.setPage(1, { kind: 'login' });
  await monitor.tick();
  assert.equal(monitor.status().pending.length, 1);
  bridge.setPage(1, { url: original, kind: 'ready' });
  for (let scan = 0; scan < 8; scan++) {
    now += 60_000;
    await monitor.tick();
  }
  assert.equal(bridge.callsOf('navigate').length, 1);
  assert.deepEqual(monitor.status().pending, []);
  assert.equal(bridge.callsOf('present').length, 1);
});

test('same-host new articles obey cooldown, and can redirect once it expires', async () => {
  let now = 1000;
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/one')], {}, { now: () => now });
  await monitor.tick();
  bridge.find(1).url = 'https://dl.acm.org/two';
  now += 29_999;
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 1);
  now += 1;
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 2);
  assert.equal(bridge.callsOf('navigate')[1].url, 'https://dl-acm-org.proxy.example.edu/two');
});

test('busy and restricted monitors yield before discovery, then resume when released', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')]);
  monitor.busy = 1;
  await monitor.tick();
  assert.deepEqual(bridge.calls, []);
  monitor.busy = 0;
  monitor.restricted = true;
  await monitor.tick();
  assert.deepEqual(bridge.calls, []);
  assert.equal(monitor.status().mode, 'restricted');
  monitor.restricted = false;
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 1);
});

test('restrictions acquired while scanning the first tab yield before the next tab', async () => {
  const { bridge, monitor } = setup([
    guest(1, 'https://dl.acm.org/article'), guest(2, 'https://www.nature.com/article'),
  ]);
  bridge.navigateImpl = async (id, url) => {
    bridge.find(id).url = url;
    monitor.restricted = true;
  };
  await monitor.tick();
  assert.deepEqual(bridge.callsOf('navigate').map(call => call.id), [1]);
  assert.deepEqual(bridge.callsOf('evaluate').map(call => call.id), [1]);
});

test('disabled, unconfigured and unavailable states do not use browser operations', async () => {
  for (const [overrides, mode] of [[{ enabled: false }, 'disabled'], [{ proxiedUrlScheme: '' }, 'unconfigured']]) {
    const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')], overrides);
    await monitor.tick();
    assert.equal(monitor.status().mode, mode);
    assert.deepEqual(bridge.calls, []);
  }
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')]);
  bridge.discoverImpl = async () => false;
  await monitor.tick();
  assert.equal(monitor.status().mode, 'unavailable');
  assert.deepEqual(bridge.calls.map(call => call.name), ['discover']);
});

test('stale inspection results cannot present or clear a different current page', async () => {
  const url = 'https://dl-acm-org.proxy.example.edu/article';
  const { bridge, monitor } = setup([guest(1, url)]);
  bridge.evaluateImpl = async () => ({ url: 'https://other.example/login', kind: 'login', readyState: 'complete' });
  await monitor.tick();
  assert.deepEqual(monitor.status().pending, []);
  assert.equal(bridge.callsOf('present').length, 0);
  bridge.evaluateImpl = undefined;
  bridge.setPage(1, { kind: 'challenge' });
  await monitor.tick();
  bridge.evaluateImpl = async () => ({ url: 'https://other.example/article', kind: 'ready', readyState: 'complete' });
  await monitor.tick();
  assert.equal(monitor.status().pending.length, 1);
});

test('manual presentation accepts only pending guests and reports an unconfirmed automatic presentation', async () => {
  const { bridge, monitor } = setup([guest(4, 'https://dl-acm-org.proxy.example.edu/article')]);
  bridge.setPage(4, { kind: 'login' });
  bridge.presentImpl = async () => ({ presented: false });
  await monitor.tick();
  assert.equal(monitor.status().pending[0].presented, false);
  assert.match(monitor.status().pending[0].message, /自动展示未确认/);
  await monitor.tick();
  assert.equal(bridge.callsOf('present').length, 1);
  await assert.rejects(() => monitor.present(99));
  assert.equal(bridge.callsOf('present').length, 1);
  bridge.presentImpl = async id => ({ presented: true, id });
  assert.deepEqual(await monitor.present(4), { presented: true, id: 4 });
  assert.equal(monitor.status().pending[0].presented, true);
});

test('closed guests and reconfiguration clean tracked, pending and cooldown state', async () => {
  const { bridge, monitor, updateSettings } = setup([guest(1, 'https://dl.acm.org/article')]);
  await monitor.tick();
  bridge.setPage(1, { kind: 'login' });
  await monitor.tick();
  assert.equal(monitor.tabs.size, 1);
  assert.equal(monitor.pending.size, 1);
  bridge.guests = [];
  await monitor.tick();
  assert.equal(monitor.tabs.size, 0);
  assert.equal(monitor.pending.size, 0);
  bridge.guests = [guest(2, 'https://www.nature.com/article')];
  await monitor.tick();
  bridge.setPage(2, { kind: 'challenge' });
  await monitor.tick();
  assert.ok(monitor.guard.entries.size);
  updateSettings({ useDefaultHostnames: false, customHostnames: ['new.example'] });
  assert.equal(monitor.tabs.size, 0);
  assert.equal(monitor.pending.size, 0);
  assert.equal(monitor.guard.entries.size, 0);
  assert.equal(monitor.rules.decide('https://www.nature.com/article').reason, 'unmatched-host');
  assert.equal(monitor.rules.decide('https://new.example/article').action, 'redirect');
});

test('a closing guest failure does not prevent other tabs from being scanned', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article'), guest(2, 'https://www.nature.com/article')]);
  bridge.evaluateImpl = async id => {
    if (id === 1) throw new Error('guest disappeared');
    return bridge.find(id).url;
  };
  await monitor.tick();
  assert.deepEqual(bridge.callsOf('navigate').map(call => call.id), [2]);
});

test('concurrent ticks coalesce one scan, and stop cancels the bridge then waits for completion', async () => {
  const gate = deferred();
  const { bridge, monitor } = setup();
  bridge.discoverImpl = () => gate.promise;
  const first = monitor.tick();
  const second = monitor.tick();
  assert.equal(bridge.callsOf('discover').length, 1);
  const stopping = monitor.stop();
  assert.equal(bridge.callsOf('close').length, 1);
  gate.resolve(true);
  await Promise.all([first, second, stopping]);
  assert.equal(bridge.callsOf('list').length, 0);
  assert.equal(bridge.callsOf('close').length, 1);
  assert.equal(monitor.flight, null);
  assert.equal(monitor.stopped, true);
  assert.equal(monitor.tabs.size, 0);
  assert.equal(monitor.pending.size, 0);
});

test('start is idempotent and stop clears lifecycle state and polling', async t => {
  const { bridge, monitor } = setup([guest(1, 'https://dl-acm-org.proxy.example.edu/article')], {}, { intervalMs: 60_000 });
  t.after(() => monitor.stop());
  bridge.setPage(1, { kind: 'login' });
  monitor.start();
  monitor.start();
  await settle();
  assert.equal(bridge.callsOf('list').length, 1);
  assert.equal(monitor.pending.size, 1);
  assert.ok(monitor.timer);
  await monitor.stop();
  assert.equal(monitor.stopped, true);
  assert.equal(monitor.pending.size, 0);
  assert.equal(monitor.tabs.size, 0);
  const scans = bridge.callsOf('list').length;
  await settle();
  assert.equal(bridge.callsOf('list').length, scans);
  assert.equal(bridge.callsOf('close').length, 1);
});

test('background discovery errors report unavailable and can be stopped cleanly', async t => {
  const { bridge, monitor } = setup([], {}, { intervalMs: 60_000 });
  t.after(() => monitor.stop());
  bridge.discoverImpl = async () => { throw new Error('bridge unavailable'); };
  monitor.start();
  await settle();
  assert.equal(monitor.status().mode, 'unavailable');
  await monitor.stop();
  assert.equal(monitor.flight, null);
  assert.equal(monitor.stopped, true);
});


test('changing or disabling settings invalidates an in-flight page recheck', async () => {
  const { bridge, monitor, updateSettings } = setup([guest(1, 'https://dl.acm.org/article')]);
  const pending = deferred();
  bridge.evaluateImpl = () => pending.promise;
  const tick = monitor.tick();
  await settle();
  updateSettings({ enabled: false });
  pending.resolve('https://dl.acm.org/article');
  await tick;
  assert.equal(bridge.callsOf('navigate').length, 0);
  assert.deepEqual(monitor.status().pending, []);
});

test('an already proxied page remains tracked through an external SSO redirect', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl-acm-org.proxy.example.edu/article')]);
  await monitor.tick();
  bridge.setPage(1, { url: 'https://institution-sso.example/login', kind: 'login' });
  await monitor.tick();
  assert.equal(bridge.callsOf('present').length, 1);
  assert.equal(monitor.status().pending[0].kind, 'login');
});

test('marking a tool-opened page binds the exact guest rather than the first equal URL', async () => {
  const url = 'https://institution-sso.example/login';
  const { bridge, monitor } = setup([guest(1, url), guest(2, url)]);
  bridge.evaluateImpl = async (id, expression) => expression === INSPECT_PAGE_SCRIPT
    ? { url, kind: 'login', readyState: 'complete' }
    : (id === 2 ? url : null);
  await monitor.trackCurrent('unit-test-marker', { url }, 'https://dl.acm.org/article');
  assert.deepEqual(bridge.callsOf('present').map(call => call.id), [2]);
  assert.equal(monitor.status().pending[0].id, 2);
});


test('unload while bridge discovery waits cannot navigate or present afterwards', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')]);
  const pending = deferred();
  bridge.discoverImpl = () => pending.promise;
  const tick = monitor.tick();
  const stop = monitor.stop();
  pending.resolve(true);
  await Promise.all([tick, stop]);
  assert.equal(bridge.callsOf('list').length, 0);
  assert.equal(bridge.callsOf('navigate').length, 0);
  await monitor.tick();
  assert.equal(bridge.callsOf('discover').length, 1);
});

test('unload while guest listing waits cannot create a new scan generation', async () => {
  const { bridge, monitor } = setup([guest(1, 'https://dl.acm.org/article')]);
  const pending = deferred();
  bridge.listImpl = () => pending.promise;
  const tick = monitor.tick();
  await settle();
  const stop = monitor.stop();
  pending.resolve(bridge.guests);
  await Promise.all([tick, stop]);
  assert.equal(bridge.callsOf('evaluate').length, 0);
  assert.equal(bridge.callsOf('navigate').length, 0);
});

test('tool page tracking cannot resume after unload during discovery', async () => {
  const url = 'https://institution-sso.example/login';
  const { bridge, monitor } = setup([guest(1, url)]);
  const pending = deferred();
  bridge.discoverImpl = () => pending.promise;
  const track = monitor.trackCurrent('marker', { url });
  await monitor.stop();
  pending.resolve(true);
  await track;
  assert.equal(bridge.callsOf('list').length, 0);
  assert.equal(bridge.callsOf('present').length, 0);
});


test('returning to the original publisher suppresses loops but still hands off CAPTCHA', async () => {
  const source = 'https://dl.acm.org/article';
  const { bridge, monitor } = setup([guest(1, source)]);
  await monitor.tick();
  bridge.setPage(1, { url: source, kind: 'challenge' });
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 1);
  assert.equal(bridge.callsOf('present').length, 1);
  assert.equal(monitor.status().pending[0].kind, 'challenge');
});


test('a returned original article remains loop-suppressed beyond the SSO inspection TTL', async () => {
  let now = 0;
  const source = 'https://dl.acm.org/article';
  const { bridge, monitor } = setup([guest(1, source)], {}, { now: () => now });
  await monitor.tick();
  bridge.setPage(1, { url: source, kind: 'ready' });
  now = 11 * 60_000;
  await monitor.tick();
  now = 12 * 60_000;
  await monitor.tick();
  assert.equal(bridge.callsOf('navigate').length, 1);
});
