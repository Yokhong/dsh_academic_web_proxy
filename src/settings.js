import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { normalizeHostname, validateSchemes } from './proxy.js';

export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, useDefaultHostnames: true, customHostnames: Object.freeze([]), loginUrlScheme: '', proxiedUrlScheme: '' });
const settingKeys = new Set(Object.keys(DEFAULT_SETTINGS));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const cloneSettings = settings => ({ ...settings, customHostnames: [...settings.customHostnames] });
function plainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateSettings(input = {}) {
  if (!plainObject(input)) throw new TypeError('配置必须为 JSON 对象。');
  for (const key of Reflect.ownKeys(input)) {
    if (!settingKeys.has(key)) throw new TypeError('配置包含未知字段。');
    if (!own(Object.getOwnPropertyDescriptor(input, key), 'value')) throw new TypeError('配置只能包含数据字段。');
  }
  const enabled = own(input, 'enabled') ? input.enabled : DEFAULT_SETTINGS.enabled;
  const useDefaultHostnames = own(input, 'useDefaultHostnames') ? input.useDefaultHostnames : DEFAULT_SETTINGS.useDefaultHostnames;
  if (typeof enabled !== 'boolean' || typeof useDefaultHostnames !== 'boolean') throw new TypeError('开关必须为布尔值。');
  const hosts = own(input, 'customHostnames') ? input.customHostnames : DEFAULT_SETTINGS.customHostnames;
  if (!Array.isArray(hosts) || hosts.length > 1000) throw new TypeError('自定义域名最多 1000 项。');
  const customHostnames = [];
  const seen = new Set();
  for (const value of hosts) {
    if (typeof value !== 'string') throw new TypeError('域名必须为文本。');
    const text = value.trim();
    if (!text || text.length > 253) throw new TypeError('域名长度需为 1 至 253 个字符。');
    const hostname = normalizeHostname(text);
    if (hostname.length > 253) throw new TypeError('规范化域名长度不得超过 253。');
    if (!seen.has(hostname)) { seen.add(hostname); customHostnames.push(hostname); }
  }
  const [loginUrlScheme, proxiedUrlScheme] = ['loginUrlScheme', 'proxiedUrlScheme'].map(key => {
    const value = own(input, key) ? input[key] : DEFAULT_SETTINGS[key];
    if (typeof value !== 'string') throw new TypeError('代理方案必须为文本。');
    const text = value.trim();
    if (text.length > 4096) throw new TypeError('代理方案长度不得超过 4096。');
    return text;
  });
  validateSchemes(loginUrlScheme, proxiedUrlScheme);
  return { enabled, useDefaultHostnames, customHostnames, loginUrlScheme, proxiedUrlScheme };
}
function storeError(code, message, statusCode) {
  const error = new Error(message); error.code = code;
  if (statusCode !== undefined) error.statusCode = statusCode;
  return error;
}
function defaultFilePath() {
  const profileDirectory = process.env.DSH_PROFILE_DIR || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', process.env.DSH_PROFILE || 'default');
  return join(profileDirectory, 'plugins', 'dsh-academic-web-proxy', 'settings.json');
}

/** One store instance serializes load/save IO; revisions protect concurrent clients. */
export class SettingsStore {
  #filePath; #settings = cloneSettings(DEFAULT_SETTINGS); #revision = 0;
  #loaded = false; #loadError = null; #queue = Promise.resolve();
  constructor({ filePath = defaultFilePath() } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('需要配置文件路径。');
    this.#filePath = resolve(filePath);
  }
  get revision() { return this.#revision; }
  get() { return cloneSettings(this.#settings); }
  #enqueue(operation) {
    const result = this.#queue.then(operation); this.#queue = result.catch(() => {}); return result;
  }
  async #read() {
    let text;
    try { text = await readFile(this.#filePath, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') {
        this.#settings = cloneSettings(DEFAULT_SETTINGS); this.#revision = 0; this.#loaded = true; this.#loadError = null;
        return this.get();
      }
      this.#loadError = storeError('SETTINGS_UNAVAILABLE', '无法读取插件配置。'); this.#loaded = false;
      throw this.#loadError;
    }
    try {
      const record = JSON.parse(text);
      if (!plainObject(record) || Object.keys(record).length !== 3 || !own(record, 'version') || !own(record, 'revision') || !own(record, 'settings') || record.version !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 0) throw new Error('Invalid settings envelope.');
      this.#settings = validateSettings(record.settings); this.#revision = record.revision; this.#loaded = true; this.#loadError = null;
      return this.get();
    } catch {
      this.#loadError = storeError('SETTINGS_CORRUPT', '配置文件损坏；修复或移走该文件后重新加载。'); this.#loaded = false;
      throw this.#loadError;
    }
  }
  async load() { return this.#enqueue(() => this.#read()); }
  async #write(settings, revision) {
    const directory = dirname(this.#filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${basename(this.#filePath)}.${process.pid}.${randomUUID()}.tmp`);
    let handle; let created = false;
    try {
      handle = await open(temporary, 'wx', 0o600); created = true;
      await handle.writeFile(`${JSON.stringify({ version: 1, revision, settings }, null, 2)}\n`, 'utf8');
      await handle.sync(); await handle.close(); handle = undefined;
      // Windows readers/virus scanners can briefly hold the destination open.
      // Retry only transient sharing errors; never fall back to truncate/write.
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, this.#filePath); break; }
        catch (error) {
          if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
          await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
        }
      }
      created = false;
    } finally {
      if (handle) await handle.close().catch(() => {});
      if (created) await unlink(temporary).catch(() => {});
    }
  }
  async save(next, { revision } = {}) {
    const settings = validateSettings(next);
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) throw new TypeError('revision 必须为非负整数。');
    return this.#enqueue(async () => {
      if (this.#loadError) throw this.#loadError;
      if (!this.#loaded) await this.#read();
      if (revision !== undefined && revision !== this.#revision) throw storeError('SETTINGS_REVISION_CONFLICT', '配置已由其他窗口修改，请重新载入后保存。', 409);
      if (this.#revision === Number.MAX_SAFE_INTEGER) throw storeError('SETTINGS_REVISION_EXHAUSTED', '配置版本号已达到上限。');
      const nextRevision = this.#revision + 1;
      try { await this.#write(settings, nextRevision); }
      catch { throw storeError('SETTINGS_UNAVAILABLE', '无法保存配置。'); }
      this.#settings = settings; this.#revision = nextRevision;
      return { settings: this.get(), revision: this.#revision };
    });
  }
}
