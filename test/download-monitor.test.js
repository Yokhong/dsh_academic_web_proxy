import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, readdir, lstat, link } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { PaperDownloadMonitor, matchPaper } from '../src/download-monitor.js';
import { renameCompletedPdf } from '../src/file-renamer.js';

const root = fileURLToPath(new URL('./tmp/', import.meta.url));
const paper = { title: 'A study of safe research downloads', author: 'Example Researcher', year: '2024', venue: 'Example Journal', platform: 'ASCE', doi: '10.1234/example' };
async function pdf(metadata = paper) {
  const document = await PDFDocument.create(); document.addPage();
  if (metadata.title) document.setTitle(metadata.title);
  if (metadata.author) document.setAuthor(metadata.author);
  if (metadata.doi) document.setSubject(`doi:${metadata.doi}`);
  return Buffer.from(await document.save());
}
async function fixture(context, overrides = {}) {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'rename-'));
  let now = 1000;
  const config = { enabled: true, renameEnabled: true, downloadDirectory: directory, namingFields: ['title', 'year', 'platform'] };
  const monitor = new PaperDownloadMonitor({ settings: () => config, now: () => now, stableMs: 100, ...overrides });
  context.after(async () => {
    await monitor.stop();
    const target = resolve(directory), rel = relative(root, target);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    await rm(target, { recursive: true, force: true });
  });
  await monitor.tick();
  return { directory, config, monitor, advance: amount => { now += amount; },
    async begin(name = 'download.pdf', metadata = paper) {
      monitor.remember(metadata);
      await writeFile(join(directory, `${name}.crdownload`), await pdf(metadata));
      await monitor.tick();
    },
    async complete(name = 'download.pdf') {
      const temporary = join(directory, `${name}.crdownload`), target = join(directory, name);
      assert.equal(dirname(resolve(temporary)), resolve(directory));
      assert.equal(dirname(resolve(target)), resolve(directory));
      await rename(temporary, target); await monitor.tick(); now += 150; await monitor.tick();
    },
  };
}

test('separate completed downloads can reuse the browser original filename', async context => {
  const environment = await fixture(context);
  await environment.begin(); await environment.complete();
  await environment.begin(); await environment.complete();
  assert.deepEqual((await readdir(environment.directory)).sort(), [`${paper.title}_2024_ASCE (1).pdf`, `${paper.title}_2024_ASCE.pdf`].sort());
  assert.equal(environment.monitor.status().recent.filter(item => item.status === 'renamed').length, 2);
});

test('matching merges absent fields but rejects contradictory embedded identity', () => {
  const merged = matchPaper(paper, [paper, { ...paper, platform: '' }]);
  assert.equal(merged.platform, 'ASCE');
  assert.equal(matchPaper({ ...paper, title: `${paper.title} supplement` }, [paper]), null);
  assert.equal(matchPaper(paper, [paper, { ...paper, author: 'Another Author' }]), null);
});

test('cancellation after target link rolls back only the newly created link', async context => {
  const environment = await fixture(context);
  const source = join(environment.directory, 'original.pdf');
  const contents = await pdf();
  await writeFile(source, contents);
  let checks = 0;
  const outcome = await renameCompletedPdf({ path: source, state: 'completed' }, paper, ['title'], { canProceed: () => ++checks < 2 });
  assert.equal(outcome.status, 'cancelled');
  assert.deepEqual(await readdir(environment.directory), ['original.pdf']);
  assert.deepEqual(await readFile(source), contents);
});

test('matched newly finished PDF is renamed automatically with no content modification', async context => {
  const environment = await fixture(context);
  await environment.begin();
  const original = await readFile(join(environment.directory, 'download.pdf.crdownload'));
  await environment.complete();
  const filename = `${paper.title}_2024_ASCE.pdf`;
  assert.deepEqual(await readdir(environment.directory), [filename]);
  assert.deepEqual(await readFile(join(environment.directory, filename)), original);
  assert.equal(environment.monitor.status().recent[0].status, 'renamed');
  assert.doesNotMatch(JSON.stringify(environment.monitor.status()), /rename-|10\.1234|downloadDirectory/);
});

