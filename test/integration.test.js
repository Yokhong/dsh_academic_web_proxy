import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_HOSTNAMES } from '../src/default-hostnames.js';
import { createHandlers, installRoutes } from '../src/routes.js';
import { registerAcademicTools } from '../src/tools.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { DEFAULT_SETTINGS } from '../src/settings.js';
import { apply, inject } from '../src/index.js';
import { resolve } from 'node:path';

test('default domains exactly match the public hostname fixture', async () => {
  const hosts = JSON.parse(await readFile(new URL('./fixtures/default-hostnames.json', import.meta.url), 'utf8'));
  assert.deepEqual([...DEFAULT_HOSTNAMES], hosts);
  assert.equal(hosts.length, 47);
});

test('tools compile against the actual installed DSH SDK and render output', async () => {
  const definitions = [];
  registerAcademicTools({ tools: { register: definition => definitions.push(definition) } }, {
    monitor: { status: () => ({ mode: 'unconfigured', pending: [] }) },
    settings: () => DEFAULT_SETTINGS,
    defineTool,
  });
  assert.deepEqual(definitions.map(tool => tool.name), ['academic_proxy_status', 'academic_proxy_open', 'academic_proxy_check', 'academic_proxy_download']);
  for (const definition of definitions) {
    assert.equal(definition.parameters.type, 'object');
    assert.equal(definition.output.render({}, { status: 'ready' })[0].type, 'text');
  }
  const result = await definitions[0].execute({}, {});
  assert.equal(result.configured, false);
  await assert.rejects(definitions[1].execute({}, {}));
});

function handlers() {
  let revision = 0, settings = { ...DEFAULT_SETTINGS }, configured = 0;
  const store = { get: () => settings, get revision() { return revision; }, async save(next, opts) {
    if (opts.revision !== revision) throw Object.assign(new Error('Conflict'), { statusCode: 409 });
    settings = next; revision++;
  } };
  const monitor = { status: () => ({ mode: 'unconfigured', pending: [] }), configure: () => { configured++; }, tick: async () => {}, present: async id => ({ presented: true, id }) };
  return { routes: createHandlers({ store, monitor, ready: Promise.resolve() }), count: () => configured };
}
const request = (body, method = 'POST') => new Request('http://localhost/api/dsh-academic-web-proxy/settings', { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('settings routes return blank defaults, enforce revisions and save the same contract', async () => {
  const { routes, count } = handlers();
  const initial = await (await routes.settings(request(undefined, 'GET'))).json();
  assert.equal(initial.settings.loginUrlScheme, '');
  assert.equal(initial.defaultHostnames.length, 47);
  assert.equal((await routes.settings(request({ settings: DEFAULT_SETTINGS }))).status, 400);
  const saved = await routes.settings(request({ settings: DEFAULT_SETTINGS, revision: 0 }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);
  assert.equal((await routes.settings(request({ settings: DEFAULT_SETTINGS, revision: 0 }))).status, 409);
  assert.equal(count(), 1);
});

test('plugin actions use only the authenticated host API route registry', () => {
  const registrations = [];
  installRoutes({ inject: (dependencies, callback) => {
    assert.deepEqual(dependencies, ['connection']);
    callback({ connection: { fetch: { register: route => registrations.push(route) } } });
  } }, handlers().routes);
  assert.deepEqual(registrations.map(route => [route.path, route.methods]), [
    ['/api/dsh-academic-web-proxy/settings', ['GET', 'POST']],
    ['/api/dsh-academic-web-proxy/status', ['GET']],
    ['/api/dsh-academic-web-proxy/present', ['POST']],
  ]);
});


test('persisted settings return immediately even while background browser polling waits', async () => {
  let finish;
  const blocked = new Promise(resolve => { finish = resolve; });
  let ticks = 0;
  const store = { get: () => DEFAULT_SETTINGS, revision: 0, async save() { this.revision++; } };
  const monitor = { configure() {}, status: () => ({ mode: 'starting' }), tick: () => { ticks++; return blocked; } };
  const routes = createHandlers({ store, monitor, ready: Promise.resolve() });
  let completed = false;
  const response = routes.settings(request({ settings: DEFAULT_SETTINGS, revision: 0 })).then(value => { completed = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(ticks, 1);
    assert.equal(completed, true, 'Persistence response must not wait for browser polling');
    assert.equal((await (await response).json()).revision, 1);
  } finally { finish(); }
});


test('the exported plugin mounts with real SDK tools and host-owned services', async () => {
  const disposers = [], definitions = [], routes = [], observers = [];
  const effect = callback => { const dispose = callback(); if (dispose) disposers.push(dispose); };
  const ctx = {
    get: name => name === 'profileContext' ? { dir: resolve('test/tmp/plugin-mount-empty-profile') } : undefined,
    tools: { register: definition => definitions.push(definition) },
    systemPrompt: { section: section => assert.equal(section.name, 'tool:dsh-academic-web-proxy') },
    effect,
    on: (event, callback) => observers.push([event, callback]),
    inject(dependencies, callback) {
      if (dependencies[0] === 'webServer') callback({ effect, webServer: { port: 54321 } });
      if (dependencies[0] === 'connection') callback({ connection: { fetch: { register: route => routes.push(route) } } });
    },
  };
  try {
    assert.ok(inject.includes('profileContext'));
    apply(ctx);
    const settings = await (await routes.find(route => route.path.endsWith('/settings')).fetch(request(undefined, 'GET'))).json();
    assert.equal(settings.settings.loginUrlScheme, '');
    assert.equal(definitions.length, 4);
    assert.equal(observers[0][0], 'tools/execute');
  } finally { for (const dispose of disposers.reverse()) await dispose(); }
});
