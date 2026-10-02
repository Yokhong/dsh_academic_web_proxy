import { DEFAULT_HOSTNAMES } from './default-hostnames.js';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

export function createHandlers({ store, monitor, ready }) {
  const snapshot = () => ({ settings: store.get(), revision: store.revision, defaultHostnames: [...DEFAULT_HOSTNAMES], status: monitor.status() });
  const handle = fn => async request => {
    try { await ready; return await fn(request); }
    catch (error) {
      const status = error.statusCode ?? (error.code?.startsWith('SETTINGS_') ? 503 : 400);
      return json({ error: status === 503 ? '配置存储不可用；请检查插件配置文件和文件权限。' : error.message }, status);
    }
  };
  return {
    settings: handle(async request => {
      if (request.method === 'GET') return json(snapshot());
      const text = await request.text();
      if (text.length > 256_000) return json({ error: '配置内容过大。' }, 413);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: '需要 application/json。' }, 415);
      const body = JSON.parse(text);
      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0) return json({ error: '缺少有效 revision，请重新载入配置。' }, 400);
      await store.save(body.settings, { revision: body.revision });
      monitor.configure();
      void Promise.resolve().then(() => monitor.tick()).catch(() => {});
      return json(snapshot());
    }),
    status: handle(async () => json(monitor.status())),
    present: handle(async request => {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: '需要 application/json。' }, 415);
      const text = await request.text();
      if (text.length > 1024) return json({ error: '请求过大。' }, 413);
      const { id } = JSON.parse(text);
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: '无效页面编号。' }, 400);
      return json(await monitor.present(id));
    }),
  };
}

/** Host-owned API transport applies authentication and Host/Origin validation first. */
export function installRoutes(ctx, handlers) {
  ctx.inject(['connection'], host => {
    for (const [name, methods] of [['settings', ['GET', 'POST']], ['status', ['GET']], ['present', ['POST']]]) {
      host.connection.fetch.register({ path: `/api/dsh-academic-web-proxy/${name}`, methods, requestBody: 'buffered', fetch: handlers[name] });
    }
  });
}
