import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { extractPaperMetadata, PAPER_METADATA_SCRIPT } from '../src/paper-metadata.js';

function extract({ meta = [], json = [], headings = [], title = '', url = 'https://papers.example/article', originalHostname = '', scripts = [] } = {}) {
  const element = (attributes = {}, text = '') => ({
    hidden: attributes.hidden === true,
    textContent: text,
    getAttribute: name => Object.hasOwn(attributes, name) ? attributes[name] : null,
    get value() { throw new Error('Credential input values must never be read.'); },
    get innerHTML() { throw new Error('HTML must never be read or executed.'); },
  });
  const nodes = {
    meta: meta.map(value => element(Array.isArray(value) ? { name: value[0], content: value[1] } : value)),
    'script[type]': [...json.map(value => element({ type: 'application/ld+json' }, JSON.stringify(value))), ...scripts.map(value => element({ type: value.type || 'application/ld+json' }, value.source))],
    h1: headings.map(value => typeof value === 'string' ? element({}, value) : element(value.attributes, value.text)),
  };
  const document = {
    title,
    querySelectorAll(selector) {
      assert.ok(Object.hasOwn(nodes, selector), `Unexpected page read: ${selector}`);
      return nodes[selector];
    },
    get body() { throw new Error('No form or body inspection is needed for metadata.'); },
    get cookie() { throw new Error('Cookies must not be read.'); },
  };
  const context = {
    document, location: { href: url }, URL,
    fetch() { throw new Error('Network access is forbidden.'); },
    XMLHttpRequest() { throw new Error('Network access is forbidden.'); },
  };
  const script = originalHostname ? `(${extractPaperMetadata.toString()})(${JSON.stringify(originalHostname)})` : PAPER_METADATA_SCRIPT;
  const result = runInNewContext(script, context, { timeout: 1000 });
  assert.equal(context.executed, undefined, 'Untrusted JSON-LD must not execute.');
  return JSON.parse(JSON.stringify(result));
}

const empty = overrides => ({ title: '', author: '', year: '', venue: '', platform: '', doi: '', pdfUrl: '', pageUrl: 'https://papers.example/article', ...overrides });

test('serialized extractor is self-contained and prefers citation metadata and the first author', () => {
  assert.equal(PAPER_METADATA_SCRIPT, `(${extractPaperMetadata.toString()})()`);
  const result = extract({
    url: 'https://ascelibrary.org/doi/10.1061/test',
    title: 'Different browser title', headings: ['Different heading'],
    meta: [
      ['citation_title', '  Bridges\n and\t resilience  '],
      ['citation_author', '  Ada Lovelace  '], ['citation_author', 'Second Author'],
      ['citation_publication_date', '2024/03/09'], ['citation_date', '2023-01-01'],
      ['citation_journal_title', 'Journal of Bridges'], ['citation_conference_title', 'Bridge Conference'],
      ['citation_doi', 'doi:10.1061/test'], ['citation_pdf_url', '/doi/pdf/10.1061/test'],
      ['DC.Title', 'DC title'], ['dc.creator', 'DC author'],
    ],
    json: [{ '@type': 'ScholarlyArticle', headline: 'JSON title', author: { name: 'JSON author' }, datePublished: '2022', isPartOf: { name: 'JSON journal' } }],
  });
  assert.deepEqual(result, {
    title: 'Bridges and resilience', author: 'Ada Lovelace', year: '2024', venue: 'Journal of Bridges', platform: 'ASCE',
    doi: '10.1061/test', pdfUrl: 'https://ascelibrary.org/doi/pdf/10.1061/test', pageUrl: 'https://ascelibrary.org/doi/10.1061/test',
  });
});

