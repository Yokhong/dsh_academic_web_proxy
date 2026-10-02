import { isAbsolute, join } from 'node:path';

/** Host facts come from services; DSH_* shell contributions are not host env. */
export function resolveSettingsPath(ctx) {
  const directory = ctx.get('profileContext')?.dir;
  if (typeof directory !== 'string' || !isAbsolute(directory)) {
    throw new Error('dsh-academic-web-proxy requires an active DSH profile directory.');
  }
  return join(directory, 'plugins', 'dsh-academic-web-proxy', 'settings.json');
}

export function resolveWebUrl(server) {
  try {
    const port = server?.port;
    return Number.isInteger(port) && port > 0 && port <= 65535 ? `http://127.0.0.1:${port}` : undefined;
  } catch { return undefined; } // The server may not have bound its port yet.
}
