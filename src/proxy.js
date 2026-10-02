import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import { DEFAULT_HOSTNAMES } from './default-hostnames.js';

export function normalizeHostname(input) {
  if (typeof input !== 'string') throw new TypeError('Hostname 必须是文本。');
  const text = input.trim().replace(/\.$/, '');
  if (!text || /[\s\/:@?#%*\\]/u.test(text)) throw new Error('只填写域名，不要填写协议、端口、路径或通配符。');
  const host = domainToASCII(text).toLowerCase();
  if (isIP(host) || host.length > 253 || !host.includes('.') || !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(part))) {
    throw new Error('Hostname 不是有效的完整域名。');
  }
  return host;
}

function httpUrl(input) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

function validTokens(value, allowed) {
  const withoutEscapes = value.replace(/%[0-9a-f]{2}/gi, '');
  const tokens = withoutEscapes.match(/%./g) ?? [];
  if (tokens.some(token => !allowed.includes(token)) || /%$/u.test(withoutEscapes)) {
    throw new Error(`不支持的占位符；此字段支持 ${allowed.join('、')}。`);
  }
}

export function validateSchemes(login = '', proxied = '') {
  if (typeof login !== 'string' || typeof proxied !== 'string') throw new TypeError('代理方案必须是文本。');
  for (const value of [login, proxied]) {
    if (value.length > 4096 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) throw new Error('代理方案不可包含空白、反斜杠或控制字符，长度不得超过 4096。');
  }
  if (login) {
    validTokens(login, ['%u']);
    if (login.split('%u').length !== 2) throw new Error('Login URL Scheme 需要恰好一个 %u。');
    const url = httpUrl(login.replace('%u', encodeURIComponent('https://example.org/article')));
    if (!url || !/^https?:\/\//u.test(login) || login.split('/').slice(0, 3).join('/').includes('%u')) {
      throw new Error('Login URL Scheme 需要完整的 http(s) 地址，%u 必须位于主机名之后。');
    }
  }
  if (proxied) {
    validTokens(proxied, ['%h', '%p']);
    if (proxied.split('%h').length !== 2 || proxied.split('%p').length !== 2) throw new Error('Proxied URL Scheme 需要各一个 %h 和 %p。');
    const expanded = proxied.replace('%h', 'example-org').replace('%p', 'article?x=1');
    const url = httpUrl(/^[a-z]+:\/\//iu.test(expanded) ? expanded : `https://${expanded}`);
    const canonical = /^https?:\/\//u.test(proxied) ? proxied : `https://${proxied}`;
    const authority = canonical.split('/')[2];
    if (!url || !authority.includes('%h') || authority.includes('%p') || !canonical.slice(canonical.indexOf(authority) + authority.length).split(/[?#]/u)[0].includes('%p')) {
      throw new Error('Proxied URL Scheme 的 %h 必须在主机名中，%p 必须在路径中。');
    }
    const suffix = authority.split('%h')[1].split(':')[0];
    if (!/^\.[a-z0-9-]+(?:\.[a-z0-9-]+)*$/iu.test(suffix)) throw new Error('代理主机必须包含机构提供的固定域名后缀，不能仅为 %h。');
  }
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function templatePattern(template, login = false) {
  if (!template) return null;
  const hasProtocol = /^https?:\/\//u.test(template);
  const source = template.split(/(%h|%p|%u)/u).map(part => {
    if (part === '%h') return '[a-z0-9.-]+';
    if (part === '%p' || part === '%u') return '.*';
    return escapeRegExp(part);
  }).join('');
  return new RegExp(`^${hasProtocol ? '' : 'https?://'}${source}${login ? '' : '(?:#.*)?'}$`, 'i');
}

/** Pure URL rules. Host selection is independent of the two scheme strings. */
export class ProxyRules {
  constructor(settings) {
    validateSchemes(settings.loginUrlScheme, settings.proxiedUrlScheme);
    this.settings = settings;
    this.hosts = new Set([
      ...(settings.useDefaultHostnames ? DEFAULT_HOSTNAMES : []),
      ...settings.customHostnames.map(normalizeHostname),
    ]);
    this.proxyPattern = templatePattern(settings.proxiedUrlScheme);
    this.loginPattern = templatePattern(settings.loginUrlScheme, true);
    this.loginOrigin = settings.loginUrlScheme ? new URL(settings.loginUrlScheme.replace('%u', 'target')).origin : null;
    // The proxy origin varies by academic host; retain only the configured suffix.
    const proxy = settings.proxiedUrlScheme.replace(/^https?:\/\//u, '');
    this.proxySuffix = proxy ? proxy.split('/')[0].split('%h')[1].split(':')[0].toLowerCase() : null;
  }
  get configured() { return Boolean(this.settings.loginUrlScheme || this.settings.proxiedUrlScheme); }
  isProxied(input) { return Boolean(this.proxyPattern?.test(input)); }
  isLogin(input) { return Boolean(this.loginPattern?.test(input)); }
  isRelated(input) {
    const url = httpUrl(input);
    if (!url) return false;
    if (this.loginOrigin === url.origin || this.isProxied(input)) return true;
    return Boolean(this.proxySuffix?.startsWith('.') && url.hostname.endsWith(this.proxySuffix));
  }
  decide(input) {
    const url = httpUrl(input);
    if (!url) return { action: 'skip', reason: 'non-http-or-credentials' };
    if (!this.settings.enabled) return { action: 'skip', reason: 'disabled' };
    if (!this.configured) return { action: 'skip', reason: 'unconfigured' };
    if (this.isProxied(url.href) || this.isLogin(url.href) || this.isRelated(url.href)) return { action: 'skip', reason: 'already-proxied' };
    if (!this.hosts.has(url.hostname.toLowerCase().replace(/\.$/u, ''))) return { action: 'skip', reason: 'unmatched-host' };
    if (url.port) return { action: 'skip', reason: 'nonstandard-port' };
    let target;
    if (this.settings.loginUrlScheme) {
      target = this.settings.loginUrlScheme.replace('%u', encodeURIComponent(url.href));
    } else {
      const scheme = this.settings.proxiedUrlScheme;
      const host = url.protocol === 'https:' ? url.hostname.replace(/\./g, '-') : url.hostname;
      const path = url.pathname.slice(1) + url.search + url.hash;
      target = scheme.replace('%h', host).replace('%p', path);
      if (!/^https?:\/\//u.test(target)) target = `${url.protocol}//${target}`;
    }
    const destination = httpUrl(target);
    if (!destination || destination.href === url.href) return { action: 'skip', reason: 'invalid-or-identical-target' };
    if (url.protocol === 'https:' && destination.protocol !== 'https:') return { action: 'skip', reason: 'https-downgrade' };
    return { action: 'redirect', source: url.href, target: destination.href };
  }
}

/** Per-tab loop guard, bounded memory; never saves visited URLs to disk. */
export class RedirectGuard {
  constructor({ now = Date.now, cooldownMs = 30_000, limit = 2000 } = {}) {
    this.now = now; this.cooldownMs = cooldownMs; this.limit = limit; this.entries = new Map();
  }
  allow(id, url) {
    const key = `${id}\n${new URL(url).hostname}`;
    const last = this.entries.get(key);
    if (last !== undefined && this.now() - last < this.cooldownMs) return false;
    this.entries.delete(key);
    this.entries.set(key, this.now());
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    return true;
  }
  clear() { this.entries.clear(); }
}
