import { scopeChainOf } from '@deepseek-ai/dsh-scope';

const OPERATIONS = ['open', 'execute', 'click'];
const PREFIXES = ['dsh_browser_', 'browser_'];

export function browserToolStatus(ctx, agent) {
  const scope = agent ? 'task' : 'profile';
  const unavailable = { mode: 'unavailable', prefix: null, available: [], missing: [...OPERATIONS], providerVerified: false, scope };
  if (typeof ctx.tools?.get !== 'function') return unavailable;
  for (const prefix of PREFIXES) {
    const available = OPERATIONS.filter(operation => ctx.tools.get(prefix + operation, agent));
    const registered = available.length || [...scopeChainOf(agent).slice(1), undefined].some(scope => OPERATIONS.some(operation => ctx.tools.get(prefix + operation, scope)));
    if (registered) return {
      mode: available.length === OPERATIONS.length ? 'registered' : 'partial', prefix, available,
      missing: OPERATIONS.filter(operation => !available.includes(operation)), providerVerified: false, scope,
    };
  }
  return unavailable;
}

export function resolveBrowserTool(ctx, agent, name) {
  const operation = /^(?:dsh_)?browser_(open|execute|click)$/.exec(name)?.[1];
  if (!operation) throw new Error('不支持的浏览器操作。');
  const status = browserToolStatus(ctx, agent);
  if (!status.prefix || !status.available.includes(operation)) {
    throw new Error(`当前任务未提供可用的浏览器 ${operation} 工具。请检查浏览器插件是否启用，以及当前任务的工具限制；不会绕过限制或重试其他工具名称。`);
  }
  return status.prefix + operation;
}

export function observeBrowserTools(ctx, monitor, ready) {
  const restrictedTasks = new Set();
  let legacyRestricted = false;
  const updateRestriction = () => { monitor.restricted = legacyRestricted || restrictedTasks.size > 0; };
  ctx.on('tools/execute', async (exec, next) => {
    const academic = exec.name.startsWith('academic_proxy_');
    if (academic) await ready;
    if (!academic && !/^(?:dsh_)?browser_/.test(exec.name)) return next();
    monitor.busy++;
    try {
      await monitor.flight?.catch(() => {});
      const result = await next();
      if (/^(?:dsh_)?browser_restrict$/.test(exec.name) && !result.isError) {
        const restricted = Array.isArray(exec.arguments.allowed) && exec.arguments.allowed.length > 0;
        if (exec.name === 'browser_restrict') legacyRestricted = restricted;
        else {
          const taskId = exec.agent?.id ?? 'unknown';
          if (restricted) {
            if (!restrictedTasks.has(taskId)) exec.agent?.ctx?.effect?.(() => () => {
              restrictedTasks.delete(taskId);
              updateRestriction();
            });
            restrictedTasks.add(taskId);
          } else restrictedTasks.delete(taskId);
        }
        updateRestriction();
      }
      return result;
    } finally { monitor.busy--; }
  });
}
