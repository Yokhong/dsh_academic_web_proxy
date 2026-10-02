import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { callBrowser, registerAcademicTools } from '../src/tools.js';
import { INSPECT_PAGE_SCRIPT, DOWNLOAD_CANDIDATES_SCRIPT } from '../src/page-scripts.js';

const ARTICLE_URL = 'https://dl-acm-org.proxy.example.edu/doi/article';
const readyPage = overrides => ({ url: ARTICLE_URL, title: 'A real article', kind: 'ready', readyState: 'complete', ...overrides });
const inspected = page => ({ value: { ok: true, value: typeof page === 'string' ? page : JSON.stringify(page) } });
const candidate = (selector = '#download-pdf', score = 9, label = 'Download article PDF') => ({ selector, score, label, frame: null });
const found = (candidates, overrides = {}) => inspected({ url: ARTICLE_URL, candidates, framesPresent: false, ...overrides });

function harness(responses = [], overrides = {}) {
  const tools = new Map();
  const calls = [];
  const deferredContexts = [];
  const controller = new AbortController();
  const config = {
    enabled: true, useDefaultHostnames: true, customHostnames: [],
    loginUrlScheme: '', proxiedUrlScheme: '%h.proxy.example.edu/%p',
    ...overrides,
  };
  const monitor = {
    ticks: 0,
    async tick() { this.ticks++; },
    status() { return { mode: 'desktop-bridge', pending: [] }; },
  };
  const exec = {
    callId: 'outer-call', rootCallId: 'root-call', token: { id: 'parent-approval-token' },
    agent: { id: 'calling-agent' }, signal: controller.signal,
    deferContext: context => deferredContexts.push(context),
  };
  const queue = [...responses];
  const ctx = {
    tools: {
      register(tool) {
        assert.equal(tools.has(tool.name), false, `duplicate registration: ${tool.name}`);
        tools.set(tool.name, tool);
      },
      async execute(request) {
        calls.push(request);
        assert.ok(queue.length, `unexpected browser registry call: ${request.name}`);
        const response = queue.shift();
        return typeof response === 'function' ? response(request) : response;
      },
    },
  };
  registerAcademicTools(ctx, { monitor, settings: () => config, defineTool: definition => definition });
  return {
    tools, calls, exec, controller, ctx, monitor, deferredContexts, queue,
    run: (name, args = {}) => tools.get(name).execute(args, exec),
  };
}

function assertNestedContext(h) {
  for (const call of h.calls) {
    assert.match(call.callId, /^outer-call:academic:[0-9a-f-]{36}$/);
    assert.equal(call.rootCallId, h.exec.rootCallId);
    assert.strictEqual(call.parent, h.exec.token);
    assert.strictEqual(call.agent, h.exec.agent);
    assert.strictEqual(call.signal, h.exec.signal);
  }
  assert.equal(new Set(h.calls.map(call => call.callId)).size, h.calls.length);
}

test('registration exposes four ordinary tools with serialized mutation behavior', () => {
  const h = harness();
  assert.deepEqual([...h.tools.keys()], ['academic_proxy_status', 'academic_proxy_open', 'academic_proxy_check', 'academic_proxy_download']);
  for (const [name, tool] of h.tools) {
    assert.equal(tool.timeoutMs, 60_000);
    assert.equal(tool.isConcurrencySafe(), name === 'academic_proxy_status');
    assert.equal(typeof tool.execute, 'function');
  }
});

test('nested registry calls retain parent token, root, agent, signal and deferred contexts', async () => {
  const value = { inspected: true };
  const contexts = [{ type: 'text', text: 'first context' }, { type: 'text', text: 'second context' }];
  const h = harness([{ value, additionalContexts: contexts }, { value: 42 }]);
  const args = { script: 'location.href' };
  assert.strictEqual(await callBrowser(h.ctx, h.exec, 'browser_execute', args), value);
  assert.equal(await callBrowser(h.ctx, h.exec, 'browser_execute', args), 42);
  assertNestedContext(h);
  assert.strictEqual(h.calls[0].arguments, args);
  assert.deepEqual(h.deferredContexts, contexts);
});

