import { randomUUID } from 'node:crypto';
import { ProxyRules } from './proxy.js';
import { INSPECT_PAGE_SCRIPT, DOWNLOAD_CANDIDATES_SCRIPT } from './page-scripts.js';

/** Nested calls always enter the host registry: approvals, restrictions and cancellation remain effective. */
export async function callBrowser(ctx, exec, name, args) {
  exec.signal.throwIfAborted();
  const result = await ctx.tools.execute({
    callId: `${exec.callId}:academic:${randomUUID()}`, rootCallId: exec.rootCallId,
    parent: exec.token, agent: exec.agent, signal: exec.signal, name, arguments: args,
  });
  if (result.additionalContexts) for (const context of result.additionalContexts) exec.deferContext?.(context);
  if (result.isError) throw new Error(result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || `${name} 未成功。`);
  return result.value;
}

export function registerAcademicTools(ctx, { monitor, settings, defineTool }) {
  const register = options => ctx.tools.register(defineTool({
    timeoutMs: 60_000, isConcurrencySafe: () => false,
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] },
    ...options,
  }));
  // browser_execute 0.3.1 serializes every non-string return value to JSON.
  const executeJson = async (exec, script, message) => {
    const result = await callBrowser(ctx, exec, 'browser_execute', { script });
    if (result?.ok !== true || typeof result.value !== 'string') throw new Error(message);
    try { return JSON.parse(result.value); } catch { throw new Error(message); }
  };
  const inspect = async exec => {
    const message = '未能读取当前页面，请先使用 browser_snapshot 检查浏览器。';
    const page = await executeJson(exec, INSPECT_PAGE_SCRIPT, message);
    if (!page || typeof page.url !== 'string' || !['ready', 'login', 'challenge'].includes(page.kind)) throw new Error(message);
    return page;
  };
  const track = async (exec, page, source) => {
    if (!monitor.trackCurrent) return;
    const marker = randomUUID();
    const script = `(() => { if (location.href !== ${JSON.stringify(page.url)}) return false; Object.defineProperty(globalThis, Symbol.for('dsh-academic-web-proxy:page-marker'), { value: ${JSON.stringify(marker)}, configurable: true }); return true; })()`;
    const marked = await executeJson(exec, script, '当前页面已改变，无法绑定原标签。');
    if (marked === true) await monitor.trackCurrent(marker, page, source).catch(() => {});
  };
  register({
    name: 'academic_proxy_status',
    description: 'Read academic proxy readiness and pending login/CAPTCHA pages. Does not reveal proxy scheme strings or login input values.',
    parameters: {}, isConcurrencySafe: () => true,
    async execute() {
      const config = settings();
      return { enabled: config.enabled, configured: Boolean(config.loginUrlScheme || config.proxiedUrlScheme), ...monitor.status() };
    },
  });
  register({
    name: 'academic_proxy_open',
    description: 'Open an academic URL through the configured independent hostname rules in the existing DSH browser. Preserves browser tool policies. When login or verification is required, leave that page for the human.',
    parameters: { url: { type: 'string', required: true }, newTab: { type: 'boolean' } },
    async execute(args, exec) {
      const parsed = new URL(args.url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('仅支持无内嵌凭证的 HTTP(S) 学术网页。');
      const rules = new ProxyRules(settings());
      const decision = rules.decide(parsed.href);
      const target = decision.action === 'redirect' ? decision.target : parsed.href;
      const page = await callBrowser(ctx, exec, 'browser_open', { url: target, newTab: args.newTab === true });
      // Bind the exact current task page, including an external SSO redirect.
      if (monitor.trackCurrent && (decision.action === 'redirect' || rules.isRelated(target))) await track(exec, await inspect(exec), decision.source);
      await monitor.tick();
      return { proxied: decision.action === 'redirect' || rules.isProxied(target), reason: decision.reason ?? 'configured-proxy', page, status: monitor.status() };
    },
  });
  register({
    name: 'academic_proxy_check',
    description: 'Check the current academic page for login or human verification. On a blocked page stop automation and let the human act in the same browser tab; never solve or retry CAPTCHA.',
    parameters: {},
    async execute(_args, exec) {
      const page = await inspect(exec);
      await track(exec, page);
      await monitor.tick();
      return { page, humanRequired: ['login', 'challenge'].includes(page.kind), status: monitor.status() };
    },
  });
  register({
    name: 'academic_proxy_download',
    description: 'Find visible PDF/download controls on the current proxied article page and click a real control through browser_click. With inspectOnly=true list candidates; if several tie, choose a returned selector. Does not fetch/guess PDF URLs or claim a file is saved merely because a click succeeded.',
    parameters: { inspectOnly: { type: 'boolean' }, selector: { type: 'string' } },
    async execute(args, exec) {
      const page = await inspect(exec);
      if (page.kind !== 'ready') {
        await track(exec, page);
        await monitor.tick();
        return { status: 'human-required', kind: page.kind, message: '请在原页面完成登录或验证码，完成后重新检查。', browser: monitor.status() };
      }
      const decision = new ProxyRules(settings()).decide(page.url);
      if (decision.action === 'redirect') {
        await callBrowser(ctx, exec, 'browser_open', { url: decision.target });
        if (monitor.trackCurrent) await track(exec, await inspect(exec), decision.source);
        await monitor.tick();
        return { status: 'proxy-opened', message: '已打开代理页面。请检查登录状态及论文标题，再调用下载工具。' };
      }
      const found = await executeJson(exec, DOWNLOAD_CANDIDATES_SCRIPT, '无法读取下载控件，请使用 browser_a11y 检查页面。');
      if (!found || !Array.isArray(found.candidates) || typeof found.url !== 'string') throw new Error('无法读取下载控件，请使用 browser_a11y 检查页面。');
      const { candidates, framesPresent, url } = found;
      if (url !== page.url) throw new Error('页面已改变，请重新检查登录状态与下载控件。');
      if (args.inspectOnly) return { status: 'candidates', candidates, framesPresent };
      const chosen = args.selector ? candidates.find(candidate => candidate.selector === args.selector) : candidates[0];
      if (!chosen || !args.selector && candidates[1]?.score === chosen.score) {
        return { status: candidates.length ? 'choose-control' : 'no-control-found', candidates, framesPresent, message: '请用 browser_a11y 核对页面上的真实 PDF/下载按键。若有多个候选，请传入本次返回的 selector；跨域 iframe 使用浏览器工具定位。' };
      }
      // Check page identity immediately before the ordinary browser_click dispatch.
      const current = await callBrowser(ctx, exec, 'browser_execute', { script: 'location.href' });
      if (current?.ok !== true || current.value !== url) throw new Error('页面已改变，请重新检查下载控件。');
      const clicked = await callBrowser(ctx, exec, 'browser_click', { target: { by: 'css', value: chosen.selector } });
      if (clicked?.clicked === false) throw new Error('浏览器未能点击该下载控件，请重新检查页面。');
      return { status: 'clicked', label: chosen.label, message: '已点击页面上的真实下载按键。请检查浏览器下载记录或弹出的 PDF 标签页；此状态不代表文件已保存成功。' };
    },
  });
}
