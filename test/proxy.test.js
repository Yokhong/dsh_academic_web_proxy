import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HOSTNAMES } from '../src/default-hostnames.js';
import { normalizeHostname, validateSchemes, ProxyRules, RedirectGuard } from '../src/proxy.js';

const config = overrides => ({
  enabled: true,
  useDefaultHostnames: true,
  customHostnames: [],
  loginUrlScheme: '',
  proxiedUrlScheme: '%h.proxy.example.edu/%p',
  ...overrides,
});

const rules = overrides => new ProxyRules(config(overrides));

test('the default hostname group contains exactly 47 unique, canonical hosts', () => {
  assert.equal(DEFAULT_HOSTNAMES.length, 47);
  assert.equal(new Set(DEFAULT_HOSTNAMES).size, 47);
  assert.ok(Object.isFrozen(DEFAULT_HOSTNAMES));
  const proxy = rules();
  for (const hostname of DEFAULT_HOSTNAMES) {
    assert.equal(normalizeHostname(hostname), hostname);
    assert.equal(proxy.decide(`https://${hostname}/article`).action, 'redirect', hostname);
  }
});

test('turning the default group off preserves independent custom hostnames', () => {
  const proxy = rules({ useDefaultHostnames: false, customHostnames: [' Papers.Custom.Example. '] });
  assert.deepEqual([...proxy.hosts], ['papers.custom.example']);
  assert.equal(proxy.decide('https://papers.custom.example/paper').action, 'redirect');
  for (const hostname of DEFAULT_HOSTNAMES) {
    assert.deepEqual(proxy.decide(`https://${hostname}/paper`), { action: 'skip', reason: 'unmatched-host' });
  }
});

test('hostnames are exact matches and do not inherit wildcard or suffix permissions', () => {
  const proxy = rules({ customHostnames: ['papers.custom.example'] });
  for (const hostname of ['sub.papers.custom.example', 'papers.custom.example.evil.test', 'evilpapers.custom.example', 'sub.dl.acm.org']) {
    assert.equal(proxy.decide(`https://${hostname}/article`).reason, 'unmatched-host', hostname);
  }
  assert.equal(proxy.decide('https://DL.ACM.ORG/article').action, 'redirect');
  assert.equal(proxy.decide('https://dl.acm.org./article').action, 'redirect');
});

test('hostname rules stay independent when proxy schemes change', () => {
  const selected = { useDefaultHostnames: false, customHostnames: ['papers.custom.example'] };
  const login = rules({ ...selected, loginUrlScheme: 'https://login.example.edu/login?url=%u' });
  const hostProxy = rules({ ...selected, proxiedUrlScheme: 'https://%h.other-proxy.example/%p' });
  for (const proxy of [login, hostProxy]) {
    assert.deepEqual([...proxy.hosts], ['papers.custom.example']);
    assert.equal(proxy.decide('https://papers.custom.example/article').action, 'redirect');
    assert.equal(proxy.decide('https://dl.acm.org/article').reason, 'unmatched-host');
  }
});

test('%u takes precedence and encodes the complete URL, including query, fragment and Unicode', () => {
  const proxy = rules({
    useDefaultHostnames: false,
    customHostnames: ['例子.测试'],
    loginUrlScheme: 'https://login.example.edu/login?fixed=%2F&url=%u&after=1',
  });
  const source = new URL('https://例子.测试/论文/一?q=海 水&nested=https%3A%2F%2Fexample.org%2Fx%3Fa%3D1#章节一').href;
  const result = proxy.decide(source);
  assert.equal(result.action, 'redirect');
  assert.equal(result.source, source);
  assert.equal(result.target, `https://login.example.edu/login?fixed=%2F&url=${encodeURIComponent(source)}&after=1`);
  const target = new URL(result.target);
  assert.equal(target.searchParams.get('url'), source);
  assert.equal(target.searchParams.get('after'), '1');
  assert.equal(target.hash, '');
  assert.equal(target.hostname, 'login.example.edu');
});

test('HTTPS %h replaces every dot with a hyphen and %p retains query and fragment', () => {
  const result = rules().decide('https://dl.acm.org/doi/10.1/example?download=1&format=pdf#page=4');
  assert.deepEqual(result, {
    action: 'redirect',
    source: 'https://dl.acm.org/doi/10.1/example?download=1&format=pdf#page=4',
    target: 'https://dl-acm-org.proxy.example.edu/doi/10.1/example?download=1&format=pdf#page=4',
  });
});