test('registry denials preserve their message and thrown errors propagate unchanged', async () => {
  const h = harness([{ isError: true, content: [
    { type: 'text', text: 'Policy denied browser_execute' },
    { type: 'image', data: 'irrelevant' },
    { type: 'text', text: 'browser_restrict is active' },
  ] }]);
  await assert.rejects(() => callBrowser(h.ctx, h.exec, 'browser_execute', {}), {
    message: 'Policy denied browser_execute\nbrowser_restrict is active',
  });
  const denial = new Error('approval refused');
  const thrown = harness([() => { throw denial; }]);
  await assert.rejects(() => callBrowser(thrown.ctx, thrown.exec, 'browser_click', {}), error => error === denial);
  const empty = harness([{ isError: true }]);
  await assert.rejects(() => callBrowser(empty.ctx, empty.exec, 'browser_execute', {}), /browser_execute/);
});

test('an already-aborted parent signal prevents any nested browser call', async () => {
  const h = harness();
  const reason = new Error('parent cancelled');
  h.controller.abort(reason);
  await assert.rejects(() => callBrowser(h.ctx, h.exec, 'browser_execute', {}), error => error === reason);
  assert.equal(h.calls.length, 0);
});

test('status reads monitor readiness without dispatching tools or exposing scheme strings', async () => {
  const h = harness([], { loginUrlScheme: 'https://login.example.edu/login?private-setting=secret&url=%u' });
  const result = await h.run('academic_proxy_status');
  assert.deepEqual(result, { enabled: true, configured: true, mode: 'desktop-bridge', pending: [] });
  assert.doesNotMatch(JSON.stringify(result), /private-setting|proxy\.example|login\.example/);
  assert.equal(h.calls.length, 0);
});

test('opening a matching academic URL uses browser_open with the configured proxy and newTab setting', async () => {
  const page = { url: 'browser result' };
  const h = harness([{ value: page }]);
  const result = await h.run('academic_proxy_open', { url: 'https://dl.acm.org/paper?q=1#abstract', newTab: true });
  assert.equal(result.proxied, true);
  assert.strictEqual(result.page, page);
  assert.equal(h.monitor.ticks, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, 'browser_open');
  assert.deepEqual(h.calls[0].arguments, { url: 'https://dl-acm-org.proxy.example.edu/paper?q=1#abstract', newTab: true });
  assertNestedContext(h);
});

test('opening an unmatched or already-proxied URL preserves it without nesting', async () => {
  for (const [url, proxied, reason] of [
    ['https://unrelated.example/article', false, 'unmatched-host'],
    [ARTICLE_URL, true, 'already-proxied'],
  ]) {
    const h = harness([{ value: {} }]);
    const result = await h.run('academic_proxy_open', { url });
    assert.equal(result.proxied, proxied);
    assert.equal(result.reason, reason);
    assert.deepEqual(h.calls[0].arguments, { url, newTab: false });
  }
});

test('open rejects malformed, non-HTTP and credential-bearing URLs before the registry', async () => {
  for (const url of ['not a URL', 'file:///paper.pdf', 'javascript:alert(1)', 'https://user:password@dl.acm.org/paper']) {
    const h = harness();
    await assert.rejects(() => h.run('academic_proxy_open', { url }));
    assert.equal(h.calls.length, 0);
    assert.equal(h.monitor.ticks, 0);
  }
});

test('open propagates registry denial without invoking monitor navigation afterward', async () => {
  const h = harness([{ isError: true, content: [{ type: 'text', text: 'browser_open denied by policy' }] }]);
  await assert.rejects(() => h.run('academic_proxy_open', { url: 'https://dl.acm.org/paper' }), /browser_open denied by policy/);
  assert.equal(h.monitor.ticks, 0);
  assert.equal(h.calls.length, 1);
  assertNestedContext(h);
});

test('check identifies login and challenge pages with one inspection and no automated retry', async () => {
  for (const kind of ['login', 'challenge', 'ready']) {
    const page = readyPage({ kind });
    const h = harness([inspected(page)]);
    const result = await h.run('academic_proxy_check');
    assert.deepEqual(result.page, page);
    assert.equal(result.humanRequired, kind !== 'ready');
    assert.equal(h.monitor.ticks, 1);
    assert.deepEqual(h.calls.map(call => call.name), ['browser_execute']);
    assert.equal(h.calls[0].arguments.script, INSPECT_PAGE_SCRIPT);
    assertNestedContext(h);
  }
});

test('failed page inspection stops check and download instead of assuming readiness', async () => {
  for (const response of [{ value: { exception: 'navigation race' } }, { value: {} }, { value: null }]) {
    for (const name of ['academic_proxy_check', 'academic_proxy_download']) {
      const h = harness([response]);
      await assert.rejects(() => h.run(name), /browser_snapshot/);
      assert.equal(h.calls.length, 1);
      assert.equal(h.monitor.ticks, 0);
    }
  }
});

