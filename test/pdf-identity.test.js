import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { readPdfIdentity } from '../src/pdf-identity.js';

const TEMP_ROOT = resolve(fileURLToPath(new URL('./tmp/', import.meta.url)));

async function fixture(t) {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  const parent = await fs.lstat(TEMP_ROOT);
  assert.ok(parent.isDirectory() && !parent.isSymbolicLink());
  const directory = await fs.mkdtemp(join(TEMP_ROOT, 'pdf-identity-'));
  t.after(async () => {
    const target = resolve(directory);
    assert.equal(dirname(target), TEMP_ROOT, 'cleanup is restricted to the test tmp directory');
    assert.match(basename(target), /^pdf-identity-[A-Za-z0-9]+$/);
    const stat = await fs.lstat(target);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    await fs.rm(target, { recursive: true, force: true });
  });
  return async (bytes, name = 'synthetic.pdf') => {
    const path = join(directory, name);
    assert.equal(dirname(resolve(path)), directory);
    await fs.writeFile(path, bytes);
    return path;
  };
}

async function pdf(configure = () => {}, useObjectStreams = false) {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([200, 200]);
  configure(document);
  return Buffer.from(await document.save({ useObjectStreams }));
}

async function rejectCode(path, code, options) {
  await assert.rejects(readPdfIdentity(path, options), error => {
    assert.equal(error.code, code);
    assert.ok(!error.message.includes(path));
    assert.equal(error.cause, undefined);
    assert.equal(error.path, undefined);
    return true;
  });
}

test('reads Unicode PDF Info and a unique DOI without inventing a publication year', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(document => {
    document.setTitle('  论文\n\t标题  ');
    document.setAuthor('张三;  Jane Doe');
    document.setSubject('DOI: https://doi.org/10.1234/EXAMPLE.2024.1');
    document.setKeywords(['Methods', 'doi:10.1234/example.2024.1']);
    document.setCreationDate(new Date('2025-01-01T00:00:00Z'));
  }));
  assert.deepEqual(await readPdfIdentity(path), {
    title: '论文 标题', author: '张三; Jane Doe', doi: '10.1234/example.2024.1',
  });
});

test('supports cross-reference streams and preserves absent metadata as empty strings', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(() => {}, true));
  assert.deepEqual(await readPdfIdentity(path), { title: '', author: '', doi: '' });
});

test('does not select a DOI when PDF Info mentions different identifiers', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(document => {
    document.setSubject('10.1234/first');
    document.setKeywords(['10.1234/second']);
  }));
  assert.equal((await readPdfIdentity(path)).doi, '');
});

test('DOI extraction preserves balanced parentheses and rejects truncated unsupported suffixes', async t => {
  const write = await fixture(t);
  const balanced = await write(await pdf(document => document.setSubject('(doi:10.1234/abc(1))')), 'balanced.pdf');
  assert.equal((await readPdfIdentity(balanced)).doi, '10.1234/abc(1)');
  const unsupported = await write(await pdf(document => document.setKeywords(['10.1234/abc?variant=2'])), 'unsupported.pdf');
  assert.equal((await readPdfIdentity(unsupported)).doi, '');
});

test('rejects missing signatures, truncated EOF, trailing data and invalid cross-reference offsets', async t => {
  const write = await fixture(t);
  const valid = await pdf();
  const variants = [
    Buffer.from(valid.toString('latin1').replace('%PDF-', '%BAD-'), 'latin1'),
    valid.subarray(0, valid.lastIndexOf('%%EOF')),
    Buffer.concat([valid, Buffer.from('\nunfinished download')]),
    Buffer.from(valid.toString('latin1').replace(/startxref\s+\d+/, 'startxref\n0'), 'latin1'),
  ];
  for (let index = 0; index < variants.length; index++) {
    const path = await write(variants[index], `invalid-${index}.pdf`);
    await rejectCode(path, 'PDF_INVALID');
  }
});

test('rejects malformed metadata objects instead of relying on filenames', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(document => {
    document.setTitle('A valid title');
    document.context.lookup(document.context.trailerInfo.Info).set(PDFName.Title, PDFNumber.of(123));
  }));
  await rejectCode(path, 'PDF_INVALID');
});

test('rejects an encryption dictionary even when metadata looks readable', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(document => {
    document.setTitle('Must not be used');
    document.context.trailerInfo.Encrypt = document.context.register(document.context.obj({ Filter: 'Standard' }));
  }));
  await rejectCode(path, 'PDF_ENCRYPTED');
});

test('enforces byte limits before parsing and validates caller limits', async t => {
  const write = await fixture(t);
  const bytes = await pdf();
  const path = await write(bytes);
  await rejectCode(path, 'PDF_TOO_LARGE', { maxBytes: bytes.length - 1 });
  assert.deepEqual(await readPdfIdentity(path, { maxBytes: bytes.length }), { title: '', author: '', doi: '' });
  for (const maxBytes of [0, -1, 1.5, NaN, Infinity, '100']) {
    await rejectCode(path, 'PDF_INVALID_ARGUMENT', { maxBytes });
  }
});

test('rejects directories and filesystem errors without disclosing the input path', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(), 'do-not-disclose.pdf');
  await rejectCode(dirname(path), 'PDF_UNSAFE_FILE');
  await rejectCode(join(dirname(path), 'missing-sensitive-name.pdf'), 'PDF_READ_FAILED');
});

test('rejects a symbolic-link entry before opening it', async t => {
  const write = await fixture(t);
  const path = await write(await pdf());
  const originalLstat = fs.lstat.bind(fs);
  const originalOpen = fs.open.bind(fs);
  let opened = false;
  t.mock.method(fs, 'lstat', async (candidate, options) => {
    const stat = await originalLstat(candidate, options);
    if (candidate === path) stat.isSymbolicLink = () => true;
    return stat;
  });
  t.mock.method(fs, 'open', async (...args) => {
    if (args[0] === path) opened = true;
    return originalOpen(...args);
  });
  await rejectCode(path, 'PDF_UNSAFE_FILE');
  assert.equal(opened, false);
});

test('rejects a same-size file modification after reading and before parsing', async t => {
  const write = await fixture(t);
  const path = await write(await pdf(document => document.setTitle('Original')));
  const originalOpen = fs.open.bind(fs);
  const originalLoad = PDFDocument.load.bind(PDFDocument);
  let parsed = false;
  t.mock.method(PDFDocument, 'load', async (...args) => {
    parsed = true;
    return originalLoad(...args);
  });
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] !== path) return handle;
    const read = handle.read.bind(handle);
    let changed = false;
    handle.read = async (...readArgs) => {
      const result = await read(...readArgs);
      if (!changed) {
        changed = true;
        // Change metadata at the same file size and set a deterministic new mtime.
        const original = await fs.readFile(path);
        const different = Buffer.from(original);
        different[15] ^= 1;
        await fs.writeFile(path, different);
        await fs.utimes(path, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));
      }
      return result;
    };
    return handle;
  });
  await rejectCode(path, 'PDF_FILE_CHANGED');
  assert.equal(parsed, false, 'changed bytes must not reach the parser');
});

test('rejects file growth beyond the bounded read', async t => {
  const write = await fixture(t);
  const path = await write(await pdf());
  const originalOpen = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] !== path) return handle;
    const read = handle.read.bind(handle);
    let changed = false;
    handle.read = async (...readArgs) => {
      const result = await read(...readArgs);
      if (!changed) {
        changed = true;
        await fs.appendFile(path, '\n');
      }
      return result;
    };
    return handle;
  });
  await rejectCode(path, 'PDF_FILE_CHANGED');
});
