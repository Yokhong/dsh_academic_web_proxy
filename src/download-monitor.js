import { watch } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { readPdfIdentity } from './pdf-identity.js';
import { renameCompletedPdf } from './file-renamer.js';

const text = value => typeof value === 'string' ? value.normalize('NFKC').trim().slice(0, 4096) : '';
const titleKey = value => text(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const doiKey = value => text(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').toLowerCase();
const identity = info => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const tempTarget = name => /\.pdf\.(?:crdownload|part)$/i.test(name) ? name.replace(/\.(?:crdownload|part)$/i, '') : null;

export function matchPaper(identityInfo, papers) {
  const doi = doiKey(identityInfo?.doi);
  const title = titleKey(identityInfo?.title);
  const matches = papers.filter(paper => {
    const paperDoi = doiKey(paper.doi);
    if (doi && paperDoi) return doi === paperDoi && (!title || !paper.title || title === titleKey(paper.title));
    return title.length >= 12 && !['introduction', 'bibliography', 'supplementaryinformation', 'supplementarymaterial', 'supportinginformation'].includes(title) && title === titleKey(paper.title);
  });
  if (!matches.length) return null;
  const merged = {};
  for (const key of ['title', 'author', 'year', 'venue', 'platform', 'doi']) {
    const values = matches.map(paper => paper[key]).filter(Boolean);
    const normalized = values.map(value => key === 'title' ? titleKey(value) : key === 'doi' ? doiKey(value) : text(value).toLowerCase());
    if (new Set(normalized).size > 1) return null;
    merged[key] = values[0] || '';
  }
  return matches.length === 1 ? matches[0] : merged;
}

export class PaperDownloadMonitor {
  constructor({ settings, now = Date.now, intervalMs = 500, stableMs = 2000, ttlMs = 30 * 60_000, readIdentity = readPdfIdentity, rename = renameCompletedPdf, allowed = () => true }) {
    this.settings = settings; this.now = now; this.intervalMs = intervalMs; this.stableMs = stableMs; this.ttlMs = ttlMs;
    this.readIdentity = readIdentity; this.rename = rename; this.allowed = allowed;
    this.papers = new Map(); this.seen = new Set(); this.pending = new Map(); this.recent = [];
    this.generation = 0; this.directory = ''; this.fingerprint = ''; this.flight = null;
    this.timer = null; this.watcher = null; this.started = false; this.disposed = false; this.initialized = false;
    this.mode = 'disabled';
  }
  enabled() { const settings = this.settings(); return settings.enabled && settings.renameEnabled && Boolean(settings.downloadDirectory); }
  configure() {
    const settings = this.settings();
    const fingerprint = JSON.stringify([settings.enabled, settings.renameEnabled, settings.downloadDirectory, settings.namingFields]);
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint; this.generation++;
    this.watcher?.close(); this.watcher = null; this.directory = ''; this.initialized = false;
    this.seen.clear(); this.pending.clear(); this.papers.clear(); this.recent = [];
    this.mode = !settings.enabled || !settings.renameEnabled ? 'disabled' : !settings.downloadDirectory ? 'needs-directory' : 'starting';
  }
  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    const poll = async () => {
      await this.tick();
      if (!this.disposed && this.started) { this.timer = setTimeout(poll, this.intervalMs); this.timer.unref?.(); }
    };
    void poll();
  }
  async stop() {
    this.disposed = true; this.started = false; this.generation++;
    clearTimeout(this.timer); this.watcher?.close(); this.watcher = null;
    await this.flight?.catch(() => {});
    this.pending.clear(); this.papers.clear(); this.seen.clear(); this.recent = [];
  }
  remember(metadata) {
    if (!this.enabled() || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
    const paper = Object.fromEntries(['title', 'author', 'year', 'venue', 'platform', 'doi'].map(key => [key, text(metadata[key])]));
    paper.doi = /^10\.\d{4,9}\/\S+$/i.test(doiKey(paper.doi)) ? doiKey(paper.doi) : '';
    if (!paper.doi && titleKey(paper.title).length < 12) return false;
    const key = JSON.stringify(paper);
    const firstAt = this.papers.get(key)?.firstAt ?? this.now();
    this.papers.delete(key); this.papers.set(key, { paper, at: this.now(), firstAt });
    while (this.papers.size > 100) this.papers.delete(this.papers.keys().next().value);
    return true;
  }
  status() {
    return { enabled: Boolean(this.settings().renameEnabled), mode: this.mode, pending: this.pending.size,
      recent: this.recent.map(item => ({ ...item, missingFields: [...(item.missingFields || [])] })) };
  }
  note(outcome) {
    this.recent.unshift({ status: outcome.status, ...(outcome.filename ? { filename: basename(outcome.filename) } : {}), missingFields: outcome.missingFields || [] });
    this.recent.length = Math.min(this.recent.length, 10);
  }
  async tick() {
    if (this.disposed) return;
    if (this.flight) return this.flight;
    this.flight = this.scan().catch(() => {
      if (!this.disposed) { this.mode = 'directory-unavailable'; this.watcher?.close(); this.watcher = null; this.initialized = false; }
    }).finally(() => { this.flight = null; });
    return this.flight;
  }
  async scan() {
    this.configure();
    if (!this.enabled() || !this.allowed()) return;
    const generation = this.generation;
    const valid = () => !this.disposed && generation === this.generation && this.enabled() && this.allowed();
    const directory = this.settings().downloadDirectory;
    if (!isAbsolute(directory)) throw new Error('invalid-directory');
    const info = await lstat(directory);
    const canonical = await realpath(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || resolve(directory) !== resolve(canonical)) throw new Error('unsafe-directory');
    const entries = await readdir(canonical, { withFileTypes: true });
    if (!valid()) return;
    if (entries.length > 10_000) throw new Error('directory-too-large');
    const names = new Set(entries.map(entry => entry.name));
    if (!this.initialized || this.directory !== canonical) {
      this.directory = canonical; this.seen = new Set(names); this.pending.clear(); this.initialized = true;
      for (const name of names) { const target = tempTarget(name); if (target) this.seen.add(target); }
      this.mode = 'ready';
      if (this.started && !this.watcher) {
        this.watcher = watch(canonical, { persistent: false }, () => { void this.tick(); });
        this.watcher.on('error', () => { this.watcher?.close(); this.watcher = null; this.initialized = false; this.mode = 'directory-unavailable'; });
      }
      return;
    }
    this.mode = 'ready';
    const now = this.now();
    for (const [key, record] of this.papers) if (now - record.at > this.ttlMs) this.papers.delete(key);
    for (const entry of entries) {
      const target = tempTarget(entry.name);
      if (!target || !entry.isFile() || this.seen.has(entry.name) || this.seen.has(target) && names.has(target) || this.pending.size >= 100) continue;
      if (!this.pending.has(target)) this.pending.set(target, { temporary: entry.name, started: now, signature: '', stableSince: now });
    }
    for (const [name, item] of this.pending) {
      if (!valid()) return;
      if (now - item.started > this.ttlMs) { this.pending.delete(name); this.note({ status: 'expired' }); continue; }
      if (names.has(item.temporary) || !names.has(name)) continue;
      const file = join(canonical, name);
      const stat = await lstat(file).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) { this.pending.delete(name); continue; }
      const signature = identity(stat);
      if (signature !== item.signature) { item.signature = signature; item.stableSince = now; continue; }
      if (now - item.stableSince < this.stableMs) continue;
      this.pending.delete(name);
      let pdf;
      try { pdf = await this.readIdentity(file); }
      catch { this.note({ status: 'invalid-pdf' }); continue; }
      const after = await lstat(file).catch(() => null);
      if (!valid() || !after || identity(after) !== signature) continue;
      const metadata = matchPaper(pdf, [...this.papers.values()].filter(record => record.firstAt <= item.started).map(record => record.paper));
      if (!metadata) { this.note({ status: 'unmatched' }); continue; }
      const outcome = await this.rename({ path: file, state: 'completed', totalBytes: stat.size, fingerprint: signature }, metadata, this.settings().namingFields, { canProceed: valid });
      if (valid()) this.note(outcome);
      if (outcome.status === 'renamed') { names.delete(name); names.add(outcome.filename); }
    }
    this.seen = new Set(names);
    for (const name of names) { const target = tempTarget(name); if (target) this.seen.add(target); }
  }
}