test('download follows the ordinary inspect, candidate, identity and click pipeline without direct fetch', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => { throw new Error('direct fetch is forbidden'); });
  const h = harness([
    inspected(readyPage()), found([candidate(), candidate('#supplement', 1, 'PDF')]),
    inspected(ARTICLE_URL), { value: { clicked: true } },
  ]);
  const result = await h.run('academic_proxy_download');
  assert.equal(result.status, 'clicked');
  assert.equal(result.label, 'Download article PDF');
  assert.match(result.message, /不代表文件已保存成功/);
  assert.deepEqual(h.calls.map(call => call.name), ['browser_execute', 'browser_execute', 'browser_execute', 'browser_click']);
  assert.equal(h.calls[0].arguments.script, INSPECT_PAGE_SCRIPT);
  assert.equal(h.calls[1].arguments.script, DOWNLOAD_CANDIDATES_SCRIPT);
  assert.deepEqual(h.calls[2].arguments, { script: 'location.href' });
  assert.deepEqual(h.calls[3].arguments, { target: { by: 'css', value: '#download-pdf' } });
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(h.queue.length, 0);
  assertNestedContext(h);
});

test('download registry denials from both inspection and the final click propagate', async () => {
  const inspection = harness([{ isError: true, content: [{ type: 'text', text: 'inspection blocked by policy' }] }]);
  await assert.rejects(() => inspection.run('academic_proxy_download'), /inspection blocked by policy/);
  assert.equal(inspection.calls.length, 1);
  const click = harness([
    inspected(readyPage()), found([candidate()]), inspected(ARTICLE_URL),
    { isError: true, content: [{ type: 'text', text: 'click approval denied' }] },
  ]);
  await assert.rejects(() => click.run('academic_proxy_download'), /click approval denied/);
  assert.equal(click.calls.length, 4);
  assertNestedContext(click);
});

test('cancellation between candidate discovery and click stops further registry calls', async () => {
  let h;
  const reason = new Error('cancelled while inspecting candidates');
  h = harness([
    inspected(readyPage()),
    () => {
      h.controller.abort(reason);
      return found([candidate()]);
    },
  ]);
  await assert.rejects(() => h.run('academic_proxy_download'), error => error === reason);
  assert.deepEqual(h.calls.map(call => call.name), ['browser_execute', 'browser_execute']);
});

test('login or challenge download pages stop for the human without candidate scans, clicks or retries', async () => {
  for (const kind of ['login', 'challenge']) {
    const h = harness([inspected(readyPage({ kind }))]);
    const result = await h.run('academic_proxy_download', { selector: '#download-pdf' });
    assert.equal(result.status, 'human-required');
    assert.equal(result.kind, kind);
    assert.equal(h.monitor.ticks, 1);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].name, 'browser_execute');
  }
});

test('download on an original matching host opens the proxy and requires a fresh follow-up before clicking', async () => {
  const h = harness([inspected(readyPage({ url: 'https://dl.acm.org/doi/article' })), { value: {} }]);
  const result = await h.run('academic_proxy_download');
  assert.equal(result.status, 'proxy-opened');
  assert.deepEqual(h.calls.map(call => call.name), ['browser_execute', 'browser_open']);
  assert.deepEqual(h.calls[1].arguments, { url: ARTICLE_URL });
  assert.equal(h.monitor.ticks, 1);
});

test('inspectOnly returns genuine candidates and frame information without clicking', async () => {
  const candidates = [candidate()];
  const h = harness([inspected(readyPage()), found(candidates, { framesPresent: true })]);
  const result = await h.run('academic_proxy_download', { inspectOnly: true });
  assert.deepEqual(result, { status: 'candidates', candidates, framesPresent: true });
  assert.equal(h.calls.length, 2);
});

test('ambiguous top scores require a choice, and no controls reports no-control-found', async () => {
  for (const [candidates, status] of [
    [[candidate('#pdf-a'), candidate('#pdf-b')], 'choose-control'],
    [[], 'no-control-found'],
  ]) {
    const h = harness([inspected(readyPage()), found(candidates, { framesPresent: true })]);
    const result = await h.run('academic_proxy_download');
    assert.equal(result.status, status);
    assert.deepEqual(result.candidates, candidates);
    assert.equal(result.framesPresent, true);
    assert.equal(h.calls.length, 2);
  }
});

