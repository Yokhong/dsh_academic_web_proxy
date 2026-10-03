import test from 'node:test';
import assert from 'node:assert/strict';
import { win32 } from 'node:path';
import { NAMING_FIELDS, DEFAULT_NAMING_FIELDS, normalizeNamingFields, buildPaperFilename } from '../src/filename.js';

const paper = Object.freeze({ title: 'A Useful Paper', author: 'Ada Lovelace', year: '2024', venue: 'Research Letters', platform: 'Nature' });
const result = (filename, usedFields, missingFields = []) => ({ filename, missingFields, usedFields });

function assertSafe(filename, maxBytes = 200) {
  assert.equal(win32.basename(filename), filename);
  assert.doesNotMatch(filename, /[<>:"/\\|?*\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/u);
  assert.doesNotMatch(filename, /[ .]$/u);
  assert.doesNotMatch(filename, /\.{2}/u);
  assert.match(filename, /\.pdf$/u);
  assert.ok(Buffer.byteLength(filename, 'utf8') <= maxBytes);
  assert.equal(Buffer.from(filename, 'utf8').toString('utf8'), filename);
}

test('naming constants are frozen and normalization returns independent canonical arrays', () => {
  assert.deepEqual(NAMING_FIELDS, ['title', 'author', 'year', 'venue', 'platform']);
  assert.deepEqual(DEFAULT_NAMING_FIELDS, ['title', 'year', 'platform']);
  assert.ok(Object.isFrozen(NAMING_FIELDS));
  assert.ok(Object.isFrozen(DEFAULT_NAMING_FIELDS));
  const input = ['platform', 'author', 'title'];
  assert.deepEqual(normalizeNamingFields(input), ['title', 'author', 'platform']);
  assert.deepEqual(input, ['platform', 'author', 'title']);
  assert.deepEqual(normalizeNamingFields(), ['title', 'year', 'platform']);
  assert.notStrictEqual(normalizeNamingFields(), DEFAULT_NAMING_FIELDS);
  assert.deepEqual(normalizeNamingFields([]), []);
});

test('unknown fields, duplicate fields and non-arrays are rejected', () => {
  for (const input of [null, 'title', {}, ['doi'], ['Title'], ['title', 'title'], ['__proto__'], [false], [null], [, 'year'], ['title', 'author', 'year', 'venue', 'platform', 'doi']]) {
    assert.throws(() => normalizeNamingFields(input), TypeError);
    assert.throws(() => buildPaperFilename(paper, input), TypeError);
  }
});

test('components use canonical order and omitted fields do not affect the filename', () => {
  assert.deepEqual(buildPaperFilename(paper), result('A Useful Paper_2024_Nature.pdf', ['title', 'year', 'platform']));
  assert.deepEqual(buildPaperFilename(paper, ['platform', 'venue', 'year', 'author', 'title']), result('A Useful Paper_Ada Lovelace_2024_Research Letters_Nature.pdf', NAMING_FIELDS));
  assert.deepEqual(buildPaperFilename(paper, ['author']), result('Ada Lovelace.pdf', ['author']));
  assert.deepEqual(buildPaperFilename(paper, []), result(null, []));
  assert.deepEqual(paper, { title: 'A Useful Paper', author: 'Ada Lovelace', year: '2024', venue: 'Research Letters', platform: 'Nature' });
});

test('missing selected data is omitted and reported without invented placeholders', () => {
  assert.deepEqual(buildPaperFilename({ title: 'Only Title', year: ' ', platform: null }), result('Only Title.pdf', ['title'], ['year', 'platform']));
  assert.deepEqual(buildPaperFilename({ year: 2023 }, ['author', 'year', 'venue']), result('2023.pdf', ['year'], ['author', 'venue']));
  assert.deepEqual(buildPaperFilename({}, ['title', 'author']), result(null, [], ['title', 'author']));
  assert.deepEqual(buildPaperFilename(null), result(null, [], DEFAULT_NAMING_FIELDS));
  assert.deepEqual(buildPaperFilename(), result(null, [], DEFAULT_NAMING_FIELDS));
  assert.deepEqual(buildPaperFilename({ title: '../\\:*?"<>|', year: NaN, platform: '\u202e\u200b' }), result(null, [], DEFAULT_NAMING_FIELDS));
});

test('metadata access ignores getters, inherited values and object conversions', () => {
  let invoked = false;
  const metadata = Object.create({ platform: 'Inherited Platform' });
  Object.defineProperty(metadata, 'title', { get() { invoked = true; return 'Secret'; } });
  metadata.year = { toString() { invoked = true; return '2024'; } };
  assert.deepEqual(buildPaperFilename(metadata), result(null, [], DEFAULT_NAMING_FIELDS));
  assert.equal(invoked, false);
});

test('path traversal, alternate data streams and forbidden characters produce only safe leaf names', () => {
  const inputs = [
    '../../folder\\file:report*?', 'C:\\Example\\Downloads\\..\\paper.pdf', '/absolute/path', '\\\\server\\share\\paper',
    ' title<with>:"bad"/characters\\and|wildcards?* ', '... leading ... and trailing ... ', 'a\u0000b\u0008c',
    'Fullwidth：／＼＜＞＂｜？＊ report', 'Unicode ∕ ⁄ ⧵ ⧸ slash',
  ];
  for (const title of inputs) {
    const value = buildPaperFilename({ title }, ['title']);
    assert.ok(value.filename, title);
    assertSafe(value.filename);
  }
  assert.equal(buildPaperFilename({ title: '../../folder\\file:report*?' }, ['title']).filename, 'folder_file_report.pdf');
  assert.equal(buildPaperFilename({ title: ' . Title ...   ' }, ['title']).filename, 'Title.pdf');
});

test('Windows reserved device names include dotted, Unicode and case variants', () => {
  for (const title of ['CON', 'con.txt', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9', 'COM¹', 'LPT²', 'ＣＯＮ', 'CONIN$', 'CONOUT$', 'CLOCK$', 'C\u202eON', 'CON .txt']) {
    const { filename } = buildPaperFilename({ title }, ['title']);
    assert.ok(filename.startsWith('_'), `${title}: ${filename}`);
    assertSafe(filename);
  }
  for (const title of ['CONcept', 'COM10', 'LPT10', 'ICON', 'nulled']) assert.equal(buildPaperFilename({ title }, ['title']).filename, `${title}.pdf`);
});

test('Unicode names normalize to NFC while emoji graphemes survive intact', () => {
  const title = '  Cafe\u0301\t中文  😀  👩\u200d🔬  ';
  const { filename } = buildPaperFilename({ title }, ['title']);
  assert.equal(filename, 'Café 中文 😀 👩\u200d🔬.pdf');
  assert.equal(filename.normalize('NFC'), filename);
  assertSafe(filename);
  assert.equal(buildPaperFilename({ title: 'A\u202eB\u2066C\u2069\ufeff\ud800' }, ['title']).filename, 'ABC.pdf');
  assert.equal(buildPaperFilename({ title: '\u200d\u0301' }, ['title']).filename, null);
});

test('byte caps include the extension and truncation never splits UTF8 or emoji graphemes', () => {
  for (const title of ['a'.repeat(600), '汉字'.repeat(150), '😀'.repeat(150), '👩\u200d🔬'.repeat(80), 'e\u0301'.repeat(400)]) {
    for (const maxBytes of [12, 20, 63, 200, 1000]) {
      const value = buildPaperFilename({ title }, ['title'], { maxBytes });
      if (value.filename) assertSafe(value.filename, Math.min(maxBytes, 255));
      assert.deepEqual(value.missingFields, []);
    }
  }
  assert.equal(Buffer.byteLength(buildPaperFilename({ title: 'a'.repeat(500) }, ['title']).filename), 200);
  assert.deepEqual(buildPaperFilename({ title: '👩\u200d🔬Z' }, ['title'], { maxBytes: 15 }), result('👩\u200d🔬.pdf', ['title']));
  assert.deepEqual(buildPaperFilename({ title: '👩\u200d🔬Z' }, ['title'], { maxBytes: 14 }), result(null, []));
  assert.deepEqual(buildPaperFilename({ title: 'A' }, ['title'], { maxBytes: 5 }), result('A.pdf', ['title']));
});

test('long components share the byte budget while every available selected field remains represented', () => {
  assert.deepEqual(buildPaperFilename({ ...paper, title: 'A'.repeat(500) }), result(`${'A'.repeat(184)}_2024_Nature.pdf`, ['title', 'year', 'platform']));
  const longPaper = { title: 'T'.repeat(500), author: 'A'.repeat(500), year: '2024', venue: 'V'.repeat(500), platform: 'P'.repeat(500) };
  const balanced = buildPaperFilename(longPaper, ['platform', 'venue', 'year', 'author', 'title']);
  assert.deepEqual(balanced, result(`${'T'.repeat(47)}_${'A'.repeat(47)}_2024_${'V'.repeat(47)}_${'P'.repeat(47)}.pdf`, NAMING_FIELDS));
  assertSafe(balanced.filename);
  const emojiPaper = { title: '👩\u200d🔬'.repeat(100), author: '李'.repeat(100), year: '2024', venue: 'Research Letters', platform: 'Taylor & Francis' };
  const emoji = buildPaperFilename(emojiPaper, NAMING_FIELDS);
  assert.deepEqual(emoji.usedFields, NAMING_FIELDS);
  assert.deepEqual(emoji.missingFields, []);
  assertSafe(emoji.filename);
  const [title, author, year, venue, platform] = emoji.filename.slice(0, -4).split('_');
  assert.match(title, /^(?:👩\u200d🔬)+$/u);
  assert.match(author, /^李+$/u);
  assert.equal(year, '2024');
  assert.equal(venue, emojiPaper.venue);
  assert.equal(platform, emojiPaper.platform);
  assert.deepEqual(buildPaperFilename({ title: 'A', author: 'B'.repeat(30), year: '2024' }, ['title', 'author', 'year'], { maxBytes: 10 }), result('A_BB_2.pdf', ['title', 'author', 'year']));
  assert.deepEqual(buildPaperFilename({ title: 'A', author: 'B', year: '2024' }, ['title', 'author', 'year'], { maxBytes: 7 }), result('A_B.pdf', ['title', 'author']));
  assert.deepEqual(buildPaperFilename({ title: '👩\u200d🔬', year: '2024' }, ['title', 'year'], { maxBytes: 10 }), result('2024.pdf', ['year']));
  for (const title of ['CONcert', 'NULify', 'AUXiliary']) {
    const { filename } = buildPaperFilename({ title }, ['title'], { maxBytes: 7 });
    assert.ok(filename.startsWith('_'));
    assertSafe(filename, 7);
  }
});

test('only PDF extensions and valid byte budgets are accepted', () => {
  assert.equal(buildPaperFilename({ title: 'Paper' }, ['title'], { extension: '.PDF' }).filename, 'Paper.pdf');
  for (const extension of ['', 'pdf', '.pdf.exe', '.txt', '../.pdf', '.pdf ', null, 42]) {
    assert.throws(() => buildPaperFilename(paper, undefined, { extension }), TypeError);
  }
  for (const maxBytes of [0, -1, 4, 5.5, NaN, Infinity, '200', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildPaperFilename(paper, undefined, { maxBytes }), RangeError);
  }
});
