import { constants } from 'node:fs';
import { lstat, open, realpath, link, unlink } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { buildPaperFilename } from './filename.js';

const sameFile = (first, second) => first.dev === second.dev && first.ino === second.ino && first.size === second.size && first.mtimeMs === second.mtimeMs;
const fingerprint = info => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
const result = (status, extra = {}) => ({ status, ...extra });

export async function renameCompletedPdf(record, metadata, fields, { canProceed = () => true } = {}) {
  if (record?.state !== 'completed') return result('not-completed');
  if (typeof record.path !== 'string' || !isAbsolute(record.path) || record.path.includes('\0')) return result('invalid-path');
  const source = resolve(record.path);
  if (extname(source).toLowerCase() !== '.pdf') return result('not-pdf');
  const naming = buildPaperFilename(metadata, fields);
  const details = { missingFields: naming.missingFields };
  if (!naming.filename) return result('missing-metadata', details);
  let handle;
  let createdTarget;
  let originalIdentity;
  try {
    const before = await lstat(source);
    originalIdentity = before;
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 8) return result('unsafe-file');
    if (record.fingerprint && fingerprint(before) !== record.fingerprint) return result('file-changed');
    if (Number.isSafeInteger(record.totalBytes) && record.totalBytes > 0 && before.size !== record.totalBytes) return result('size-mismatch');
    const parent = await realpath(dirname(source));
    const canonical = await realpath(source);
    if (resolve(source) !== resolve(canonical) || resolve(canonical) !== resolve(join(parent, basename(source)))) return result('unsafe-file');
    handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    if (!sameFile(before, await handle.stat())) return result('file-changed');
    const magic = Buffer.alloc(5);
    const { bytesRead } = await handle.read(magic, 0, 5, 0);
    if (bytesRead !== 5 || magic.toString('ascii') !== '%PDF-') return result('not-pdf');
    await handle.close(); handle = undefined;
    const stem = naming.filename.slice(0, -4);
    for (let suffix = 0; suffix <= 999; suffix++) {
      const filename = `${stem}${suffix ? ` (${suffix})` : ''}.pdf`;
      const target = resolve(parent, filename);
      if (dirname(target) !== resolve(parent) || basename(target) !== filename) return result('invalid-path');
      if (target === resolve(canonical)) return result('unchanged', { ...details, filename });
      const current = await lstat(source);
      if (!sameFile(before, current) || current.isSymbolicLink() || current.nlink !== 1) return result('file-changed');
      if (!canProceed()) return result('cancelled');
      try { await link(source, target); createdTarget = target; }
      catch (error) { if (error.code === 'EEXIST') continue; return result('rename-unavailable', details); }
      const [sourceNow, targetNow] = await Promise.all([lstat(source), lstat(target)]);
      if (!sameFile(before, sourceNow) || !sameFile(before, targetNow) || sourceNow.isSymbolicLink() || targetNow.isSymbolicLink()) return result('file-changed', details);
      if (!canProceed()) return result('cancelled');
      try { await unlink(source); }
      catch { return result('rename-unavailable', details); }
      createdTarget = undefined;
      return result('renamed', { ...details, filename });
    }
    return result('name-conflict', details);
  } catch {
    return result('file-unavailable', details);
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (createdTarget && originalIdentity) {
      const [sourceNow, targetNow] = await Promise.all([lstat(source).catch(() => null), lstat(createdTarget).catch(() => null)]);
      if (sourceNow && targetNow && !sourceNow.isSymbolicLink() && !targetNow.isSymbolicLink() &&
          sourceNow.dev === originalIdentity.dev && sourceNow.ino === originalIdentity.ino &&
          targetNow.dev === originalIdentity.dev && targetNow.ino === originalIdentity.ino && targetNow.nlink >= 2) {
        await unlink(createdTarget).catch(() => {});
      }
    }
  }
}
