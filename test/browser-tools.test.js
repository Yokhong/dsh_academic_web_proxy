import test from 'node:test';
import assert from 'node:assert/strict';
import { bindScopeParent } from '@deepseek-ai/dsh-scope';
import { browserToolStatus, observeBrowserTools } from '../src/browser-tools.js';
import { callBrowser, registerAcademicTools } from '../src/tools.js';
import { INSPECT_PAGE_SCRIPT, DOWNLOAD_CANDIDATES_SCRIPT } from '../src/page-scripts.js';

const operations = ['open', 'execute', 'click'];
const article = 'https://dl-acm-org.proxy.example.edu/article';
const page = kind => ({ url: article, kind, title: 'Example article', readyState: 'complete' });
const inspected = value => ({ value: { ok: true, value: JSON.stringify(value) } });

function fixture(prefixes, responses = []) {
  const registered = new Set(prefixes.flatMap(prefix => operations.map(operation => prefix + operation)));
  const hidden = new Set();
  const lookups = [];
  const calls = [];
  const tools = new Map();
  const controller = new AbortController();
  const contexts = [];
  const exec = { callId: 'academic', rootCallId: 'root', token: {}, agent: { id: 'task-a' }, signal: controller.signal, deferContext: value => contexts.push(value) };
  const ctx = { tools: {
    get(name, agent) { lookups.push({ name, agent }); return registered.has(name) && !(agent && hidden.has(name)) ? { name } : undefined; },
    register(definition) { tools.set(definition.name, definition); },
    async execute(request) {
      calls.push(request);
      assert.ok(responses.length, 'unexpected dispatch');
      const response = responses.shift();
      return typeof response === 'function' ? response(request) : response;
    },
  } };
  const monitor = { busy: 0, restricted: false, ticks: 0,
    async tick() { this.ticks++; },
    status() { return { mode: 'tools-only', pending: [], automaticMonitoring: { mode: 'tools-only', taskScoped: false } }; },
    async trackCurrent() { throw new Error('unscoped bridge must not be used'); },
  };
  registerAcademicTools(ctx, { monitor, settings: () => ({ enabled: true, useDefaultHostnames: true, customHostnames: [], loginUrlScheme: '', proxiedUrlScheme: '%h.proxy.example.edu/%p' }), defineTool: value => value });
  return { ctx, exec, controller, contexts, registered, hidden, calls, lookups, monitor, tools,
    run: (name, args = {}) => tools.get(name).execute(args, exec) };
}

for (const prefix of ['browser_', 'dsh_browser_']) {
  test(`${prefix} supports status and check without assuming an automatic bridge`, async () => {
    const environment = fixture([prefix], [inspected(page('ready'))]);
    const status = await environment.run('academic_proxy_status');
    assert.equal(status.mode, 'tools-only');
    assert.equal(status.toolCompatibility.mode, 'registered');
    assert.equal(status.toolCompatibility.prefix, prefix);
    assert.equal(status.toolCompatibility.scope, 'task');
    assert.equal(status.toolCompatibility.providerVerified, false);
    assert.equal(environment.calls.length, 0);
    const result = await environment.run('academic_proxy_check');
    assert.equal(result.humanRequired, false);
    assert.deepEqual(environment.calls.map(call => call.name), [prefix + 'execute']);
  });

  test(`${prefix} opens through the registry in the same caller scope`, async () => {
    const environment = fixture([prefix], [{ value: { url: article } }, inspected(page('ready'))]);
    const result = await environment.run('academic_proxy_open', { url: 'https://dl.acm.org/article' });
    assert.equal(result.proxied, true);
    assert.deepEqual(environment.calls.map(call => call.name), [prefix + 'open', prefix + 'execute']);
    assert.equal(environment.calls[0].arguments.url, article);
    for (const call of environment.calls) {
      assert.equal(call.rootCallId, environment.exec.rootCallId);
      assert.strictEqual(call.parent, environment.exec.token);
      assert.strictEqual(call.agent, environment.exec.agent);
      assert.strictEqual(call.signal, environment.exec.signal);
    }
  });

  test(`${prefix} clicks only a discovered control and does not claim saved`, async () => {
    const candidates = { url: article, candidates: [{ selector: '#pdf', label: 'PDF', score: 9 }], framesPresent: false };
    const environment = fixture([prefix], [inspected(page('ready')), inspected(candidates), inspected(page('ready')), { value: { ok: true, value: article } }, { value: { clicked: true } }]);
    const result = await environment.run('academic_proxy_download');
    assert.equal(result.status, 'clicked');
    assert.match(result.message, /不代表文件已保存成功/);
    assert.deepEqual(environment.calls.map(call => call.name), Array(4).fill(prefix + 'execute').concat(prefix + 'click'));
    assert.equal(environment.calls[1].arguments.script, DOWNLOAD_CANDIDATES_SCRIPT);
    assert.equal(environment.calls[2].arguments.script, INSPECT_PAGE_SCRIPT);
    assert.deepEqual(environment.calls[4].arguments, { target: { by: 'css', value: '#pdf' } });
  });

  for (const kind of ['login', 'challenge']) {
    test(`${prefix} stops at ${kind} without marker, candidates, click or retry`, async () => {
      const environment = fixture([prefix], [inspected(page(kind))]);
      assert.equal((await environment.run('academic_proxy_download')).status, 'human-required');
      assert.equal(environment.calls.length, 1);
    });
    test(`${prefix} catches same-URL ${kind} immediately before a click even without renaming`, async () => {
      const environment = fixture([prefix], [inspected(page('ready')), inspected({ url: article, candidates: [{ selector: '#pdf', score: 9 }] }), inspected(page(kind))]);
      assert.equal((await environment.run('academic_proxy_download')).status, 'human-required');
      assert.equal(environment.calls.length, 3);
      assert.equal(environment.calls.some(call => call.name.endsWith('_click')), false);
    });
  }
}