test('an explicit selector may choose a returned control but cannot introduce an arbitrary selector', async () => {
  const candidates = [candidate('#pdf-a'), candidate('#pdf-b')];
  const chosen = harness([inspected(readyPage()), found(candidates), inspected(ARTICLE_URL), { value: {} }]);
  assert.equal((await chosen.run('academic_proxy_download', { selector: '#pdf-b' })).status, 'clicked');
  assert.equal(chosen.calls[3].arguments.target.value, '#pdf-b');
  const unlisted = harness([inspected(readyPage()), found(candidates)]);
  const result = await unlisted.run('academic_proxy_download', { selector: 'button.delete-account' });
  assert.equal(result.status, 'choose-control');
  assert.equal(unlisted.calls.length, 2);
});

test('a page change after candidate discovery prevents the final click', async () => {
  const h = harness([inspected(readyPage()), found([candidate()]), inspected('https://user-selected.example/new-page')]);
  await assert.rejects(() => h.run('academic_proxy_download'), /页面已改变/);
  assert.deepEqual(h.calls.map(call => call.name), ['browser_execute', 'browser_execute', 'browser_execute']);
});

test('a page change between readiness inspection and candidate discovery also prevents clicking', async () => {
  const changed = 'https://user-selected.example/new-page';
  const h = harness([
    inspected(readyPage()), found([candidate()], { url: changed }), inspected(changed), { value: { clicked: true } },
  ]);
  await assert.rejects(() => h.run('academic_proxy_download'), /页面已改变|重新检查/);
  assert.equal(h.calls.some(call => call.name === 'browser_click'), false);
});

test('failed candidate extraction and identity reads cannot trigger a click', async () => {
  for (const response of [{ value: { exception: 'DOM unavailable' } }, { value: {} }]) {
    const h = harness([inspected(readyPage()), response]);
    await assert.rejects(() => h.run('academic_proxy_download'), /browser_a11y/);
    assert.equal(h.calls.length, 2);
  }
  const h = harness([inspected(readyPage()), found([candidate()]), { value: { exception: 'navigated' } }]);
  await assert.rejects(() => h.run('academic_proxy_download'), /页面已改变/);
  assert.equal(h.calls.length, 3);
});

function element({ id = '', tag = 'BUTTON', label = '', attributes = {}, visible = true, style = {}, disabled = false, hidden = false } = {}) {
  const node = {
    id, tagName: tag, nodeType: 1, innerText: label, textContent: label, disabled, hidden,
    parentElement: null, children: [], style,
    getAttribute: name => attributes[name] ?? null,
    getBoundingClientRect: () => ({ width: visible ? 100 : 0, height: visible ? 20 : 0 }),
    matches: selector => selector === 'input' && tag === 'INPUT',
  };
  Object.defineProperty(node, 'value', { get() { throw new Error('input values must not be read'); } });
  Object.defineProperty(node, 'href', { get() { throw new Error('download URLs must not be fetched or guessed'); } });
  return node;
}

function inspectDom({ text = '', title = '', passwords = [], headings = [], controls = [], challenges = [], article = null, readyState = 'complete' } = {}) {
  const document = {
    body: { innerText: text }, title, readyState,
    querySelector: () => article,
    querySelectorAll(selector) {
      if (selector.startsWith('#challenge-running')) return challenges;
      if (selector.startsWith('input[type="password"]')) return passwords;
      if (selector === 'h1,h2,[role="heading"]') return headings;
      if (selector.startsWith('form input')) return controls;
      throw new Error(`unexpected DOM selector: ${selector}`);
    },
  };
  return runInNewContext(INSPECT_PAGE_SCRIPT, {
    document, location: { href: ARTICLE_URL },
    getComputedStyle: node => ({ display: 'block', visibility: 'visible', ...node.style }),
    fetch: () => { throw new Error('network use is forbidden'); },
  });
}

test('serialized inspection classifies visible login and OTP controls without reading their values', () => {
  for (const password of [element({ tag: 'INPUT' }), element({ tag: 'INPUT', attributes: { autocomplete: 'one-time-code' } })]) {
    const result = inspectDom({ passwords: [password] });
    assert.equal(result.kind, 'login');
    assert.deepEqual(Object.keys(result).sort(), ['kind', 'readyState', 'title', 'url']);
  }
  assert.equal(inspectDom({ title: 'Institutional access', controls: [element({ label: 'Continue' })] }).kind, 'login');
});

