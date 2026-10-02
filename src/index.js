import { defineTool } from '@deepseek-ai/dsh-tools';
import { SettingsStore } from './settings.js';
import { DesktopBridge } from './desktop-bridge.js';
import { ProxyMonitor } from './monitor.js';
import { registerAcademicTools } from './tools.js';
import { createHandlers, installRoutes } from './routes.js';
import { resolveSettingsPath, resolveWebUrl } from './host-context.js';

export const name = 'dsh-academic-web-proxy';
export const inject = ['tools', 'systemPrompt', 'profileContext'];

export function apply(ctx) {
  const store = new SettingsStore({ filePath: resolveSettingsPath(ctx) });
  let server;
  ctx.inject(['webServer'], web => web.effect(() => {
    server = web.webServer;
    return () => { server = undefined; };
  }));
  const monitor = new ProxyMonitor({ bridge: new DesktopBridge({ profileUrl: () => resolveWebUrl(server), requireProfile: true }), settings: () => store.get() });
  const ready = store.load().then(() => monitor.configure());
  ready.catch(() => ctx.logger?.warn?.('dsh-academic-web-proxy: settings unavailable; automatic proxy remains stopped.'));
  let disposed = false;
  const restrictedTasks = new Set();
  ctx.effect(() => {
    void ready.then(() => { if (!disposed) monitor.start(); }).catch(() => {});
    return async () => { disposed = true; await monitor.stop(); };
  });
  installRoutes(ctx, createHandlers({ store, monitor, ready }));
  registerAcademicTools(ctx, { monitor, settings: () => store.get(), defineTool });

  // Observe/wrap execution without modifying immutable tool names or arguments.
  // Background redirects yield while the agent operates the browser.
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name.startsWith('academic_proxy_')) await ready;
    if (!exec.name.startsWith('browser_')) return next();
    monitor.busy++;
    try {
      await monitor.flight?.catch(() => {});
      const result = await next();
      if (exec.name === 'browser_restrict' && !result.isError) {
        const taskId = exec.agent?.id ?? 'unknown';
        if (Array.isArray(exec.arguments.allowed) && exec.arguments.allowed.length > 0) {
          if (!restrictedTasks.has(taskId)) exec.agent?.ctx?.effect?.(() => () => { restrictedTasks.delete(taskId); monitor.restricted = restrictedTasks.size > 0; });
          restrictedTasks.add(taskId);
        } else restrictedTasks.delete(taskId);
        monitor.restricted = restrictedTasks.size > 0;
      }
      return result;
    } finally { monitor.busy--; }
  });

  ctx.systemPrompt.section({
    name: 'tool:dsh-academic-web-proxy', order: 155,
    text: 'The academic web proxy plugin uses the human-configured Login URL Scheme / Proxied URL Scheme and independent hostnames. For academic browsing prefer academic_proxy_open, then academic_proxy_check after navigation. In a compatible desktop sidebar it also monitors human navigation. Check academic_proxy_status for actual availability; do not assume all browser backends support automatic redirect or visible handoff. When login or CAPTCHA is detected, leave the SAME page open, inform the human, and stop automated interaction until they finish; never enter credentials, solve CAPTCHA, or retry the block. For paper downloads use academic_proxy_download: it discovers and clicks a real visible control in the authenticated page. If ambiguous, inspect browser_a11y and choose the returned selector. If the control is in a frame or a PDF viewer, inspect the real browser and click its actual download control. Never substitute browser_download, a guessed URL or a direct fetch. A successful click alone is not proof that a file was saved; confirm the browser download UI or downloaded file before reporting success. Use only the current task browser; do not alter other sessions.',
  });
}
