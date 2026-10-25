import { defineTool } from '@deepseek-ai/dsh-tools';
import { SettingsStore } from './settings.js';
import { DesktopBridge } from './desktop-bridge.js';
import { ProxyMonitor } from './monitor.js';
import { PaperDownloadMonitor } from './download-monitor.js';
import { registerAcademicTools } from './tools.js';
import { createHandlers, installRoutes } from './routes.js';
import { resolveSettingsPath, resolveWebUrl } from './host-context.js';
import { browserToolStatus, observeBrowserTools } from './browser-tools.js';

export const name = 'dsh-academic-web-proxy';
export const inject = ['tools', 'systemPrompt', 'profileContext'];

export function apply(ctx) {
  const store = new SettingsStore({ filePath: resolveSettingsPath(ctx) });
  let server;
  ctx.inject(['webServer'], web => web.effect(() => {
    server = web.webServer;
    return () => { server = undefined; };
  }));
  const downloads = new PaperDownloadMonitor({ settings: () => store.get(), allowed: () => !monitor.restricted });
  const monitor = new ProxyMonitor({ bridge: new DesktopBridge({ profileUrl: () => resolveWebUrl(server), requireProfile: true }), settings: () => store.get(), downloads });
  const ready = store.load().then(() => { monitor.configure(); downloads.configure(); });
  ready.catch(() => ctx.logger?.warn?.('dsh-academic-web-proxy: settings unavailable; automatic proxy remains stopped.'));
  let disposed = false;
  ctx.effect(() => {
    void ready.then(() => { if (!disposed) { downloads.start(); monitor.start(); } }).catch(() => {});
    return async () => { disposed = true; await Promise.all([monitor.stop(), downloads.stop()]); };
  });
  installRoutes(ctx, createHandlers({ store, monitor, downloads, ready, browserStatus: () => browserToolStatus(ctx) }));
  registerAcademicTools(ctx, { monitor, downloads, settings: () => store.get(), defineTool });

  observeBrowserTools(ctx, monitor, ready);

  ctx.systemPrompt.section({
    name: 'tool:dsh-academic-web-proxy', order: 155,
    text: 'The academic web proxy plugin uses human-configured proxy templates and exact independent hostnames. Prefer academic_proxy_open, then academic_proxy_check after navigation. Version 0.2.1 supports both registered dsh_browser_* and legacy browser_* tools through the host registry in the current task; it never retries a denied operation under another name. Check academic_proxy_status: toolCompatibility describes registration, not verified provider availability. Automatic background navigation is disabled when current-task ownership cannot be proven (tools-only); do not infer that explicit academic tools are unavailable. Use only the current task browser. When login or CAPTCHA is detected, leave the SAME page open, inform the human, and stop automated interaction until they finish; never enter credentials, solve CAPTCHA, or retry the block. Use academic_proxy_download to discover and click a real visible control. If ambiguous, inspect the current browser accessibility tree with the registered dsh_browser_a11y or browser_a11y tool, then choose a returned selector. For a frame or PDF viewer use its actual visible download control. Never substitute a direct-download tool, a guessed URL, or a direct fetch. A successful click is not proof of a saved file: confirm the browser download UI or file before reporting success. Optional PDF renaming watches only an explicitly configured local download folder. It requires a newly observed temporary download file to disappear, a stable parseable PDF, and unambiguously matching captured article metadata. This is a conservative filesystem heuristic, not a native completion event. Check renaming.mode, renaming.ready and recent results; enabled or metadataCaptured alone is not success. Never guess metadata, rename old or unmatched files, bypass selected naming fields, change user settings automatically, or repeat downloads to force renaming. If no rename is confirmed, leave the original name and explain the limitation.',
  });
}