test('Dublin Core names and properties are case insensitive and support DOI identifiers', () => {
  const result = extract({
    meta: [
      ['DC:Title', 'Decomposed Cafe\u0301'], ['DC.Creator', 'Smith, Jane; Jones, Alex'], ['dc.creator', 'Other Author'],
      { property: 'DCTERMS:issued', content: '2021-07-08' }, ['DC.Source', 'Research Letters'],
      ['dc.identifier', 'ISBN 978-0-0000'], ['dc.identifier', 'https://doi.org/10.1234/Example'],
      ['dc.publisher', 'Oxford University Press'],
    ],
  });
  assert.deepEqual(result, empty({ title: 'Decomposed Café', author: 'Smith, Jane', year: '2021', venue: 'Research Letters', platform: 'Oxford', doi: '10.1234/Example' }));
});

test('citation conference/date fallbacks skip empty and invalid preferred values', () => {
  const result = extract({ meta: [
    ['citation_title', ''], ['citation_title', 'Proceedings Paper'], ['citation_author', ''], ['citation_author', 'First Person'],
    ['citation_publication_date', 'n.d.'], ['citation_date', '12 March 2020'],
    ['citation_journal_title', '  '], ['citation_conference_title', 'Annual Conference'],
    ['citation_doi', 'not a DOI'], ['dc.identifier.doi', '10.1234/fallback'],
  ] });
  assert.deepEqual(result, empty({ title: 'Proceedings Paper', author: 'First Person', year: '2020', venue: 'Annual Conference', doi: '10.1234/fallback' }));
});