test('unfinished temporary, stable partial and old PDFs are never renamed', async context => {
  const environment = await fixture(context);
  await environment.begin();
  environment.advance(10_000); await environment.monitor.tick();
  assert.deepEqual(await readdir(environment.directory), ['download.pdf.crdownload']);
  await writeFile(join(environment.directory, 'unobserved.pdf'), await pdf());
  await environment.monitor.tick(); environment.advance(500); await environment.monitor.tick();
  assert.ok((await readdir(environment.directory)).includes('unobserved.pdf'));
  assert.equal(environment.monitor.status().recent.length, 0);
});

test('initial existing PDFs and in-progress downloads remain excluded', async context => {
  const environment = await fixture(context);
  await writeFile(join(environment.directory, 'existing.pdf'), await pdf());
  await writeFile(join(environment.directory, 'before.pdf.crdownload'), await pdf());
  environment.config.renameEnabled = false; await environment.monitor.tick();
  environment.config.renameEnabled = true; await environment.monitor.tick();
  environment.monitor.remember(paper);
  await environment.complete('before.pdf');
  assert.deepEqual((await readdir(environment.directory)).sort(), ['before.pdf', 'existing.pdf']);
  assert.equal(environment.monitor.status().recent.length, 0);
});

test('changed filename and unknown or ambiguous PDF identity keep original names', async context => {
  const environment = await fixture(context);
  await environment.begin('unknown.pdf', { title: 'A different document not the article' });
  environment.monitor.papers.clear(); environment.monitor.remember(paper);
  await environment.complete('unknown.pdf');
  assert.equal(environment.monitor.status().recent[0].status, 'unmatched');
  assert.ok((await readdir(environment.directory)).includes('unknown.pdf'));
  await environment.begin('ambiguous.pdf');
  environment.monitor.remember({ ...paper, platform: 'Elsevier' });
  await environment.complete('ambiguous.pdf');
  assert.equal(environment.monitor.status().recent[0].status, 'unmatched');
  assert.ok((await readdir(environment.directory)).includes('ambiguous.pdf'));
});

test('partial or malformed PDF with absent temp marker is retained without retry', async context => {
  const environment = await fixture(context);
  await environment.begin();
  await writeFile(join(environment.directory, 'download.pdf.crdownload'), '%PDF-1.7\npartial');
  await environment.complete();
  assert.equal(environment.monitor.status().recent[0].status, 'invalid-pdf');
  assert.ok((await readdir(environment.directory)).includes('download.pdf'));
  environment.advance(10000); await environment.monitor.tick();
  assert.equal(environment.monitor.status().recent.length, 1);
});

test('identical desired filenames get non-overwriting numbered suffixes', async context => {
  const environment = await fixture(context);
  const name = `${paper.title}_2024_ASCE.pdf`;
  const old = Buffer.from('unrelated original');
  await writeFile(join(environment.directory, name), old);
  await environment.begin(); await environment.complete();
  assert.deepEqual(await readFile(join(environment.directory, name)), old);
  assert.ok((await readdir(environment.directory)).includes(`${paper.title}_2024_ASCE (1).pdf`));
});

test('missing selected metadata is omitted and all-missing fields keep original', async context => {
  const environment = await fixture(context);
  environment.config.namingFields = ['title', 'year', 'venue']; await environment.monitor.tick();
  await environment.begin('missing.pdf', { title: paper.title }); await environment.complete('missing.pdf');
  assert.equal(environment.monitor.status().recent[0].filename, `${paper.title}.pdf`);
  assert.deepEqual(environment.monitor.status().recent[0].missingFields, ['year', 'venue']);
  environment.config.namingFields = ['venue']; await environment.monitor.tick();
  await environment.begin('empty.pdf', { title: paper.title }); await environment.complete('empty.pdf');
  assert.equal(environment.monitor.status().recent[0].status, 'missing-metadata');
  assert.ok((await readdir(environment.directory)).includes('empty.pdf'));
});

