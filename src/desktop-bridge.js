import { open } from 'node:fs/promises';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENDPOINT_FILE = 'dsh-builtin-browser-bridge.json';
const ENDPOINT_LIMIT = 16 * 1024;
const MAX_EXPRESSION_BYTES = 512 * 1024;

function failure(code, message, retryable = false) {
  return Object.assign(new Error(`Desktop bridge: ${message}`), { code, retryable });
}

function boundedInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function guestId(value) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return boundedInteger(value, 'guest id', 1, Number.MAX_SAFE_INTEGER);
}

function messageOf(value, token = '') {
  // Never propagate the endpoint, raw response, or JSON parser diagnostics.
  let text = typeof value === 'string' ? value : 'command failed';
  if (token) text = text.split(token).join('[redacted]');
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 400);
}

function inventory(answer) {
  const raw = Array.isArray(answer.guests) ? answer.guests : answer.sidebar;
  if (!Array.isArray(raw)) throw failure('EPROTOCOL', 'list response has no guest array');
  const seen = new Set();
  return raw.filter(item => {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 ||
        typeof item.type !== 'string' || item.destroyed === true || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).map(({ id, type, url, title }) => ({
    id, type, url: typeof url === 'string' ? url : '', title: typeof title === 'string' ? title : '',
  }));
}

function evaluationValue(result) {
  if (result?.exceptionDetails) {
    const detail = result.exceptionDetails;
    throw failure('EEVALUATE', `JavaScript evaluation failed: ${messageOf(detail.exception?.description ?? detail.text)}`);
  }
  const remote = result?.result;
  if (!remote || typeof remote !== 'object') throw failure('EPROTOCOL', 'evaluation returned no remote value');
  if (Object.hasOwn(remote, 'value')) return remote.value;
  if (remote.type === 'undefined') return undefined;
  switch (remote.unserializableValue) {
    case 'NaN': return NaN;
    case 'Infinity': return Infinity;
    case '-Infinity': return -Infinity;
    case '-0': return -0;
    default:
      if (remote.type === 'bigint' && /^-?\d+n$/.test(remote.unserializableValue ?? '')) {
        return BigInt(remote.unserializableValue.slice(0, -1));
      }
      throw failure('EPROTOCOL', 'evaluation value cannot be returned by value');
  }
}

/**
 * Fixed shell script, derived from installed Desktop 2.0.17 sources:
 * @deepseek-ai/dsh-client-ui-sidebar-browser/lib/client.js:
 *   ElectronWebviewPresentation.createElement -> data-sidebar-browser-frame.
 * @deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js:
 *   TabSlot -> data-sidebar-right-tab/occurrence; SidebarPanel -> panel/open;
 *   SessionView -> hidden; PanelChrome -> actual data-sidebar-right-toggle.
 * @deepseek-ai/dsh-web-frontend/dist/assets/index-5SrrfWpU.js:
 *   DockLayout -> role=tab, data-dockkit-tab/pane, aria-selected, onClick focus.
 * No URL/title matching, React internals, synthetic tab creation, or DOM mutation.
 * Unknown DOM versions fail closed. The script uses only DOM reads and .click()
 * on the exact shell controls; it never evaluates guest-supplied script.
 */
function shellGuest(id, act, allowExpand) {
  const no = reason => ({ found: true, presented: false, reason });
  const exact = [...document.querySelectorAll('webview[data-sidebar-browser-frame]')].filter(view => {
    try { return view.getWebContentsId() === id; } catch { return false; }
  });
  if (exact.length === 0) return { found: false, presented: false };
  if (exact.length !== 1) return no('The shell exposes more than one element for this guest.');
  const view = exact[0];
  const body = view.closest('[data-sidebar-right-tab]');
  const panel = view.closest('[data-sidebar-right-panel][data-sidebar-right-session]');
  const pane = view.closest('[data-dockkit-pane], [data-dockkit-float]');
  if (!body || !panel || !pane) return no('The exact guest has no supported sidebar tab mapping.');
  const tabId = body.getAttribute('data-sidebar-right-tab');
  const occurrence = body.getAttribute('data-sidebar-right-occurrence');
  if (!tabId || !occurrence) return no('The exact guest has no stable sidebar occurrence.');
  for (let node = panel.parentElement; node; node = node.parentElement) {
    if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') {
      return no('The guest belongs to a hidden session; select its conversation first.');
    }
  }
  if (document.visibilityState !== 'visible') return no('The desktop renderer is not visible.');

  const visible = element => {
    if (!element.isConnected) return false;
    for (let node = element; node; node = node.parentElement) {
      if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
          style.contentVisibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect();
    const left = Math.max(rect.left, 0), top = Math.max(rect.top, 0);
    const right = Math.min(rect.right, innerWidth), bottom = Math.min(rect.bottom, innerHeight);
    if (right - left < 2 || bottom - top < 2) return false;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return hit === element || (hit !== null && element.contains(hit));
  };

  // Each retained tab can carry a duplicate strip. Choose the active host's
  // real control inside this panel, never a global or label-based toggle.
  if (!panel.hasAttribute('data-sidebar-right-open')) {
    if (!act || !allowExpand) return { found: true, presented: false, actionable: true };
    const toggles = [...panel.querySelectorAll('button[data-sidebar-right-toggle]')].filter(button => {
      if (button.disabled || button.closest('[data-sidebar-right-panel]') !== panel) return false;
      for (let node = button; node && node !== panel; node = node.parentElement) {
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      }
      return true;
    });
    if (toggles.length !== 1) return no('The collapsed exact sidebar has no unambiguous toggle control.');
    toggles[0].click();
    return { found: true, presented: false, action: 'expanded' };
  }

  if (pane.hasAttribute('data-dockkit-float')) {
    return visible(view) ? { found: true, presented: true } : no('The exact floating guest is not visibly exposed.');
  }
  const paneId = pane.getAttribute('data-dockkit-pane');
  const controls = [...panel.querySelectorAll('[role="tab"][data-dockkit-tab]')].filter(tab => {
    if (tab.getAttribute('data-dockkit-tab') !== tabId ||
        tab.closest('[data-sidebar-right-panel]') !== panel ||
        tab.closest('[data-dockkit-pane]')?.getAttribute('data-dockkit-pane') !== paneId) return false;
    return [...tab.querySelectorAll('[data-sidebar-right-tab][data-sidebar-right-occurrence]')].some(label =>
      label.getAttribute('data-sidebar-right-tab') === tabId &&
      label.getAttribute('data-sidebar-right-occurrence') === occurrence);
  }).filter(visible);
  if (controls.length !== 1) return no('The exact guest has no unique visible tab control.');
  const control = controls[0];
  if (control.getAttribute('aria-selected') !== 'true') {
    if (!act) return { found: true, presented: false, actionable: true };
    control.click();
    return { found: true, presented: false, action: 'selected' };
  }
  return visible(view) ? { found: true, presented: true } : no('The selected guest is not visibly exposed in the desktop shell.');
}

/**
 * Compatibility client for the ALREADY installed dsh-builtin-browser 0.3.1
 * bridge. Each request owns one socket, avoiding response mis-association on
 * the uncorrelated JSON-line protocol. No plugin, endpoint or app is modified.
 *
 * evaluate() accepts trusted caller JavaScript, not untrusted page instructions;
 * it is JSON encoded (never locally eval'd) and returns by value. It is not a
 * JavaScript sandbox. navigate() accepts HTTP(S) and about:blank only.
 * close() cancels this client's sockets; it never closes shared browser tabs.
 */
export class DesktopBridge {
  #endpointPath;
  #profileOrigin = null;
  #profileUrl;
  #requireProfile;
  #scopedIds = new Set();
  #timeoutMs;
  #maxResponseBytes;
  #maxRequestBytes;
  #staleRetries;
  #retryDelayMs;
  #presentationTimeoutMs;
  #pending = new Set();
  #closed = false;

  constructor({
    endpointPath = join(process.env.DSH_HOME || join(homedir(), '.dsh'), ENDPOINT_FILE),
    profileUrl,
    requireProfile = false,
    timeoutMs = 5000,
    maxResponseBytes = 2 * 1024 * 1024,
    maxRequestBytes = 1024 * 1024,
    staleRetries = 1,
    retryDelayMs = 30,
    presentationTimeoutMs = 5000,
  } = {}) {
    if (typeof endpointPath !== 'string' || !endpointPath) throw new TypeError('endpointPath must be a nonempty path');
    this.#endpointPath = endpointPath;
    this.#requireProfile = requireProfile;
    this.#profileUrl = profileUrl;
    this.#refreshProfile();
    this.#timeoutMs = boundedInteger(timeoutMs, 'timeoutMs', 1, 60000);
    this.#maxResponseBytes = boundedInteger(maxResponseBytes, 'maxResponseBytes', 128, 16 * 1024 * 1024);
    this.#maxRequestBytes = boundedInteger(maxRequestBytes, 'maxRequestBytes', 128, 4 * 1024 * 1024);
    this.#staleRetries = boundedInteger(staleRetries, 'staleRetries', 0, 2);
    this.#retryDelayMs = boundedInteger(retryDelayMs, 'retryDelayMs', 0, 1000);
    this.#presentationTimeoutMs = boundedInteger(presentationTimeoutMs, 'presentationTimeoutMs', 1, 30000);
  }

  async #endpoint() {
    let file;
    try {
      file = await open(this.#endpointPath, 'r');
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > ENDPOINT_LIMIT) throw new Error();
      const bytes = Buffer.alloc(ENDPOINT_LIMIT + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > ENDPOINT_LIMIT) throw new Error();
      const raw = JSON.parse(bytes.toString('utf8', 0, length));
      if (!raw || !Number.isSafeInteger(raw.port) || raw.port < 1 || raw.port > 65535 ||
          typeof raw.token !== 'string' || raw.token.length < 1 || raw.token.length > 4096 ||
          (raw.host !== undefined && raw.host !== '127.0.0.1' && raw.host !== '::1')) throw new Error();
      return { port: raw.port, token: raw.token, host: raw.host ?? '127.0.0.1' };
    } catch {
      throw failure('EENDPOINT', 'endpoint is unavailable or invalid', true);
    } finally {
      await file?.close().catch(() => {});
    }
  }

  #boundedEndpoint(timeout) {
    // Include filesystem latency in the request deadline. Any late read still
    // closes its handle in #endpoint's finally block, without exposing contents.
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#pending.delete(cancel);
        if (error) reject(error); else resolve(value);
      };
      const cancel = () => finish(failure('ECLOSED', 'client is closed'));
      const timer = setTimeout(() => finish(failure('ETIMEDOUT', 'request timed out')), Math.max(1, timeout));
      this.#pending.add(cancel);
      this.#endpoint().then(value => finish(null, value), error => finish(error));
    });
  }

  async #call(request, budget = this.#timeoutMs) {
    const deadline = Date.now() + budget;
    for (let attempt = 0; ; attempt++) {
      if (this.#closed) throw failure('ECLOSED', 'client is closed');
      try {
        const endpoint = await this.#boundedEndpoint(deadline - Date.now()); // Fresh on EVERY attempt.
        if (this.#closed) throw failure('ECLOSED', 'client is closed');
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw failure('ETIMEDOUT', 'request timed out');
        return await this.#exchange(endpoint, request, remaining);
      } catch (error) {
        if (this.#closed || !error.retryable || attempt >= this.#staleRetries) throw error;
        const remaining = deadline - Date.now();
        if (remaining <= this.#retryDelayMs) throw error;
        if (this.#retryDelayMs) await new Promise(resolve => setTimeout(resolve, this.#retryDelayMs));
      }
    }
  }

  #exchange(endpoint, request, timeout) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ token: endpoint.token, ...request }) + '\n';
      if (Buffer.byteLength(payload) > this.#maxRequestBytes) {
        reject(failure('ELIMIT', 'request exceeds the configured byte limit'));
        return;
      }
      const socket = connect({ host: endpoint.host, port: endpoint.port });
      let settled = false, sent = false, size = 0;
      const chunks = [];
      const finish = (error, answer) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#pending.delete(cancel);
        socket.destroy();
        if (error) reject(error); else resolve(answer);
      };
      const cancel = () => finish(failure('ECLOSED', 'client is closed'));
      const timer = setTimeout(() => finish(failure('ETIMEDOUT', 'request timed out')), timeout);
      this.#pending.add(cancel);
      socket.once('connect', () => {
        if (settled) return;
        sent = true;
        socket.write(payload);
      });
      socket.on('data', chunk => {
        if (settled) return;
        size += chunk.length;
        if (size > this.#maxResponseBytes) return finish(failure('ELIMIT', 'response exceeds the configured byte limit'));
        chunks.push(chunk);
        if (!chunk.includes(10)) return;
        const bytes = Buffer.concat(chunks, size);
        const end = bytes.indexOf(10);
        // Exactly one answer per connection; never associate another line with
        // this command. Trailing whitespace is tolerated, extra answers are not.
        if (bytes.subarray(end + 1).toString('utf8').trim()) return finish(failure('EPROTOCOL', 'received more than one response'));
        let answer;
        try { answer = JSON.parse(bytes.subarray(0, end).toString('utf8')); }
        catch { return finish(failure('EPROTOCOL', 'received malformed JSON')); }
        if (!answer || typeof answer !== 'object' || Array.isArray(answer) || typeof answer.ok !== 'boolean') {
          return finish(failure('EPROTOCOL', 'received an invalid response envelope'));
        }
        if (!answer.ok) {
          return finish(failure(answer.error === 'bad token' ? 'EAUTH' : 'ECOMMAND',
            messageOf(answer.error, endpoint.token), answer.error === 'bad token'));
        }
        // CDP errors can carry page text. Redact the local credential before
        // translating these fields into exceptions outside the transport.
        if (answer.result?.exceptionDetails) {
          const detail = answer.result.exceptionDetails;
          if (typeof detail !== 'object' || Array.isArray(detail)) {
            return finish(failure('EPROTOCOL', 'received invalid CDP exception details'));
          }
          detail.text = messageOf(detail.text, endpoint.token);
          if (typeof detail.exception === 'object' && detail.exception !== null && detail.exception.description) {
            detail.exception.description = messageOf(detail.exception.description, endpoint.token);
          }
        }
        if (typeof answer.result?.errorText === 'string') answer.result.errorText = messageOf(answer.result.errorText, endpoint.token);
        finish(null, answer);
      });
      socket.on('error', () => finish(failure('ECONNECTION', 'connection failed', !sent)));
      socket.once('close', () => finish(failure('ECONNECTION', 'connection closed before a complete response', !sent)));
    });
  }

  async #cdp(id, method, params, budget) {
    const answer = await this.#call({ op: 'cdp', id, method, params }, budget);
    if (!answer.result || typeof answer.result !== 'object' || Array.isArray(answer.result)) {
      throw failure('EPROTOCOL', 'CDP response has no result object');
    }
    return answer.result;
  }

  async #evaluate(id, expression, budget = this.#timeoutMs) {
    return evaluationValue(await this.#cdp(id, 'Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, silent: true,
      userGesture: false, timeout: Math.max(1, Math.min(budget, this.#timeoutMs)),
    }, budget));
  }

  #refreshProfile() {
    const value = typeof this.#profileUrl === 'function' ? this.#profileUrl() : this.#profileUrl;
    let origin = null;
    if (value) {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('profileUrl must be HTTP(S)');
      origin = parsed.origin;
    }
    if (this.#profileOrigin !== origin) { this.#profileOrigin = origin; this.#scopedIds.clear(); }
  }

  async discover() {
    this.#refreshProfile();
    if (this.#requireProfile && !this.#profileOrigin) return false;
    try { inventory(await this.#call({ op: 'list' })); return true; }
    catch { return false; }
  }

  async list() {
    this.#refreshProfile();
    if (this.#requireProfile && !this.#profileOrigin) throw failure('EPROFILE', 'the active DSH profile URL is unavailable');
    const all = inventory(await this.#call({ op: 'list' }));
    if (!this.#profileOrigin) return all.filter(item => item.type === 'webview');
    const ids = new Set();
    const expression = `(() => { if (location.origin !== ${JSON.stringify(this.#profileOrigin)}) return []; return [...document.querySelectorAll('webview[data-sidebar-browser-frame]')].flatMap(view => { try { return [view.getWebContentsId()]; } catch { return []; } }); })()`;
    for (const shell of all.filter(item => this.#isProfileShell(item))) {
      try { const values = await this.#evaluate(shell.id, expression); if (Array.isArray(values)) for (const id of values) if (Number.isSafeInteger(id)) ids.add(id); } catch { /* Unavailable renderer: no cross-profile fallback. */ }
    }
    this.#scopedIds = ids;
    return all.filter(item => item.type === 'webview' && ids.has(item.id));
  }

  #isProfileShell(item) {
    if (!['window', 'browserView'].includes(item.type)) return false;
    if (!this.#profileOrigin) return !this.#requireProfile;
    try { return new URL(item.url).origin === this.#profileOrigin; } catch { return false; }
  }

  #assertScope(id) {
    this.#refreshProfile();
    if ((this.#profileOrigin || this.#requireProfile) && !this.#scopedIds.has(id)) throw failure('EPROFILE', 'guest does not belong to the active DSH profile');
  }

  async evaluate(id, expression) {
    id = guestId(id);
    this.#assertScope(id);
    if (typeof expression !== 'string' || !expression.trim()) throw new TypeError('expression must be a nonempty string');
    if (Buffer.byteLength(expression) > MAX_EXPRESSION_BYTES) throw failure('ELIMIT', 'expression is too large');
    return this.#evaluate(id, expression);
  }

  async navigate(id, url) {
    id = guestId(id);
    this.#assertScope(id);
    let parsed;
    try {
      if (typeof url !== 'string' || url.length > 16384) throw new Error();
      parsed = new URL(url);
      if (!(parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.href === 'about:blank') ||
          parsed.username || parsed.password) throw new Error();
    } catch { throw new TypeError('url must be an absolute HTTP(S) URL without credentials, or about:blank'); }
    const result = await this.#cdp(id, 'Page.navigate', { url: parsed.href });
    if (result.errorText) throw failure('ENAVIGATE', `navigation failed: ${messageOf(result.errorText)}`);
    if (result.isDownload) throw failure('ENAVIGATE', 'navigation started a download instead of a page');
  }

  async present(id) {
    this.#refreshProfile();
    try {
      id = guestId(id);
      const deadline = Date.now() + this.#presentationTimeoutMs;
      const remaining = () => Math.max(1, Math.min(this.#timeoutMs, deadline - Date.now()));
      const all = inventory(await this.#call({ op: 'list' }, remaining()));
      if (!all.some(item => item.id === id && item.type === 'webview')) {
        return { presented: false, reason: 'The requested sidebar guest is unavailable.' };
      }
      const shells = all.filter(item => this.#isProfileShell(item));
      if (shells.length > 16) return { presented: false, reason: 'Too many shell candidates to verify exact presentation within the safety limit.' };
      let expansionRequested = false;
      const expression = act => `(${shellGuest.toString()})(${JSON.stringify(id)},${act},${!expansionRequested})`;
      const matches = [];
      for (const shell of shells) {
        if (Date.now() >= deadline) break;
        try {
          const proof = await this.#evaluate(shell.id, expression(false), remaining());
          if (proof?.found === true) matches.push({ shell, proof });
        } catch { /* Not a compatible shell renderer. */ }
      }
      if (matches.length !== 1) return { presented: false, reason: 'No unique desktop shell maps this exact guest to a sidebar tab.' };
      const { shell } = matches[0];
      let proof = matches[0].proof;
      // Bounded rechecks allow React commits and sidebar transitions to settle.
      // Actions always remap the exact webContents ID before touching controls.
      for (let attempt = 0; attempt < 12 && Date.now() < deadline; attempt++) {
        if (proof.presented === true) {
          // This cannot select tabs; only call AFTER the shell proves exact
          // selection and exposure, then verify again before reporting success.
          await this.#cdp(id, 'Page.bringToFront', {}, remaining());
          const verified = await this.#evaluate(shell.id, expression(false), remaining());
          return verified?.presented === true
            ? { presented: true }
            : { presented: false, reason: verified?.reason ?? 'The guest lost visible selection during presentation.' };
        }
        if (proof.reason && !/visibl|exposed/.test(proof.reason)) return { presented: false, reason: proof.reason };
        proof = await this.#evaluate(shell.id, expression(true), remaining());
        if (proof?.action === 'expanded') expansionRequested = true;
        if (proof?.found !== true) return { presented: false, reason: 'The exact guest left the shell during presentation.' };
        if (proof.presented !== true) await new Promise(resolve => setTimeout(resolve, Math.min(75, Math.max(0, deadline - Date.now()))));
      }
      return { presented: false, reason: proof.reason ?? 'The exact guest could not be visibly selected before the presentation deadline.' };
    } catch (error) {
      return { presented: false, reason: messageOf(error.message) };
    }
  }

  async close() {
    this.#closed = true;
    for (const cancel of this.#pending) cancel();
  }
}