test('JSON-LD graph resolves first author, journal hierarchy, DOI and PDF evidence', () => {
  const result = extract({ json: [{ '@graph': [
    { '@type': 'WebSite', name: 'Do not use the website title' },
    { '@type': ['Thing', 'https://schema.org/ScholarlyArticle'], headline: 'Graph Paper', name: 'Secondary title',
      author: [{ '@id': '#first' }, { name: 'Other Author' }], datePublished: '2019-11-12',
      isPartOf: { '@id': '#issue' }, publisher: { '@id': '#publisher' },
      identifier: [{ propertyID: 'ISBN', value: '10.9999/not-doi' }, { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.4321/graph' }],
      encoding: [{ encodingFormat: 'text/html', contentUrl: '/html' }, { encodingFormat: 'application/pdf', contentUrl: './paper.pdf' }],
    },
    { '@id': '#first', '@type': 'Person', givenName: 'Grace', familyName: 'Hopper' },
    { '@id': '#issue', '@type': 'PublicationIssue', name: 'Issue 7', isPartOf: { '@id': '#journal' } },
    { '@id': '#journal', '@type': 'Periodical', name: 'Journal of Graphs' },
    { '@id': '#publisher', '@type': 'Organization', name: 'John Wiley & Sons' },
  ] }] });
  assert.deepEqual(result, empty({ title: 'Graph Paper', author: 'Grace Hopper', year: '2019', venue: 'Journal of Graphs', platform: 'Wiley', doi: '10.4321/graph', pdfUrl: 'https://papers.example/paper.pdf' }));
});

test('JSON-LD arrays and mainEntity are supported without mixing different articles', () => {
  const result = extract({ json: [[
    { '@type': 'ScholarlyArticle', url: 'https://papers.example/other', headline: 'Other Paper', author: 'Other Author', isPartOf: { name: 'Other Journal' } },
    { '@type': 'WebPage', mainEntity: {
      '@type': 'ScholarlyArticle', mainEntityOfPage: { '@id': 'https://papers.example/article#article' },
      name: 'Current Paper', author: ['First Author', 'Second Author'], datePublished: 2025, publisher: { name: 'Frontiers Media SA' },
    } },
  ]] });
  assert.deepEqual(result, empty({ title: 'Current Paper', author: 'First Author', year: '2025', platform: 'Frontiers' }));
});

test('invalid JSON, executable text and unrelated schema objects are ignored', () => {
  const result = extract({
    title: 'Login',
    json: [{ '@type': 'WebSite', headline: 'Site Heading', author: { name: 'Site Owner' } }, { '@type': 'Article', headline: 'Unspecified Article' }],
    scripts: [
      { source: '{"@type":"ScholarlyArticle",' },
      { source: 'globalThis.executed = true;' },
      { type: 'text/javascript', source: '{"@type":"ScholarlyArticle","headline":"Not JSON-LD"}' },
      { source: '{"__proto__":{"headline":"Prototype Title"},"@type":"ScholarlyArticle","author":{"__proto__":{"name":"Prototype Author"}}}' },
    ],
  });
  assert.deepEqual(result, empty());
});

test('cycles and absent first-author names do not borrow later authors or stringify objects', () => {
  const result = extract({ json: [{ '@graph': [
    { '@type': 'ScholarlyArticle', headline: { injected: 'not text' }, author: [{ unknown: 'missing' }, { name: 'Second Author' }], publisher: { name: { fake: 'Wiley' } }, isPartOf: { '@id': '#loop' } },
    { '@id': '#loop', isPartOf: { '@id': '#loop' } },
  ] }] });
  assert.deepEqual(result, empty());
});

test('only credential-free HTTP(S) metadata URLs are returned', () => {
  for (const unsafe of ['javascript:alert(1)', 'data:application/pdf,secret', 'file:///C:/paper.pdf', 'ftp://papers.example/file.pdf', 'https://user:password@papers.example/file.pdf', '//user:password@papers.example/file.pdf', 'https://papers.example/\nfile.pdf', 'https://papers.example/\u202efile.pdf']) {
    assert.equal(extract({ meta: [['citation_pdf_url', unsafe]] }).pdfUrl, '', unsafe);
  }
  assert.equal(extract({ url: 'https://user:password@papers.example/article' }).pageUrl, '');
  assert.equal(extract({ url: 'about:blank' }).pageUrl, '');
  assert.equal(extract({ meta: [['citation_pdf_url', '//cdn.example/paper.pdf?download=1']] }).pdfUrl, 'https://cdn.example/paper.pdf?download=1');
  assert.equal(extract({ meta: [['citation_pdf_url', 'https://cdn.example/paper%20one.pdf']] }).pdfUrl, 'https://cdn.example/paper%20one.pdf');
});

test('DOI parsing rejects unsafe identifiers and never constructs a PDF URL', () => {
  for (const unsafe of ['https://user:password@doi.org/10.1234/secret', 'https://evil.example/10.1234/unknown', '10.123/not-valid', '10.1234/white space', 'javascript:10.1234/fake']) {
    assert.equal(extract({ meta: [['citation_doi', unsafe]] }).doi, '', unsafe);
  }
  assert.deepEqual(extract({ meta: [['citation_doi', 'https://dx.doi.org/10.1234%2Fencoded']] }), empty({ doi: '10.1234/encoded' }));
});

test('JSON-LD needs a declared PDF format and rejects unsafe media URLs', () => {
  const article = { '@type': 'ScholarlyArticle', headline: 'PDF Evidence', url: 'https://papers.example/maybe.pdf', encoding: { contentUrl: '/undeclared.pdf' }, associatedMedia: [{ encodingFormat: 'application/pdf', contentUrl: 'https://secret:credential@cdn.example/file.pdf' }, { encodingFormat: 'PDF', url: '/declared.pdf' }] };
  assert.equal(extract({ json: [article] }).pdfUrl, 'https://papers.example/declared.pdf');
  assert.equal(extract({ json: [{ ...article, associatedMedia: undefined }] }).pdfUrl, '');
});

test('public publisher domains use strict boundaries and optional original hostname precedence', () => {
  const examples = [
    ['ascelibrary.org', 'ASCE'], ['www.sciencedirect.com', 'Elsevier'], ['link.springer.com', 'Springer'],
    ['www.mdpi.com', 'MDPI'], ['onlinelibrary.wiley.com', 'Wiley'], ['www.tandfonline.com', 'Taylor & Francis'],
    ['ieeexplore.ieee.org', 'IEEE'], ['dl.acm.org', 'ACM'], ['www.nature.com', 'Nature'], ['www.science.org', 'Science'],
    ['academic.oup.com', 'Oxford'], ['www.cambridge.org', 'Cambridge'], ['journals.sagepub.com', 'SAGE'],
    ['journals.plos.org', 'PLOS'], ['www.frontiersin.org', 'Frontiers'], ['pubs.acs.org', 'ACS'], ['pubs.rsc.org', 'RSC'],
  ];
  for (const [host, platform] of examples) assert.equal(extract({ url: `https://${host}/paper` }).platform, platform, host);
  assert.equal(extract({ url: 'https://public-host.proxy.example/paper', originalHostname: 'LINK.SPRINGER.COM.' }).platform, 'Springer');
  assert.equal(extract({ url: 'https://ascelibrary.org/paper', originalHostname: 'dl.acm.org' }).platform, 'ACM');
  for (const host of ['evilscience.org', 'ascelibrary.org.attacker.example', 'sciencedirect-com.proxy.example']) assert.equal(extract({ url: `https://${host}/paper` }).platform, '', host);
  assert.equal(extract({ originalHostname: 'user:password@wiley.com' }).platform, '');
  assert.equal(extract({ meta: [['citation_publisher', 'Unknown Publishing']] }).platform, '');
});

test('known publisher aliases are canonical but do not overwrite a known public host', () => {
  assert.equal(extract({ meta: [['citation_publisher', 'Taylor & Francis']] }).platform, 'Taylor & Francis');
  assert.equal(extract({ meta: [{ property: 'og:site_name', content: 'IEEE Xplore' }] }).platform, 'IEEE');
  assert.equal(extract({ url: 'https://nature.com/article', meta: [['citation_publisher', 'Springer Nature']] }).platform, 'Nature');
});

test('reasonable headings and document titles are fallback data', () => {
  assert.equal(extract({ headings: ['Home', 'An actual research question'], title: 'Publisher Home' }).title, 'An actual research question');
  assert.equal(extract({ headings: [{ attributes: { hidden: true }, text: 'Hidden Title' }, { attributes: { 'aria-hidden': 'true' }, text: 'Other Hidden Title' }], title: 'Visible Article Title' }).title, 'Visible Article Title');
  assert.equal(extract({ title: 'A browser title about CAPTCHA classification' }).title, 'A browser title about CAPTCHA classification');
  for (const title of ['Just a moment...', 'Checking your browser', 'Verify you are human', 'Sign in', 'Login', 'Access denied', 'Home | Wiley Online Library', 'ScienceDirect', 'Login | University Library', 'Security verification | Library']) {
    assert.equal(extract({ title, headings: [title] }).title, '', title);
  }
  assert.equal(extract({ meta: [{ property: 'og:site_name', content: 'A Custom Academic Portal' }], title: 'A Custom Academic Portal' }).title, '');
});

test('output lengths are bounded and invalid scalar values do not escape', () => {
  const result = extract({ meta: [
    ['citation_title', '😀'.repeat(1500)], ['citation_author', 'A'.repeat(500)], ['citation_journal_title', 'V'.repeat(900)],
    ['citation_doi', `10.1234/${'x'.repeat(600)}`], ['citation_pdf_url', `https://papers.example/${'x'.repeat(5000)}`],
  ] });
  assert.equal(result.title.length, 1000);
  assert.equal(result.author.length, 300);
  assert.equal(result.venue.length, 500);
  assert.equal(result.doi, '');
  assert.equal(result.pdfUrl, '');
  assert.doesNotMatch(result.title, /\p{Cs}/u);
  assert.equal(extract({ meta: [['citation_title', 'A\u202eB\u0000C\ud800']] }).title, 'ABC');
  assert.deepEqual(Object.keys(result), ['title', 'author', 'year', 'venue', 'platform', 'doi', 'pdfUrl', 'pageUrl']);
});

test('oversized JSON-LD is skipped and traversal is bounded', () => {
  assert.deepEqual(extract({ scripts: [{ source: JSON.stringify({ '@type': 'ScholarlyArticle', headline: 'Too Large', description: 'x'.repeat(140000) }) }] }), empty());
  let graph = { '@type': 'ScholarlyArticle', headline: 'Too Deep' };
  for (let index = 0; index < 20; index++) graph = { '@graph': [graph] };
  assert.deepEqual(extract({ json: [graph] }), empty());
});
