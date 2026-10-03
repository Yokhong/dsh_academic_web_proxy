import { ProxyRules, RedirectGuard } from './proxy.js';
import { INSPECT_PAGE_SCRIPT } from './page-scripts.js';
import { extractPaperMetadata } from './paper-metadata.js';

const safeLocation = input => {
  try { const url = new URL(input); return `${url.origin}${url.pathname}`; } catch { return ''; }
};

/** Desktop bridge polling: no provider registration, request hooks or prototype patches. */
export class ProxyMonitor {
  constructor({ bridge, settings, downloads, intervalMs = 1000, now = Date.now }) {
    this.downloads = downloads;
    this.bridge = bridge; this.settings = settings; this.intervalMs = intervalMs; this.now = now;
    this.rules = new ProxyRules(settings()); this.guard = new RedirectGuard({ now });
    this.tabs = new Map(); this.pending = new Map(); this.busy = 0; this.restricted = false;
    this.state = { mode: 'starting', message: '正在检测内置浏览器桥接能力。' };
    this.stopped = true; this.flight = null; this.timer = null; this.generation = 0; this.disposed = false;
  }
  configure() {
    this.generation++;
    this.rules = new ProxyRules(this.settings()); this.guard.clear();
    this.tabs.clear(); this.pending.clear();
  }
  start() {
    if (!this.stopped || this.disposed) return;
    this.stopped = false;
    const run = async () => {
      if (this.stopped) return;
      try { await this.tick(); } catch { this.state = { mode: 'unavailable', message: '浏览器桥接暂不可用；请检查内置浏览器状态。' }; }
      if (!this.stopped) { this.timer = setTimeout(run, this.intervalMs); this.timer.unref?.(); }
    };
    void run();
  }
  async stop() {
    this.stopped = true; this.disposed = true; this.generation++; clearTimeout(this.timer);
    const closing = this.bridge.close?.();
    await Promise.allSettled([this.flight, closing]);
    this.tabs.clear(); this.pending.clear();
  }
  async tick() {
    if (this.disposed) return;
    if (this.flight) return this.flight;
    this.flight = this.scan().catch(() => { this.state = { mode: 'unavailable', message: '浏览器桥接暂不可用；请检查内置浏览器状态。' }; }).finally(() => { this.flight = null; });
    return this.flight;
  }
  async scan() {
    const generation = this.generation;
    if (this.disposed) return;
    if (this.busy || this.restricted) {
      if (this.restricted) this.state = { mode: 'restricted', message: 'browser_restrict 已限制操作，自动跳转暂停。' };
      return;
    }
    if (!this.rules.settings.enabled || !this.rules.configured) {
      this.state = { mode: this.rules.settings.enabled ? 'unconfigured' : 'disabled', message: this.rules.settings.enabled ? '填写代理方案后自动启用。两个字段目前均为空。' : '学术网页代理已关闭。' };
      return;
    }
    const available = await this.bridge.discover();
    if (this.disposed || generation !== this.generation) return;
    if (!available) {
      this.state = { mode: 'unavailable', message: '未发现兼容的桌面内置浏览器桥接。自动监测不可用；academic_proxy_open 仍可使用浏览器工具打开代理链接。' };
      return;
    }
    const guests = (await this.bridge.list()).filter(guest => guest.type === 'webview' && !guest.destroyed);
    if (this.disposed || generation !== this.generation) return;
    const alive = new Set(guests.map(guest => guest.id));
    for (const id of this.tabs.keys()) if (!alive.has(id)) this.tabs.delete(id);
    for (const id of this.pending.keys()) if (!alive.has(id)) this.pending.delete(id);
    this.state = { mode: 'desktop-bridge', message: '正在监测桌面内置浏览器；导航后约 1 秒内检查代理与登录状态。' };
    for (const guest of guests) {
      if (this.disposed || generation !== this.generation || this.busy || this.restricted || !this.rules.settings.enabled) break;
      try { await this.scanTab(guest, generation); } catch {
        // A closing/navigating tab is transient. Never restart or replace the browser.
      }
    }
  }
  async scanTab(guest, generation = this.generation) {
    if (this.disposed || generation !== this.generation) return;
    let tracked = this.tabs.get(guest.id);
    const decision = this.rules.decide(guest.url);
    // A proxy may return to the original URL after authentication. Do not loop.
    const returnedToSource = tracked?.source === guest.url && tracked.attempted;
    if (!returnedToSource && decision.action === 'redirect' && !this.pending.has(guest.id)) {
      // Re-read immediately before mutation: do not redirect a tab the user just changed.
      const current = await this.bridge.evaluate(guest.id, 'location.href');
      if (current !== guest.url || this.busy || this.restricted || generation !== this.generation || !this.rules.settings.enabled) return;
      if (!this.guard.allow(guest.id, guest.url)) return;
      tracked = { source: guest.url, attempted: true, startedAt: this.now() };
      this.tabs.set(guest.id, tracked);
      await this.bridge.navigate(guest.id, decision.target);
      return;
    }
    if (!this.rules.isRelated(guest.url) && !tracked) return;
    if (!tracked) { tracked = { startedAt: this.now() }; this.tabs.set(guest.id, tracked); }
    // Follow SSO redirects during this tab's current proxy flow (never inspect field values).
    if (tracked && !returnedToSource && this.now() - (tracked.startedAt ??= this.now()) > 10 * 60_000 && !this.rules.isRelated(guest.url)) {
      this.tabs.delete(guest.id); this.pending.delete(guest.id); return;
    }
    const page = await this.bridge.evaluate(guest.id, INSPECT_PAGE_SCRIPT);
    if (!page || page.url !== guest.url || generation !== this.generation || this.busy || this.restricted) return;
    if (page.kind === 'challenge' || page.kind === 'login') {
      const previous = this.pending.get(guest.id);
      const changed = previous?.kind !== page.kind || previous?.displayUrl !== safeLocation(page.url);
      const item = { id: guest.id, kind: page.kind, displayUrl: safeLocation(page.url), message: page.kind === 'login' ? '请在此原页面完成机构登录。' : '请在此原页面完成人机验证；自动操作已暂停。', presented: previous?.presented ?? false };
      this.pending.set(guest.id, item);
      if (!previous || changed) {
        const shown = await this.bridge.present(guest.id);
        item.presented = shown.presented === true;
        if (!item.presented) item.message += ' 自动展示未确认，请使用“显示此页面”或手动展开浏览器对应标签。';
      }
    } else if (page.readyState !== 'loading') {
      this.pending.delete(guest.id);
      if (this.downloads?.enabled() && (this.rules.isRelated(page.url) || this.rules.originalHostname(page.url)) && (tracked.metadataUrl !== page.url || this.now() - (tracked.metadataAt ?? 0) > 10_000)) {
        const hostname = this.rules.originalHostname(page.url);
        const metadata = await this.bridge.evaluate(guest.id, `(${extractPaperMetadata.toString()})(${JSON.stringify(hostname)})`);
        if (this.disposed || generation !== this.generation || this.busy || this.restricted || metadata?.pageUrl !== page.url) return;
        this.downloads.remember(metadata);
        tracked.metadataUrl = page.url; tracked.metadataAt = this.now();
      }
    }
  }
  async trackCurrent(marker, page, source) {
    const generation = this.generation;
    if (this.disposed || this.restricted || !this.rules.settings.enabled || !await this.bridge.discover()) return;
    if (this.disposed || generation !== this.generation) return;
    const expression = `(() => { const key = Symbol.for('dsh-academic-web-proxy:page-marker'); if (globalThis[key] !== ${JSON.stringify(marker)}) return null; delete globalThis[key]; return location.href; })()`;
    for (const guest of await this.bridge.list()) {
      if (this.disposed || generation !== this.generation || this.restricted) return;
      if (guest.type !== 'webview' || guest.url !== page.url) continue;
      let current;
      try { current = await this.bridge.evaluate(guest.id, expression); } catch { continue; }
      if (current !== page.url || generation !== this.generation || this.restricted) continue;
      this.tabs.set(guest.id, { source, attempted: Boolean(source), startedAt: this.now() });
      await this.scanTab(guest, generation);
      return;
    }
  }
  async present(id) {
    const generation = this.generation;
    if (this.disposed || !this.pending.has(id)) throw new Error('该页面已关闭或无需人工处理，请刷新状态。');
    const result = await this.bridge.present(id);
    if (this.disposed || generation !== this.generation) return { presented: false, reason: 'monitor-disposed-or-reconfigured' };
    const item = this.pending.get(id);
    if (item) item.presented = result.presented === true;
    return result;
  }
  status() { return { ...this.state, pending: [...this.pending.values()].map(item => ({ ...item })), ...(this.downloads ? { renaming: this.downloads.status() } : {}) }; }
}
