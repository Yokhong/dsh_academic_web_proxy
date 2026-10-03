import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { constants as bufferConstants } from 'node:buffer';
import { PDFDocument, EncryptedPDFError } from 'pdf-lib';

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
// pdf-lib 1.17's ES5 Error subclass does not reliably preserve instanceof.
const ENCRYPTED_ERROR_MESSAGE = new EncryptedPDFError().message;
const MESSAGES = Object.freeze({
  PDF_INVALID_ARGUMENT: 'Invalid PDF identity reader arguments.',
  PDF_UNSAFE_FILE: 'PDF identity requires a regular file without a symbolic link.',
  PDF_TOO_LARGE: 'PDF exceeds the identity reader size limit.',
  PDF_FILE_CHANGED: 'PDF changed while its identity was being read.',
  PDF_INVALID: 'PDF is incomplete, malformed, or unsupported.',
  PDF_ENCRYPTED: 'Encrypted PDFs cannot provide a verified identity.',
  PDF_READ_FAILED: 'PDF identity could not be read.',
});

class PdfIdentityError extends Error {
  constructor(code) {
    super(MESSAGES[code]);
    this.name = 'PdfIdentityError';
    this.code = code;
  }
}

const fail = code => { throw new PdfIdentityError(code); };

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function checkRegular(stat) {
  if (stat.isSymbolicLink() || !stat.isFile()) fail('PDF_UNSAFE_FILE');
}

async function checkUnchanged(path, handle, before) {
  let descriptor;
  let entry;
  try {
    descriptor = await handle.stat({ bigint: true });
    entry = await fs.lstat(path, { bigint: true });
  } catch {
    fail('PDF_FILE_CHANGED');
  }
  if (entry.isSymbolicLink() || !entry.isFile() || !descriptor.isFile()
      || !sameFile(before, descriptor) || !sameFile(before, entry)) fail('PDF_FILE_CHANGED');
}

function checkEnvelope(bytes) {
  // A conservative reader: do not repair an HTML response or a truncated download.
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(bytes.subarray(0, 16).toString('latin1'))) fail('PDF_INVALID');
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1');
  const ending = /(?:^|[\r\n])startxref[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/.exec(tail);
  if (!ending) fail('PDF_INVALID');
  const offset = Number(ending[1]);
  if (!Number.isSafeInteger(offset) || offset < 8 || offset >= bytes.length) fail('PDF_INVALID');
  const crossReference = bytes.subarray(offset, Math.min(bytes.length, offset + 65536)).toString('latin1');
  if (/^xref[\x00\t\n\f\r ]/.test(crossReference)) return;
  // PDF 1.5+ may use an indirect cross-reference stream instead of an xref table.
  const stream = crossReference.indexOf('stream');
  if (!/^\d+[\x00\t\n\f\r ]+\d+[\x00\t\n\f\r ]+obj\b/.test(crossReference)
      || stream < 0 || !/\/Type[\x00\t\n\f\r ]*\/XRef\b/.test(crossReference.slice(0, stream))) fail('PDF_INVALID');
}

function text(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 16384) fail('PDF_INVALID');
  return value.normalize('NFC').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/gu, ' ').trim();
}

function metadataDoi(subject, keywords) {
  const found = new Set();
  for (const value of [subject, keywords]) {
    for (const match of value.matchAll(/\b10\.\d{4,9}\/[a-z0-9._;()/:+-]+/gi)) {
      // Avoid accepting a prefix of an identifier with an unsupported suffix.
      const next = value[match.index + match[0].length];
      if (next && !/[\s,\]\}>"']/.test(next)) continue;
      let doi = match[0].replace(/[.;:]+$/g, '');
      while (doi.endsWith(')') && (doi.match(/\)/g)?.length ?? 0) > (doi.match(/\(/g)?.length ?? 0)) {
        doi = doi.slice(0, -1);
      }
      if (/^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/i.test(doi)) found.add(doi.toLowerCase());
    }
  }
  // Multiple different identifiers in keywords may be references to other papers.
  return found.size === 1 ? [...found][0] : '';
}

/**
 * Read only the selected PDF's Info metadata. Empty fields remain empty; dates
 * are never treated as publication years. This is an identity check, not a
 * browser download completion event or a guarantee that a later rename is safe.
 * Callers must independently constrain the containing directory and revalidate
 * the source file before renaming. O_NOFOLLOW is used where the OS exposes it;
 * all platforms additionally compare lstat/fstat before and after reading.
 */
export async function readPdfIdentity(path, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (typeof path !== 'string' || !path || path.includes('\0')
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > bufferConstants.MAX_LENGTH) fail('PDF_INVALID_ARGUMENT');
  let handle;
  try {
    const entry = await fs.lstat(path, { bigint: true });
    checkRegular(entry);
    if (entry.size > BigInt(maxBytes)) fail('PDF_TOO_LARGE');
    // O_NONBLOCK also prevents a substituted FIFO from blocking an open on POSIX.
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0);
    handle = await fs.open(path, flags);
    const before = await handle.stat({ bigint: true });
    checkRegular(before);
    if (!sameFile(entry, before)) fail('PDF_FILE_CHANGED');
    const size = Number(before.size);
    if (size < 16) fail('PDF_INVALID');
    const bytes = Buffer.alloc(size);
    let position = 0;
    while (position < size) {
      const { bytesRead } = await handle.read(bytes, position, size - position, position);
      if (bytesRead === 0) fail('PDF_FILE_CHANGED');
      position += bytesRead;
    }
    const extra = await handle.read(Buffer.alloc(1), 0, 1, position);
    if (extra.bytesRead !== 0) fail('PDF_FILE_CHANGED');
    await checkUnchanged(path, handle, before);
    checkEnvelope(bytes);
    let identity;
    try {
      const document = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      if (document.isEncrypted) fail('PDF_ENCRYPTED');
      if (document.getPageCount() < 1) fail('PDF_INVALID');
      identity = {
        title: text(document.getTitle()),
        author: text(document.getAuthor()),
        doi: metadataDoi(text(document.getSubject()), text(document.getKeywords())),
      };
    } catch (error) {
      if (error instanceof PdfIdentityError) throw error;
      fail(error instanceof EncryptedPDFError || error?.message === ENCRYPTED_ERROR_MESSAGE ? 'PDF_ENCRYPTED' : 'PDF_INVALID');
    }
    await checkUnchanged(path, handle, before);
    return identity;
  } catch (error) {
    if (error instanceof PdfIdentityError) throw error;
    // Never return a filesystem/parser message, cause, or input path.
    fail(error?.code === 'ELOOP' ? 'PDF_UNSAFE_FILE' : 'PDF_READ_FAILED');
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}