test('HTTP %h preserves dots and a protocol-free scheme preserves HTTP', () => {
  assert.equal(rules().decide('http://dl.acm.org/paper?q=1#section').target,
    'http://dl.acm.org.proxy.example.edu/paper?q=1#section');
  assert.equal(rules({ proxiedUrlScheme: 'https://%h.proxy.example.edu/%p' }).decide('http://dl.acm.org/paper').target,
    'https://dl.acm.org.proxy.example.edu/paper');
});

test('%p preserves a root path, repeated slashes, percent escapes and Unicode encoding', () => {
  const proxy = rules();
  for (const suffix of ['/?q=a%26b#part', '/a//b/%2F?q=%E8%AE%BA%E6%96%87#%E4%B8%80', '/论文?q=测试#章节']) {
    const source = new URL(`https://dl.acm.org${suffix}`);
    const target = new URL(proxy.decide(source.href).target);
    assert.equal(target.pathname, source.pathname);
    assert.equal(target.search, source.search);
    assert.equal(target.hash, source.hash);
  }
});

test('login and host-rewritten URLs are recognized before host matching and never nested', () => {
  for (const proxy of [rules(), rules({ loginUrlScheme: 'https://login.example.edu/login?url=%u' })]) {
    const first = proxy.decide('https://dl.acm.org/paper?q=1#abstract');
    assert.equal(first.action, 'redirect');
    assert.deepEqual(proxy.decide(first.target), { action: 'skip', reason: 'already-proxied' });
  }
  const proxy = rules({ customHostnames: ['dl-acm-org.proxy.example.edu'] });
  assert.equal(proxy.decide('https://dl-acm-org.proxy.example.edu/paper').reason, 'already-proxied');
});

test('related proxy and login pages are recognized without unrelated suffix lookalikes', () => {
  const proxy = rules({ loginUrlScheme: 'https://login.example.edu/login?url=%u' });
  assert.equal(proxy.isRelated('https://login.example.edu/sso?ticket=secret'), true);
  assert.equal(proxy.isRelated('https://dl-acm-org.proxy.example.edu/paper'), true);
  assert.equal(proxy.isRelated('https://other.proxy.example.edu/auth'), true);
  for (const url of ['https://evilproxy.example.edu/auth', 'https://proxy.example.edu.evil.test/auth', 'file:///paper.pdf', 'invalid']) {
    assert.equal(proxy.isRelated(url), false, url);
  }
});

test('HTTPS sources are never downgraded by either template form', () => {
  for (const override of [
    { proxiedUrlScheme: 'http://%h.proxy.example.edu/%p' },
    { loginUrlScheme: 'http://login.example.edu/login?url=%u' },
  ]) {
    const proxy = rules(override);
    assert.deepEqual(proxy.decide('https://dl.acm.org/paper'), { action: 'skip', reason: 'https-downgrade' });
    assert.equal(proxy.decide('http://dl.acm.org/paper').action, 'redirect');
  }
});

test('disabled, unconfigured and nonstandard-port cases are explicit skips', () => {
  assert.equal(rules({ enabled: false }).decide('https://dl.acm.org/paper').reason, 'disabled');
  const unconfigured = rules({ proxiedUrlScheme: '' });
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.decide('https://dl.acm.org/paper').reason, 'unconfigured');
  assert.equal(rules().decide('https://dl.acm.org:8443/paper').reason, 'nonstandard-port');
  assert.equal(rules().decide('https://dl.acm.org:443/paper').action, 'redirect');
});

test('malformed, non-web and credential-bearing input URLs cannot redirect', () => {
  for (const input of ['', 'not a URL', '/relative', 'file:///paper.pdf', 'javascript:alert(1)', 'data:text/plain,paper', 'https://user:password@dl.acm.org/paper', 'https://@/paper']) {
    assert.deepEqual(rules().decide(input), { action: 'skip', reason: 'non-http-or-credentials' }, input);
  }
});

test('hostname normalization handles case, final dots and internationalized names', () => {
  assert.equal(normalizeHostname('  DL.ACM.ORG.  '), 'dl.acm.org');
  assert.equal(normalizeHostname('例子.测试'), 'xn--fsqu00a.xn--0zwm56d');
  assert.deepEqual([...rules({ useDefaultHostnames: false, customHostnames: ['DL.ACM.ORG', 'dl.acm.org.'] }).hosts], ['dl.acm.org']);
});