test('disabled and directory changes cancel in-progress rename eligibility', async context => {
  const environment = await fixture(context);
  await environment.begin();
  environment.config.renameEnabled = false; await environment.monitor.tick();
  await environment.complete();
  assert.equal(environment.monitor.status().mode, 'disabled');
  assert.deepEqual(await readdir(environment.directory), ['download.pdf']);
  environment.config.downloadDirectory = ''; environment.config.renameEnabled = true; await environment.monitor.tick();
  assert.equal(environment.monitor.status().mode, 'needs-directory');
  environment.config.downloadDirectory = join(environment.directory, 'absent'); await environment.monitor.tick();
  assert.equal(environment.monitor.status().mode, 'directory-unavailable');
  assert.doesNotMatch(JSON.stringify(environment.monitor.status()), /absent|rename-/);
});

test('no rename occurs after stop or during browser restrictions', async context => {
  let allowed = true;
  const environment = await fixture(context, { allowed: () => allowed });
  await environment.begin(); allowed = false; await environment.complete();
  assert.deepEqual(await readdir(environment.directory), ['download.pdf']);
  await environment.monitor.stop(); allowed = true; await environment.monitor.tick();
  assert.deepEqual(await readdir(environment.directory), ['download.pdf']);
});

test('new metadata after download started cannot authorize a rename', async context => {
  const environment = await fixture(context);
  await environment.begin(); environment.monitor.papers.clear();
  environment.advance(10); environment.monitor.remember(paper);
  await environment.complete();
  assert.equal(environment.monitor.status().recent[0].status, 'unmatched');
});

test('metadata refresh retains original capture time and title matching is exact', async context => {
  const environment = await fixture(context);
  await environment.begin(); environment.advance(10); environment.monitor.remember(paper);
  await environment.complete(); assert.equal(environment.monitor.status().recent[0].status, 'renamed');
  assert.equal(matchPaper({ title: 'Ａ STUDY of safe research downloads' }, [paper]), paper);
  assert.equal(matchPaper({ title: `${paper.title} supplement` }, [paper]), null);
  assert.equal(matchPaper({ title: paper.title, doi: '10.1234/other' }, [paper]), null);
  assert.equal(matchPaper({ title: 'Introduction' }, [{ title: 'Introduction' }]), null);
});

test('non-PDF, hardlinks, wrong size, changed identity and cancelled operations are preserved', async context => {
  const environment = await fixture(context);
  const file = join(environment.directory, 'file.pdf');
  await writeFile(file, await pdf());
  const record = { path: file, state: 'completed' };
  assert.equal((await renameCompletedPdf({ ...record, state: 'progress' }, paper, ['title'])).status, 'not-completed');
  assert.equal((await renameCompletedPdf({ ...record, totalBytes: 1 }, paper, ['title'])).status, 'size-mismatch');
  assert.equal((await renameCompletedPdf({ ...record, fingerprint: 'stale' }, paper, ['title'])).status, 'file-changed');
  assert.equal((await renameCompletedPdf(record, paper, ['title'], { canProceed: () => false })).status, 'cancelled');
  assert.equal((await lstat(file)).nlink, 1);
  await link(file, join(environment.directory, 'link.pdf'));
  assert.equal((await renameCompletedPdf(record, paper, ['title'])).status, 'unsafe-file');
  await writeFile(join(environment.directory, 'html.pdf'), '<html>not a PDF</html>');
  assert.equal((await renameCompletedPdf({ path: join(environment.directory, 'html.pdf'), state: 'completed' }, paper, ['title'])).status, 'not-pdf');
});

test('disabling during PDF verification cannot dispatch the rename', async context => {
  let calls = 0;
  let environment;
  environment = await fixture(context, {
    readIdentity: async () => { environment.config.renameEnabled = false; environment.monitor.configure(); return paper; },
    rename: async () => { calls++; return { status: 'renamed' }; },
  });
  await environment.begin(); await environment.complete();
  assert.equal(calls, 0);
  assert.ok((await readdir(environment.directory)).includes('download.pdf'));
});
