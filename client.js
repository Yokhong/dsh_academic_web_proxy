/* DSH 0.2.0-rc.2 client entry. Original implementation; no build step. */
window.__ModuleLoader__.load({ id: 'dsh-academic-web-proxy', factory(require) {
  const module = { exports: {} };
  const React = require('react');
  const h = React.createElement;
  const NAME = 'dsh-academic-web-proxy';
  const NS = 'settings.' + NAME;
  const ROUTE = 'api/' + NAME;
  const FIELDS = ['enabled', 'useDefaultHostnames', 'customHostnames', 'loginUrlScheme', 'proxiedUrlScheme'];
  const SAVE_DELAY = 600;
  const STATUS_DELAY = 5000;

  const zh = {
    nav: '学术网页代理', title: '学术网页代理',
    lead: '为指定学术网站使用你的机构代理。修改后会自动保存，请先填写机构提供的代理模板。',
    loading: '正在读取设置…', loadFailed: '无法读取设置', retry: '重试读取',
    saved: '已保存', waiting: '有修改，等待自动保存…', saving: '正在保存…', saveFailed: '保存失败，修改仍保留在本页。',
    retrySave: '重试保存', reload: '重新读取服务器设置（保留草稿）',
    conflict: '设置已被其他页面修改。已暂停自动保存，并保留你的草稿；请重新读取服务器设置后合并。',
    review: '服务器设置已读取，草稿仍保留。请对照下方服务器值；合并时保留本页修改，其他字段采用服务器值。',
    merge: '合并本页修改并保存', serverValues: '查看最新服务器设置',
    invalidResponse: '服务器返回的设置格式不正确。', requestFailed: '请求失败', timeout: '请求超时，请重试。',
    enabled: '启用学术网页代理', enabledHint: '总开关。关闭后停止代理；配置仍会保留。',
    templates: '代理模板', login: 'Login URL Scheme（登录 URL 模板）', proxied: 'Proxied URL Scheme（代理 URL 模板）',
    templateHint: '两个字段均可留空。仅填写你的机构提供的模板；下面是通用示例，不会自动填入。',
    loginExample: '示例：https://login.example.edu/login?qurl=%u',
    proxiedExample: '示例：%h.proxy.example.edu/%p',
    placeholders: '模板占位符', wholeUrl: '%u：编码整个原始 URL。',
    hostname: '%h：原始主机名；HTTPS 主机名中的点号会替换为连字符。',
    path: '%p：原始路径、查询参数和片段。',
    defaults: '默认域名', useDefaults: '启用默认域名组', defaultsHint: '默认域名由服务端提供。关闭这组后，自定义域名仍然生效。',
    listDefaults: '查看默认域名（{count}）', custom: '自定义域名',
    customHint: '只匹配完整域名，不自动包含子域名。例如 example.org 不匹配 www.example.org。可添加与默认组相同的域名，以便独立启用。',
    domainLabel: '添加自定义域名', domainPlaceholder: '例如 journals.example.org',
    domainHint: '仅输入域名；会去除首尾空白并转为小写。不要输入 URL、路径、端口或通配符。',
    add: '添加域名', remove: '移除 {hostname}', emptyDomains: '还没有自定义域名。',
    invalidHostname: '请输入有效的完整域名，不含协议、路径、端口、通配符或空格。', duplicateHostname: '这个自定义域名已存在。',
    draftHostname: '尚有待添加的域名；点击“添加域名”后才会保存。',
    runtime: '运行状态', mode: '兼容适配器模式', unknown: '未知', refreshStatus: '刷新状态',
    statusUnavailable: '当前服务端未提供实时状态接口，显示最近一次设置响应中的状态。',
    statusFailed: '实时状态暂时无法刷新；下方保留上次读取结果。',
    blocked: '需要人工操作', guestId: '浏览器 guest ID', pendingId: '待处理记录 ID',
    pendingHint: '请展示对应页面，在共享浏览器中完成登录或验证后继续。',
    present: '展示对应浏览器页面', presenting: '正在展示…', presented: '页面已展示，请在共享浏览器中完成操作。',
    presentFailed: '无法展示页面', presentUnconfirmed: '浏览器未确认页面已展示。请重试，或手动打开对应 guest ID 的页面。',
    urlHidden: '地址不可显示', on: '开启', off: '关闭', blank: '留空', none: '无',
  };
  const en = {
    nav: 'Academic Web Proxy', title: 'Academic Web Proxy',
    lead: 'Use your institution’s proxy for selected academic websites. Edits save automatically; enter the proxy templates supplied by your institution.',
    loading: 'Loading settings…', loadFailed: 'Could not load settings', retry: 'Retry loading',
    saved: 'Saved', waiting: 'Changes waiting to save…', saving: 'Saving…', saveFailed: 'Save failed. Your edits are still here.',
    retrySave: 'Retry saving', reload: 'Reload server settings (keep draft)',
    conflict: 'Another page changed these settings. Autosave is paused and your draft is preserved. Reload the server settings to merge your edits.',
    review: 'Server settings loaded; your draft is preserved. Review the server values below. Merging keeps your edits and uses server values for other fields.',
    merge: 'Merge my edits and save', serverValues: 'View latest server settings',
    invalidResponse: 'The server returned invalid settings.', requestFailed: 'Request failed', timeout: 'The request timed out. Please retry.',
    enabled: 'Enable Academic Web Proxy', enabledHint: 'Global switch. Turning it off stops proxying and keeps your configuration.',
    templates: 'Proxy templates', login: 'Login URL Scheme', proxied: 'Proxied URL Scheme',
    templateHint: 'Both fields may be empty. Enter templates supplied by your institution. The generic examples below are never prefilled.',
    loginExample: 'Example: https://login.example.edu/login?qurl=%u',
    proxiedExample: 'Example: %h.proxy.example.edu/%p',
    placeholders: 'Template placeholders', wholeUrl: '%u: encode the entire original URL.',
    hostname: '%h: original hostname; dots become hyphens for HTTPS hostnames.',
    path: '%p: original path, query string and fragment.',
    defaults: 'Default hostnames', useDefaults: 'Enable the default hostname group', defaultsHint: 'Default hostnames come from the server. Custom hostnames still work when this group is off.',
    listDefaults: 'View default hostnames ({count})', custom: 'Custom hostnames',
    customHint: 'Only the exact hostname matches; subdomains are not included. For example, example.org does not match www.example.org. A default hostname may also be added here to enable it independently.',
    domainLabel: 'Add a custom hostname', domainPlaceholder: 'e.g. journals.example.org',
    domainHint: 'Enter only a hostname. Leading/trailing whitespace is removed and letters are lowercased. No URLs, paths, ports or wildcards.',
    add: 'Add hostname', remove: 'Remove {hostname}', emptyDomains: 'No custom hostnames yet.',
    invalidHostname: 'Enter a full hostname without a scheme, path, port, wildcard or spaces.', duplicateHostname: 'This custom hostname already exists.',
    draftHostname: 'A hostname has not been added yet. Choose “Add hostname” to save it.',
    runtime: 'Runtime status', mode: 'Compatibility adapter mode', unknown: 'Unknown', refreshStatus: 'Refresh status',
    statusUnavailable: 'This server does not provide a live status endpoint. Showing the latest settings response status.',
    statusFailed: 'Live status could not be refreshed. Showing the previous result.',
    blocked: 'Human action needed', guestId: 'Browser guest ID', pendingId: 'Pending record ID',
    pendingHint: 'Present the corresponding page and complete login or verification in the shared browser.',
    present: 'Present corresponding browser page', presenting: 'Presenting…', presented: 'Page presented. Complete the action in the shared browser.',
    presentFailed: 'Could not present the page', presentUnconfirmed: 'The browser did not confirm presentation. Retry or open the page with the corresponding guest ID manually.',
    urlHidden: 'Address unavailable', on: 'On', off: 'Off', blank: 'Empty', none: 'None',
  };
  const fallbackTranslate = (key, values) => (zh[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ''));

  function normalizeHostname(input) {
    if (typeof input !== 'string') return null;
    const text = input.trim().replace(/\.$/, '');
    if (!text || text.length > 253 || /[\s/:?#@\\*%]/u.test(text)) return null;
    let value;
    try { value = new URL('https://' + text).hostname.toLowerCase(); } catch (_) { return null; }
    if (value.length > 253 || !value.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(value)) return null;
    if (!value.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return null;
    return value;
  }
  const copySettings = settings => ({
    enabled: settings.enabled, useDefaultHostnames: settings.useDefaultHostnames,
    customHostnames: [...settings.customHostnames],
    loginUrlScheme: settings.loginUrlScheme, proxiedUrlScheme: settings.proxiedUrlScheme,
  });
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const validId = id => (typeof id === 'string' && id.length > 0) || Number.isSafeInteger(id);
  const idKey = id => typeof id + ':' + String(id);

  function readEnvelope(data) {
    const settings = data?.settings;
    if (!settings || typeof settings.enabled !== 'boolean' || typeof settings.useDefaultHostnames !== 'boolean'
      || !Array.isArray(settings.customHostnames) || !settings.customHostnames.every(host => typeof host === 'string' && normalizeHostname(host) === host)
      || typeof settings.loginUrlScheme !== 'string' || typeof settings.proxiedUrlScheme !== 'string'
      || !Number.isSafeInteger(data.revision) || data.revision < 0
      || !Array.isArray(data.defaultHostnames) || !data.defaultHostnames.every(host => typeof host === 'string')
      || !data.status || typeof data.status.mode !== 'string') {
      throw Object.assign(new Error('invalidResponse'), { key: 'invalidResponse' });
    }
    return { settings: copySettings(settings), defaultHostnames: [...data.defaultHostnames], revision: data.revision, status: data.status };
  }

  // Retain remote edits to untouched fields, and merge independent hostname additions/removals.
  function mergeSettings(base, local, remote) {
    const merged = copySettings(remote);
    for (const key of FIELDS) {
      if (key !== 'customHostnames' && !equal(base[key], local[key])) merged[key] = local[key];
    }
    const removed = new Set(base.customHostnames.filter(host => !local.customHostnames.includes(host)));
    merged.customHostnames = [...new Set([
      ...remote.customHostnames.filter(host => !removed.has(host)),
      ...local.customHostnames.filter(host => !base.customHostnames.includes(host)),
    ])];
    return merged;
  }

  // Status URLs are display-only. Never expose credentials, query values or fragments.
  function displayUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      return url.origin + url.pathname + (url.search ? '?…' : '') + (url.hash ? '#…' : '');
    } catch (_) { return ''; }
  }
  function safeMessage(value) {
    return typeof value === 'string' ? value.replace(/https?:\/\/[^\s<>"']+/gi, url => displayUrl(url) || '[URL]') : '';
  }

  // Owned by the plugin, not the mounted page: navigation cannot drop a debounced draft.
  function createSettingsController(options = {}) {
    const requestFetch = options.fetch || ((...args) => fetch(...args));
    const clock = options.now || Date.now;
    const later = options.setTimeout || setTimeout;
    const cancel = options.clearTimeout || clearTimeout;
    const listeners = new Set();
    const requests = new Set();
    let alive = true;
    let saved = null;
    let saveTimer = null;
    let pollTimer = null;
    let inFlight = false;
    let statusInFlight = false;
    let statusAgain = false;
    let editVersion = 0;
    let dueAt = 0;
    let statusRequest = 0;
    let statusApplied = 0;
    let state = {
      settings: null, defaultHostnames: [], revision: null, loading: false, loadError: null,
      saveState: 'saved', saveError: null, review: null,
      hostnameInput: '', hostnameError: '', status: null, statusError: null, statusUnavailable: false,
      statusLoading: false, presenting: [], presented: [], presentError: null,
    };
    const publish = patch => {
      if (!alive) return;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
    };
    const dirty = () => state.settings && !equal(state.settings, saved);
    const clearSaveTimer = () => { if (saveTimer !== null) cancel(saveTimer); saveTimer = null; };
    const clearPollTimer = () => { if (pollTimer !== null) cancel(pollTimer); pollTimer = null; };
    const failure = error => ({ key: error?.key || '', message: safeMessage(error?.message) || '', status: error?.status || 0 });
    const latestStatus = (status, ticket) => {
      if (ticket < statusApplied) return {};
      statusApplied = ticket;
      return { status };
    };

    async function request(path, method = 'GET', body) {
      const abort = new AbortController();
      requests.add(abort);
      let timedOut = false;
      const timeout = later(() => { timedOut = true; abort.abort(); }, 15000);
      try {
        const response = await requestFetch(ROUTE + path, {
          method, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
          headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abort.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.error) {
          throw Object.assign(new Error(typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`), { status: response.status });
        }
        if (!data || typeof data !== 'object') throw Object.assign(new Error('invalidResponse'), { key: 'invalidResponse' });
        return data;
      } catch (error) {
        if (timedOut) throw Object.assign(new Error('timeout'), { key: 'timeout' });
        throw error;
      } finally {
        cancel(timeout);
        requests.delete(abort);
      }
    }

    function scheduleSave() {
      clearSaveTimer();
      if (!alive || !dirty() || state.loading || inFlight || ['conflict', 'review', 'error'].includes(state.saveState)) return;
      publish({ saveState: 'waiting' });
      saveTimer = later(() => { saveTimer = null; void save(); }, Math.max(0, dueAt - clock()));
    }
    async function save() {
      if (!alive || inFlight || state.loading || !dirty() || ['conflict', 'review', 'error'].includes(state.saveState)) return;
      clearSaveTimer();
      inFlight = true;
      const sent = copySettings(state.settings);
      const version = editVersion;
      const statusTicket = ++statusRequest;
      publish({ saveState: 'saving', saveError: null });
      try {
        const data = readEnvelope(await request('/settings', 'POST', { settings: sent, revision: state.revision }));
        if (!alive) return;
        saved = data.settings;
        // Apply normalization only where the user has not typed since this request began.
        const next = copySettings(state.settings);
        for (const key of FIELDS) {
          if (version === editVersion || equal(next[key], sent[key])) next[key] = saved[key];
        }
        publish({ settings: copySettings(next), revision: data.revision, defaultHostnames: data.defaultHostnames, loadError: null,
          ...latestStatus(data.status, statusTicket), saveState: equal(next, saved) ? 'saved' : 'waiting' });
      } catch (error) {
        if (!alive) return;
        clearSaveTimer();
        publish({ saveState: error?.status === 409 ? 'conflict' : 'error', saveError: failure(error) });
      } finally {
        inFlight = false;
        if (alive) scheduleSave();
      }
    }

    async function load() {
      if (!alive || state.loading || inFlight) return;
      clearSaveTimer();
      const version = editVersion;
      const statusTicket = ++statusRequest;
      publish({ loading: true, loadError: null, review: null });
      try {
        const data = readEnvelope(await request('/settings'));
        if (!alive) return;
        const preserveDraft = saved && (dirty() || version !== editVersion);
        if (preserveDraft) {
          publish({ review: data, saveState: 'review', saveError: null });
        } else {
          saved = data.settings;
          publish({ settings: copySettings(data.settings), revision: data.revision, saveState: 'saved', saveError: null });
        }
        publish({ defaultHostnames: data.defaultHostnames, ...latestStatus(data.status, statusTicket) });
      } catch (error) {
        if (alive) publish({ loadError: failure(error),
          ...(dirty() && !['conflict', 'review'].includes(state.saveState) ? { saveState: 'error' } : {}) });
      } finally {
        if (alive) {
          publish({ loading: false });
          scheduleStatus(0);
        }
      }
    }

    function edit(key, value) {
      if (!alive || !state.settings || !FIELDS.includes(key)) return;
      const next = copySettings(state.settings);
      next[key] = key === 'customHostnames' ? [...value] : value;
      if (equal(next, state.settings)) return;
      editVersion++;
      dueAt = clock() + SAVE_DELAY;
      const paused = ['conflict', 'review'].includes(state.saveState);
      publish({ settings: next, saveState: paused ? state.saveState : inFlight ? 'saving' : equal(next, saved) ? 'saved' : 'waiting',
        saveError: paused ? state.saveError : null });
      scheduleSave();
    }

    function scheduleStatus(delay = STATUS_DELAY) {
      clearPollTimer();
      if (!alive || !listeners.size || !state.settings || state.statusUnavailable || statusInFlight) return;
      pollTimer = later(() => { pollTimer = null; void refreshStatus(); }, delay);
    }
    async function refreshStatus() {
      if (!alive || !state.settings) return;
      if (statusInFlight) { statusAgain = true; return; }
      clearPollTimer();
      statusInFlight = true;
      const statusTicket = ++statusRequest;
      publish({ statusLoading: true });
      try {
        const data = await request('/status');
        const status = data.status || data;
        if (typeof status.mode !== 'string') throw Object.assign(new Error('invalidResponse'), { key: 'invalidResponse' });
        if (!alive) return;
        publish({ ...latestStatus(status, statusTicket), statusError: null, statusUnavailable: false });
      } catch (error) {
        if (alive) publish(error?.status === 404 || error?.status === 405
          ? { statusUnavailable: true, statusError: null }
          : { statusError: failure(error) });
      } finally {
        statusInFlight = false;
        if (alive) {
          publish({ statusLoading: false });
          const again = statusAgain;
          statusAgain = false;
          scheduleStatus(again ? 0 : STATUS_DELAY);
        }
      }
    }
    async function present(id) {
      if (!alive || !validId(id) || state.presenting.includes(idKey(id))) return;
      const key = idKey(id);
      publish({ presenting: [...state.presenting, key], presented: state.presented.filter(item => item !== key), presentError: null });
      try {
        const result = await request('/present', 'POST', { id });
        if (result.presented === false) throw Object.assign(new Error('presentUnconfirmed'), { key: 'presentUnconfirmed' });
        if (alive) {
          publish({ presented: [...state.presented, key] });
          void refreshStatus();
        }
      } catch (error) { if (alive) publish({ presentError: failure(error) }); }
      finally { if (alive) publish({ presenting: state.presenting.filter(item => item !== key) }); }
    }

    return {
      getState: () => state,
      hasUnsaved: () => Boolean(dirty() || inFlight || state.hostnameInput.trim()),
      subscribe(listener) {
        if (!alive) return () => {};
        listeners.add(listener);
        scheduleStatus(0);
        return () => { listeners.delete(listener); if (!listeners.size) clearPollTimer(); };
      },
      start() { if (!state.settings && !state.loading) void load(); },
      load, edit, refreshStatus, present,
      setHostnameInput(value) { publish({ hostnameInput: value, hostnameError: '' }); },
      addHostname() {
        if (!state.settings) return false;
        const hostname = normalizeHostname(state.hostnameInput);
        if (!hostname) { publish({ hostnameError: 'invalidHostname' }); return false; }
        if (state.settings.customHostnames.includes(hostname)) { publish({ hostnameError: 'duplicateHostname' }); return false; }
        edit('customHostnames', [...state.settings.customHostnames, hostname]);
        publish({ hostnameInput: '', hostnameError: '' });
        return true;
      },
      removeHostname(hostname) { if (state.settings) edit('customHostnames', state.settings.customHostnames.filter(item => item !== hostname)); },
      retrySave() {
        if (!alive || state.saveState !== 'error') return;
        dueAt = clock();
        publish({ saveState: 'waiting', saveError: null });
        scheduleSave();
      },
      mergeAndSave() {
        if (!alive || !state.review || state.loading || inFlight) return;
        const data = state.review;
        const settings = mergeSettings(saved, state.settings, data.settings);
        saved = copySettings(data.settings);
        editVersion++;
        dueAt = clock();
        publish({ settings, revision: data.revision, review: null, saveError: null, saveState: equal(settings, saved) ? 'saved' : 'waiting' });
        scheduleSave();
      },
      dispose() {
        alive = false;
        clearSaveTimer();
        clearPollTimer();
        for (const abort of requests) abort.abort();
        requests.clear();
        listeners.clear();
      },
    };
  }

  const CSS = `
.dsh-awp { color: inherit; font: inherit; font-size: 13px; line-height: 1.6; max-width: 900px; min-width: 0; padding: 4px 2px 20px; }
.dsh-awp *, .dsh-awp *::before, .dsh-awp *::after { box-sizing: border-box; }
.dsh-awp .dsh-awp-title { font-size: 20px; margin: 0 0 8px; }
.dsh-awp .dsh-awp-lead, .dsh-awp .dsh-awp-hint { opacity: .78; margin: 5px 0 10px; overflow-wrap: anywhere; }
.dsh-awp .dsh-awp-card { min-width: 0; border: 1px solid rgba(128,128,128,.35); border-radius: 10px; padding: 16px; margin: 16px 0; }
.dsh-awp .dsh-awp-heading { font-size: 15px; margin: 0 0 10px; font-weight: 650; }
.dsh-awp .dsh-awp-toggle { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.dsh-awp .dsh-awp-check { flex-shrink: 0; width: 17px; height: 17px; margin: 3px 0 0; accent-color: #4b85d1; }
.dsh-awp .dsh-awp-field { display: block; margin: 14px 0 0; font-weight: 600; }
.dsh-awp .dsh-awp-input { display: block; width: 100%; min-width: 0; padding: 9px 10px; margin-top: 6px; border-radius: 6px; border: 1px solid rgba(128,128,128,.55); background: transparent; color: inherit; font: inherit; }
.dsh-awp .dsh-awp-input[aria-invalid="true"] { border-color: #d55d64; }
.dsh-awp .dsh-awp-button { border: 1px solid rgba(128,128,128,.5); border-radius: 6px; padding: 7px 12px; min-height: 36px; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.dsh-awp .dsh-awp-button:hover { background: rgba(128,128,128,.12); }
.dsh-awp .dsh-awp-button:disabled { opacity: .55; cursor: default; }
.dsh-awp .dsh-awp-button:focus-visible, .dsh-awp .dsh-awp-input:focus-visible, .dsh-awp .dsh-awp-check:focus-visible, .dsh-awp .dsh-awp-summary:focus-visible { outline: 2px solid #5594df; outline-offset: 3px; }
.dsh-awp .dsh-awp-actions, .dsh-awp .dsh-awp-add { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.dsh-awp .dsh-awp-add .dsh-awp-input { flex: 1 1 220px; margin: 0; }
.dsh-awp .dsh-awp-save { min-height: 28px; margin: 10px 0; }
.dsh-awp .dsh-awp-error { color: #db6268; overflow-wrap: anywhere; margin: 8px 0; }
.dsh-awp .dsh-awp-notice { padding: 12px; border: 1px solid rgba(198,145,61,.65); border-radius: 6px; margin: 10px 0; overflow-wrap: anywhere; }
.dsh-awp .dsh-awp-summary { cursor: pointer; padding: 6px 0; }
.dsh-awp .dsh-awp-domains { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 4px 18px; padding-left: 20px; margin: 10px 0; overflow-wrap: anywhere; }
.dsh-awp .dsh-awp-custom { list-style: none; margin: 10px 0 0; padding: 0; }
.dsh-awp .dsh-awp-domain { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(128,128,128,.2); }
.dsh-awp .dsh-awp-code { font-family: ui-monospace, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; }
.dsh-awp .dsh-awp-domain .dsh-awp-button { flex-shrink: 0; }
.dsh-awp .dsh-awp-defs { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(0, 3fr); gap: 6px 12px; margin: 10px 0; }
.dsh-awp .dsh-awp-defs dt { font-weight: 600; }
.dsh-awp .dsh-awp-defs dd { margin: 0; overflow-wrap: anywhere; }
.dsh-awp .dsh-awp-list { padding-left: 20px; }
@media (max-width: 520px) {
  .dsh-awp .dsh-awp-card { padding: 12px; }
  .dsh-awp .dsh-awp-domains, .dsh-awp .dsh-awp-defs { grid-template-columns: minmax(0, 1fr); }
  .dsh-awp .dsh-awp-add .dsh-awp-button { width: 100%; }
}`;

  function SettingsRoot({ controller, t = fallbackTranslate }) {
    const [state, setState] = React.useState(controller.getState);
    const uid = React.useId();
    const id = suffix => 'dsh-awp-' + uid + '-' + suffix;
    React.useEffect(() => {
      const unsubscribe = controller.subscribe(setState);
      setState(controller.getState());
      controller.start();
      return unsubscribe;
    }, [controller]);
    const message = error => error ? (error.key ? t(error.key) : error.message || t('requestFailed')) : '';
    const button = (text, onClick, props = {}) => h('button', { type: 'button', className: 'dsh-awp-button', onClick, ...props }, text);
    const errorLine = (label, error) => error ? h('p', { className: 'dsh-awp-error', role: 'alert' }, label + ': ' + message(error)) : null;
    const hint = (text, props = {}) => h('p', { className: 'dsh-awp-hint', ...props }, text);
    const card = (key, title, ...children) => h('section', { className: 'dsh-awp-card', key, 'aria-labelledby': id(key) },
      h('h3', { className: 'dsh-awp-heading', id: id(key) }, title), ...children);
    const toggle = (key, title, help) => h('div', null,
      h('label', { className: 'dsh-awp-toggle', htmlFor: id(key) },
        h('input', { className: 'dsh-awp-check', type: 'checkbox', id: id(key), checked: state.settings[key],
          'aria-describedby': id(key + '-help'), onChange: event => controller.edit(key, event.target.checked) }),
        h('span', null, title)), hint(help, { id: id(key + '-help') }));
    const root = (...children) => h('div', { className: 'dsh-awp' }, h('style', null, CSS),
      h('h2', { className: 'dsh-awp-title' }, t('title')), ...children);

    if (!state.settings) return root(
      state.loading || !state.loadError ? h('p', { role: 'status' }, t('loading')) : null,
      errorLine(t('loadFailed'), state.loadError),
      state.loadError ? button(t('retry'), () => controller.load(), { disabled: state.loading }) : null);

    const serverValues = state.review?.settings;
    const fieldNames = { enabled: 'enabled', useDefaultHostnames: 'useDefaults', customHostnames: 'custom', loginUrlScheme: 'login', proxiedUrlScheme: 'proxied' };
    const status = state.status || { mode: t('unknown') };
    const pending = Array.isArray(status.pending) ? status.pending.filter(item => item && validId(item.id)) : [];
    const saveNotice = state.saveState === 'conflict' ? t('conflict') : state.saveState === 'review' ? t('review') : state.saveState === 'error' ? t('saveFailed') : t(state.saveState);
    const template = (field, label, example) => h('div', { key: field },
      h('label', { className: 'dsh-awp-field', htmlFor: id(field) }, t(label)),
      h('input', { id: id(field), className: 'dsh-awp-input', type: 'text', value: state.settings[field],
        autoComplete: 'off', spellCheck: false, 'aria-describedby': id(field + '-example'),
        onChange: event => controller.edit(field, event.target.value) }),
      hint(t(example), { className: 'dsh-awp-hint dsh-awp-code', id: id(field + '-example') }));

    return root(
      h('p', { className: 'dsh-awp-lead' }, t('lead')),
      h('div', { className: 'dsh-awp-save', role: 'status', 'aria-live': 'polite', 'aria-atomic': true }, saveNotice),
      state.hostnameInput.trim() ? hint(t('draftHostname')) : null,
      errorLine(t('saveFailed'), state.saveError),
      errorLine(t('loadFailed'), state.loadError),
      ['error', 'conflict', 'review'].includes(state.saveState) || state.loadError ? h('div', { className: 'dsh-awp-actions' },
        state.saveState === 'error' ? button(t('retrySave'), () => controller.retrySave(), { disabled: state.loading }) : null,
        button(state.loading ? t('loading') : t('reload'), () => controller.load(), { disabled: state.loading || state.saveState === 'saving' }),
        state.review ? button(t('merge'), () => controller.mergeAndSave(), { disabled: state.loading }) : null) : null,
      serverValues ? h('details', { className: 'dsh-awp-notice', open: true },
        h('summary', { className: 'dsh-awp-summary' }, t('serverValues')),
        h('dl', { className: 'dsh-awp-defs' }, FIELDS.flatMap(key => [
          h('dt', { key: key + '-label' }, t(fieldNames[key])),
          h('dd', { key }, typeof serverValues[key] === 'boolean' ? t(serverValues[key] ? 'on' : 'off')
            : Array.isArray(serverValues[key]) ? serverValues[key].join(', ') || t('none') : serverValues[key] || t('blank')),
        ]))) : null,
      card('global', t('enabled'), toggle('enabled', t('enabled'), t('enabledHint'))),
      card('templates', t('templates'), hint(t('templateHint')),
        template('loginUrlScheme', 'login', 'loginExample'), template('proxiedUrlScheme', 'proxied', 'proxiedExample'),
        h('h4', { className: 'dsh-awp-heading' }, t('placeholders')),
        h('ul', { className: 'dsh-awp-list' }, ['wholeUrl', 'hostname', 'path'].map(key => h('li', { key }, t(key))))),
      card('defaults', t('defaults'), toggle('useDefaultHostnames', t('useDefaults'), t('defaultsHint')),
        h('details', null, h('summary', { className: 'dsh-awp-summary' }, t('listDefaults', { count: state.defaultHostnames.length })),
          h('ul', { className: 'dsh-awp-domains' }, state.defaultHostnames.map((host, index) => h('li', { key: host + index, className: 'dsh-awp-code' }, host))))),
      card('custom', t('custom'), hint(t('customHint')),
        h('form', { onSubmit: event => { event.preventDefault(); controller.addHostname(); } },
          h('label', { className: 'dsh-awp-field', htmlFor: id('hostname') }, t('domainLabel')),
          h('div', { className: 'dsh-awp-add' },
            h('input', { className: 'dsh-awp-input', id: id('hostname'), type: 'text', value: state.hostnameInput,
              placeholder: t('domainPlaceholder'), autoComplete: 'off', autoCapitalize: 'none', spellCheck: false,
              'aria-invalid': Boolean(state.hostnameError), 'aria-describedby': id('hostname-help') + (state.hostnameError ? ' ' + id('hostname-error') : ''),
              onChange: event => controller.setHostnameInput(event.target.value) }),
            h('button', { className: 'dsh-awp-button', type: 'submit' }, t('add'))),
          hint(t('domainHint'), { id: id('hostname-help') }),
          state.hostnameError ? h('p', { className: 'dsh-awp-error', id: id('hostname-error'), role: 'alert' }, t(state.hostnameError)) : null),
        state.settings.customHostnames.length ? h('ul', { className: 'dsh-awp-custom' }, state.settings.customHostnames.map(host =>
          h('li', { className: 'dsh-awp-domain', key: host }, h('span', { className: 'dsh-awp-code' }, host),
            button('×', () => controller.removeHostname(host), { 'aria-label': t('remove', { hostname: host }), title: t('remove', { hostname: host }) }))))
          : hint(t('emptyDomains'))),
      card('runtime', t('runtime'),
        h('dl', { className: 'dsh-awp-defs' }, h('dt', null, t('mode')), h('dd', { className: 'dsh-awp-code' }, safeMessage(status.mode))),
        status.message ? hint(safeMessage(status.message)) : null,
        state.statusUnavailable ? hint(t('statusUnavailable')) : null,
        state.statusError ? errorLine(t('statusFailed'), state.statusError) : null,
        button(t('refreshStatus'), () => controller.refreshStatus(), { disabled: state.statusLoading }),
        errorLine(t('presentFailed'), state.presentError),
        pending.length ? h('div', { className: 'dsh-awp-notice', role: 'status', 'aria-live': 'polite' },
          h('h4', { className: 'dsh-awp-heading' }, t('blocked')), hint(t('pendingHint')),
          pending.map((item, index) => {
            const key = idKey(item.id);
            const busy = state.presenting.includes(key);
            const guestId = validId(item.guestId) ? item.guestId : item.id;
            const url = displayUrl(item.displayUrl || item.url || item.targetUrl);
            return h('div', { key: key + index, className: 'dsh-awp-card' },
              h('dl', { className: 'dsh-awp-defs' }, h('dt', null, t('guestId')), h('dd', { className: 'dsh-awp-code' }, String(guestId)),
                guestId !== item.id ? h('dt', null, t('pendingId')) : null,
                guestId !== item.id ? h('dd', { className: 'dsh-awp-code' }, String(item.id)) : null),
              hint(url || t('urlHidden'), { className: 'dsh-awp-hint dsh-awp-code' }),
              item.message ? hint(safeMessage(item.message)) : null,
              button(busy ? t('presenting') : t('present'), () => controller.present(item.id), {
                disabled: busy, 'aria-label': t('present') + ': ' + String(guestId),
              }), state.presented.includes(key) ? hint(t('presented')) : null);
          })) : null));
  }

  function apply(ctx) {
    const controller = createSettingsController();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), NAME + ': locale');
    ctx.effect(() => {
      const beforeUnload = event => {
        if (controller.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; }
      };
      window.addEventListener('beforeunload', beforeUnload);
      return () => { window.removeEventListener('beforeunload', beforeUnload); controller.dispose(); };
    }, NAME + ': state and requests');
    const t = ctx.locale.bind(NS);
    // slots.inject and its registration belong to the Cordis effect scope and dispose together.
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id: NAME, order: 65, label: () => t('nav'), locale: NS,
      inject: () => ({ controller, t }),
    }, SettingsRoot));
  }

  module.exports = { name: NAME, inject: ['slots', 'locale'], apply,
    // Dependency-free entry points for exercising the same controller used by the page.
    createSettingsController, normalizeHostname, displayUrl };
  return module.exports;
}});