test('invalid hostnames are rejected instead of quietly becoming rules', () => {
  for (const input of [null, undefined, 42, '', 'localhost', 'https://example.org', 'example.org/path', 'example.org:443', '*.example.org', 'example.org?x=1', 'example.org#x', 'example org', 'bad_host.example', '-bad.example', 'bad-.example', 'double..example', 'example.org..', `${'a'.repeat(64)}.example`, `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}`]) {
    assert.throws(() => normalizeHostname(input), undefined, String(input));
  }
  assert.throws(() => rules({ customHostnames: ['valid.example', '*.invalid.example'] }));
});

test('valid schemes allow empty configuration and literal percent-encoded static components', () => {
  for (const [login, proxied] of [
    ['', ''],
    ['https://login.example.edu/login?next=%2F&url=%u', ''],
    ['', '%h.proxy.example.edu/%p'],
    ['', 'https://%h.proxy.example.edu/base/%p?fixed=%20'],
    ['https://login.example.edu/login/%u', 'https://%h.proxy.example.edu/%p'],
  ]) assert.doesNotThrow(() => validateSchemes(login, proxied));
});

test('malformed login templates reject unsupported tokens, credentials and authority substitutions', () => {
  for (const login of [
    'https://login.example.edu/login',
    'https://login.example.edu/login?one=%u&two=%u',
    'https://login.example.edu/login?url=%u&host=%h',
    'https://login.example.edu/login?url=%u&bad=%z',
    'https://login.example.edu/login?url=%u&bad=%',
    'https://%u.login.example.edu/path',
    'login.example.edu/login?url=%u',
    'ftp://login.example.edu/login?url=%u',
    'https://user:password@login.example.edu/login?url=%u',
    'https://login.example.edu/login?url=%u bad',
    'https://login.example.edu/\\login?url=%u',
    `https://login.example.edu/${'a'.repeat(4096)}?url=%u`,
  ]) assert.throws(() => validateSchemes(login, ''), undefined, login);
  assert.throws(() => validateSchemes(null, ''));
});

test('malformed host/path templates reject missing, duplicate or misplaced tokens', () => {
  for (const proxied of [
    'https://proxy.example.edu/%p',
    'https://%h.proxy.example.edu/article',
    'https://%h.%h.proxy.example.edu/%p',
    'https://%h.proxy.example.edu/%p/%p',
    'https://proxy.example.edu/%h/%p',
    'https://%h.%p.proxy.example.edu/article',
    'https://%h/%p',
    'https://%h:8080/%p',
    'https://%h.proxy.example.edu/?path=%p',
    'https://%h.proxy.example.edu/%p?url=%u',
    'ftp://%h.proxy.example.edu/%p',
    'https://user:password@%h.proxy.example.edu/%p',
    'https://%h.proxy.example.edu/a b/%p',
    'https://%h.proxy.example.edu/\\%p',
    'https://%h.proxy.example.edu/%p\u0000',
  ]) assert.throws(() => validateSchemes('', proxied), undefined, proxied);
  assert.throws(() => validateSchemes('', {}));
});

test('redirect cooldown is per tab and hostname, including different paths on that host', () => {
  let now = 1000;
  const guard = new RedirectGuard({ now: () => now, cooldownMs: 30_000 });
  assert.equal(guard.allow('tab-a', 'https://dl.acm.org/one'), true);
  assert.equal(guard.allow('tab-a', 'https://dl.acm.org/two'), false);
  assert.equal(guard.allow('tab-b', 'https://dl.acm.org/two'), true);
  assert.equal(guard.allow('tab-a', 'https://www.nature.com/two'), true);
  now += 29_999;
  assert.equal(guard.allow('tab-a', 'https://dl.acm.org/three'), false);
  now += 1;
  assert.equal(guard.allow('tab-a', 'https://dl.acm.org/three'), true);
  assert.equal(guard.allow('tab-a', 'https://dl.acm.org/four'), false);
});

test('redirect guard has bounded memory and clear resets cooldowns', () => {
  const guard = new RedirectGuard({ now: () => 100, limit: 2 });
  guard.allow('old', 'https://dl.acm.org/one');
  guard.allow('middle', 'https://dl.acm.org/one');
  guard.allow('new', 'https://dl.acm.org/one');
  assert.equal(guard.entries.size, 2);
  assert.equal(guard.allow('old', 'https://dl.acm.org/two'), true);
  assert.equal(guard.entries.size, 2);
  guard.clear();
  assert.equal(guard.entries.size, 0);
  assert.equal(guard.allow('old', 'https://dl.acm.org/three'), true);
});