test('serialized inspection recognizes human challenges and ignores hidden challenge controls', () => {
  assert.equal(inspectDom({ title: 'Just a moment...', text: 'Verify you are human' }).kind, 'challenge');
  assert.equal(inspectDom({ challenges: [element()], passwords: [element({ tag: 'INPUT' })] }).kind, 'challenge');
  for (const node of [element({ visible: false }), element({ hidden: true }), element({ style: { visibility: 'hidden' } }), element({ attributes: { 'aria-hidden': 'true' } })]) {
    assert.equal(inspectDom({ challenges: [node], passwords: [node] }).kind, 'ready');
  }
});

test('article login links and long article text mentioning challenges do not force human handoff', () => {
  assert.equal(inspectDom({ title: 'Institutional access', controls: [element({ label: 'Sign in' })], article: {} }).kind, 'ready');
  assert.equal(inspectDom({ text: `A paper about unusual traffic. ${'article text '.repeat(1600)}` }).kind, 'ready');
});

function downloadDom(controls, framesPresent = false) {
  return runInNewContext(DOWNLOAD_CANDIDATES_SCRIPT, {
    document: {
      querySelectorAll(selector) {
        if (selector === 'iframe,frame') return framesPresent ? [{}] : [];
        assert.equal(selector, 'a,button,[role="button"],input[type="button"],input[type="submit"]');
        return controls;
      },
    },
    location: { href: ARTICLE_URL },
    getComputedStyle: node => ({ display: 'block', visibility: 'visible', ...node.style }),
    CSS: { escape: value => value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`) },
    fetch: () => { throw new Error('network use is forbidden'); },
  });
}

test('serialized candidate extraction ranks visible real controls and excludes disabled or supplementary links', () => {
  const result = downloadDom([
    element({ id: 'plain', label: 'PDF' }),
    element({ id: 'paper:pdf', label: 'Download article PDF', tag: 'A' }),
    element({ id: 'supplement', label: 'Download supplementary PDF' }),
    element({ id: 'citation', label: 'Export citation PDF' }),
    element({ id: 'hidden', label: 'Download PDF', visible: false }),
    element({ id: 'disabled', label: 'Download PDF', disabled: true }),
    element({ id: 'aria-disabled', label: 'Download PDF', attributes: { 'aria-disabled': 'true' } }),
    element({ id: 'invisible', label: 'Download PDF', style: { visibility: 'hidden' } }),
    element({ id: 'unrelated', label: 'Read abstract' }),
  ], true);
  assert.equal(result.url, ARTICLE_URL);
  assert.equal(result.framesPresent, true);
  assert.deepEqual(Array.from(result.candidates, value => value.selector), ['#paper\\:pdf', '#plain']);
  assert.deepEqual(Array.from(result.candidates, value => value.score), [9, 4]);
  assert.ok(result.candidates.every(value => value.frame === null));
  assert.ok(result.candidates.every(value => !('url' in value) && !('href' in value)));
});

test('serialized candidate extraction constructs exact structural selectors and caps results', () => {
  const parent = element({ id: 'actions', tag: 'DIV' });
  const first = element({ label: 'PDF' });
  const second = element({ label: 'Download PDF' });
  parent.children = [first, second];
  first.parentElement = parent;
  second.parentElement = parent;
  const result = downloadDom([first, second]);
  assert.deepEqual(Array.from(result.candidates, value => value.selector), ['#actions > button:nth-of-type(2)', '#actions > button:nth-of-type(1)']);
  const many = Array.from({ length: 40 }, (_, index) => element({ id: `pdf-${index}`, label: 'PDF' }));
  assert.equal(downloadDom(many).candidates.length, 30);
});


test('native JSON-string object and boolean results bind the current login page', async () => {
  const page = readyPage({ kind: 'login' });
  const h = harness([inspected(page), inspected(true)]);
  const tracked = [];
  h.monitor.trackCurrent = async (...args) => tracked.push(args);
  const result = await h.run('academic_proxy_check');
  assert.equal(result.humanRequired, true);
  assert.deepEqual(result.page, page);
  assert.equal(tracked.length, 1);
  assert.match(tracked[0][0], /^[a-f0-9-]{36}$/);
  assert.deepEqual(tracked[0][1], page);
  assert.match(h.calls[1].arguments.script, /Symbol.for/);
});

test('native browser_execute ok=false never becomes a successful page inspection', async () => {
  const h = harness([{ value: { ok: false, value: JSON.stringify(readyPage()), exception: 'evaluation failed' } }]);
  await assert.rejects(h.run('academic_proxy_check'), /browser_snapshot/);
  assert.equal(h.monitor.ticks, 0);
});