test('missing or negative click confirmation cannot be reported as a click', async () => {
  for (const clicked of [undefined, {}, { clicked: false }]) {
    const environment = fixture(['dsh_browser_'], [inspected(page('ready')), inspected({ url: article, candidates: [{ selector: '#pdf', score: 9 }] }), inspected(page('ready')), { value: { ok: true, value: article } }, { value: clicked }]);
    await assert.rejects(environment.run('academic_proxy_download'), /未能点击/);
    assert.equal(environment.calls.length, 5);
  }
});

test('modern family wins and a hidden modern operation never falls back to legacy', async () => {
  const environment = fixture(['dsh_browser_', 'browser_'], [{ value: 1 }]);
  await callBrowser(environment.ctx, environment.exec, 'browser_execute', {});
  assert.equal(environment.calls[0].name, 'dsh_browser_execute');
  environment.hidden.add('dsh_browser_click');
  await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_click', {}), /不会绕过限制/);
  assert.equal(environment.calls.length, 1);
});

test('an entirely hidden modern family cannot expose a globally registered legacy fallback', async () => {
  const environment = fixture(['dsh_browser_', 'browser_']);
  for (const operation of operations) environment.hidden.add('dsh_browser_' + operation);
  assert.equal(browserToolStatus(environment.ctx, environment.exec.agent).prefix, 'dsh_browser_');
  await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_open', {}), /不会绕过限制/);
  assert.equal(environment.calls.length, 0);
});

test('inherited modern registrations hidden from the task cannot select global legacy tools', async () => {
  const environment = fixture(['browser_']);
  const preset = {};
  bindScopeParent(environment.exec.agent, preset);
  const originalGet = environment.ctx.tools.get;
  environment.ctx.tools.get = (name, scope) => scope === preset && name.startsWith('dsh_browser_') ? { name } : originalGet(name, scope);
  const status = browserToolStatus(environment.ctx, environment.exec.agent);
  assert.equal(status.prefix, 'dsh_browser_');
  assert.equal(status.mode, 'partial');
  assert.deepEqual(status.available, []);
  await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_click', {}), /不会绕过限制/);
  assert.equal(environment.calls.length, 0);
});

test('denials, provider errors and cancellation do not trigger alternate-name retry', async () => {
  for (const response of [{ isError: true, content: [{ type: 'text', text: 'Policy denied' }] }, () => { throw new Error('BROWSER_PROVIDER_UNAVAILABLE'); }]) {
    const environment = fixture(['dsh_browser_', 'browser_'], [response]);
    await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_execute', {}));
    assert.equal(environment.calls.length, 1);
    assert.equal(environment.calls[0].name, 'dsh_browser_execute');
  }
  const environment = fixture(['dsh_browser_']);
  const reason = new Error('cancelled');
  environment.controller.abort(reason);
  await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_click', {}), error => error === reason);
  assert.equal(environment.lookups.length, 0);
  assert.equal(environment.calls.length, 0);
});

test('a family change mid-operation fails closed without opening a second session', async () => {
  const environment = fixture(['browser_'], [{ value: 1 }]);
  await callBrowser(environment.ctx, environment.exec, 'browser_execute', {});
  for (const operation of operations) environment.registered.add('dsh_browser_' + operation);
  await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_click', {}), /配置已改变/);
  assert.equal(environment.calls.length, 1);
});

test('missing registry capability is explicit and status creates no browser session', async () => {
  const environment = fixture([]);
  assert.equal((await environment.run('academic_proxy_status')).toolCompatibility.mode, 'unavailable');
  await assert.rejects(callBrowser(environment.ctx, environment.exec, 'browser_execute', {}), /未提供/);
  delete environment.ctx.tools.get;
  assert.equal(browserToolStatus(environment.ctx).mode, 'unavailable');
  assert.equal(environment.calls.length, 0);
});

function observer() {
  let handler;
  const monitor = { busy: 0, restricted: false };
  observeBrowserTools({ on(event, callback) { assert.equal(event, 'tools/execute'); handler = callback; } }, monitor, Promise.resolve());
  return { monitor, run: (name, agent, allowed, next = async () => ({ value: {} })) => handler({ name, agent, arguments: { allowed } }, next) };
}

for (const prefix of ['dsh_browser_']) {
  test(`${prefix} observer pauses, restores busy and tracks restrictions per task`, async () => {
    const environment = observer();
    let dispose;
    const first = { id: 'first', ctx: { effect(callback) { dispose = callback(); } } };
    const second = { id: 'second' };
    await environment.run(prefix + 'open', first, undefined, async () => {
      assert.equal(environment.monitor.busy, 1);
      return { value: {} };
    });
    assert.equal(environment.monitor.busy, 0);
    await environment.run(prefix + 'restrict', first, [prefix + 'snapshot']);
    await environment.run(prefix + 'restrict', second, [prefix + 'snapshot']);
    await environment.run(prefix + 'restrict', second, []);
    assert.equal(environment.monitor.restricted, true);
    dispose();
    assert.equal(environment.monitor.restricted, false);
    await environment.run(prefix + 'restrict', first, ['only'], async () => ({ isError: true }));
    assert.equal(environment.monitor.restricted, false);
    await assert.rejects(environment.run(prefix + 'execute', first, undefined, async () => { throw new Error('denied'); }), /denied/);
    assert.equal(environment.monitor.busy, 0);
  });
}

test('legacy restrictions stay global until any task explicitly clears them', async () => {
  const environment = observer();
  const disposers = [];
  const first = { id: 'first', ctx: { effect(callback) { disposers.push(callback()); } } };
  const second = { id: 'second' };
  await environment.run('browser_open', first, undefined, async () => {
    assert.equal(environment.monitor.busy, 1);
    return { value: {} };
  });
  await environment.run('browser_restrict', first, ['browser_snapshot']);
  assert.equal(environment.monitor.restricted, true);
  assert.equal(disposers.length, 0);
  await environment.run('browser_restrict', second, []);
  assert.equal(environment.monitor.restricted, false);
  await environment.run('browser_restrict', first, ['browser_snapshot']);
  await environment.run('dsh_browser_restrict', first, ['dsh_browser_snapshot']);
  for (const dispose of disposers) dispose();
  assert.equal(environment.monitor.restricted, true);
  await environment.run('browser_restrict', second, [], async () => ({ isError: true }));
  assert.equal(environment.monitor.restricted, true);
  await environment.run('browser_restrict', second, []);
  assert.equal(environment.monitor.restricted, false);
  assert.equal(environment.monitor.busy, 0);
});

test('an outer academic operation keeps monitoring paused between nested calls', async () => {
  const environment = observer();
  await environment.run('academic_proxy_download', { id: 'task' }, undefined, async () => {
    assert.equal(environment.monitor.busy, 1);
    await environment.run('dsh_browser_execute', { id: 'task' });
    assert.equal(environment.monitor.busy, 1);
    return { value: {} };
  });
  assert.equal(environment.monitor.busy, 0);
});
