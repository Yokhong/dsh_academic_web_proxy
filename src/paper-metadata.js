/**
 * Read the current page without executing page data, fetching URLs or reading forms.
 * All helpers intentionally live inside this function so it can be serialized.
 * originalHostname is an optional public hostname recovered by the caller's proxy rules.
 */
export function extractPaperMetadata(originalHostname = '') {
  const limits = { title: 1000, author: 300, year: 4, venue: 500, platform: 80, doi: 512, url: 4096 };
  const own = (value, key) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  const clean = (value, limit) => {
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return '';
    const normalized = String(value).slice(0, 16384).normalize('NFC').replace(/\s+/gu, ' ').replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '').trim();
    let result = '';
    for (const character of normalized) {
      if (result.length + character.length > limit) break;
      result += character;
    }
    return result;
  };
  const safeUrl = (value, base = '') => {
    if (typeof value !== 'string' || value.length > limits.url || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) return '';
    const text = value.trim();
    if (!text) return '';
    try {
      const url = base ? new URL(text, base) : new URL(text);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || url.href.length > limits.url) return '';
      return url.href;
    } catch { return ''; }
  };
  const pageUrl = safeUrl(typeof location === 'object' ? location.href : '');
  const metadata = { title: '', author: '', year: '', venue: '', platform: '', doi: '', pdfUrl: '', pageUrl };
  const tags = new Map();
  let count = 0;
  for (const node of document.querySelectorAll('meta')) {
    if (++count > 512) break;
    const content = node.getAttribute('content');
    if (typeof content !== 'string' || !content.trim()) continue;
    for (const attribute of ['name', 'property']) {
      const key = clean(node.getAttribute(attribute), 100).toLowerCase().replace(/:/gu, '.');
      if (!key) continue;
      if (!tags.has(key)) tags.set(key, []);
      if (tags.get(key).length < 32) tags.get(key).push(content.slice(0, 16384));
    }
  }
  const fromTags = (keys, convert) => {
    for (const key of keys) {
      for (const value of tags.get(key) || []) {
        const converted = convert(value);
        if (converted) return converted;
      }
    }
    return '';
  };
  const yearOf = value => {
    const text = clean(value, 100);
    const match = text.match(/(?:^|[^\d])([12]\d{3})(?=$|[^\d])/u);
    return match ? match[1] : '';
  };
  const doiOf = value => {
    if (typeof value !== 'string' || value.length > limits.url || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) return '';
    let text = value.trim().replace(/^doi\s*:\s*/iu, '');
    if (/^https?:/iu.test(text)) {
      const parsed = safeUrl(text);
      if (!parsed) return '';
      const url = new URL(parsed);
      if (!['doi.org', 'dx.doi.org', 'www.doi.org'].includes(url.hostname)) return '';
      try { text = decodeURIComponent(url.pathname.slice(1)); } catch { return ''; }
    }
    return text.length <= limits.doi && /^10\.\d{4,9}\/[^\s<>"\p{Cc}\p{Cf}\p{Cs}]+$/u.test(text) ? text : '';
  };
  const firstAuthor = value => clean(typeof value === 'string' ? value.split(';', 1)[0] : value, limits.author);

  // Only parse bounded JSON, never script code or HTML. Graph references stay local.
  const nodes = [];
  const references = new Map();
  let scriptCount = 0;
  let jsonBytes = 0;
  for (const script of document.querySelectorAll('script[type]')) {
    if (++scriptCount > 64) break;
    if ((script.getAttribute('type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/ld+json') continue;
    const source = script.textContent;
    if (typeof source !== 'string' || source.length > 131072 || jsonBytes + source.length > 524288) continue;
    jsonBytes += source.length;
    let parsed;
    try { parsed = JSON.parse(source); } catch { continue; }
    const queue = [{ value: parsed, depth: 0 }];
    for (let index = 0; index < queue.length && nodes.length < 1024 && index < 2048; index++) {
      const { value, depth } = queue[index];
      if (!value || typeof value !== 'object' || depth > 12) continue;
      if (Array.isArray(value)) {
        for (const item of value.slice(0, 256)) if (queue.length < 2048) queue.push({ value: item, depth: depth + 1 });
        continue;
      }
      nodes.push(value);
      const id = own(value, '@id');
      if (typeof id === 'string' && id.length <= limits.url && !references.has(id)) references.set(id, value);
      for (const key of ['@graph', '@included', 'mainEntity']) {
        const child = own(value, key);
        if (child && typeof child === 'object' && queue.length < 2048) queue.push({ value: child, depth: depth + 1 });
      }
    }
    if (nodes.length >= 1024) break;
  }
  const resolve = value => {
    if (typeof value === 'string' && references.has(value)) return references.get(value);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const referenced = references.get(own(value, '@id'));
      if (referenced && Object.keys(value).length === 1) return referenced;
    }
    return value;
  };
  const nameOf = (value, limit, depth = 0) => {
    if (depth > 6) return '';
    if (Array.isArray(value)) return nameOf(value[0], limit, depth + 1);
    const resolved = resolve(value);
    if (resolved !== value) return nameOf(resolved, limit, depth + 1);
    if (typeof value === 'string') return safeUrl(value) ? '' : clean(value, limit);
    return clean(own(value, 'name'), limit) || clean([clean(own(value, 'givenName'), limit), clean(own(value, 'familyName'), limit)].filter(Boolean).join(' '), limit);
  };
  const venueOf = (value, depth = 0) => {
    if (depth > 6) return '';
    if (Array.isArray(value)) return venueOf(value[0], depth + 1);
    const resolved = resolve(value);
    if (resolved !== value) return venueOf(resolved, depth + 1);
    return venueOf(own(value, 'isPartOf'), depth + 1) || nameOf(value, limits.venue);
  };
  const articleNodes = nodes.filter(node => {
    const type = own(node, '@type');
    return (Array.isArray(type) ? type : [type]).some(value => typeof value === 'string' && /^(?:https?:\/\/schema\.org\/)?ScholarlyArticle$/iu.test(value));
  });
  const articleUrl = node => safeUrl(own(node, 'url')) || safeUrl(own(own(node, 'mainEntityOfPage'), '@id')) || safeUrl(own(node, 'mainEntityOfPage')) || safeUrl(own(node, '@id'));
  const article = articleNodes.find(node => pageUrl && articleUrl(node).split('#', 1)[0] === pageUrl.split('#', 1)[0]) || articleNodes[0];
  const jsonDoi = value => {
    const candidates = Array.isArray(value) ? value.slice(0, 32) : [value];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const doi = doiOf(candidate);
        if (doi) return doi;
      } else {
        const property = clean(own(candidate, 'propertyID'), 100);
        const doi = (!property || /^(?:doi|https?:\/\/doi\.org\/?)$/iu.test(property)) && doiOf(own(candidate, 'value'));
        if (doi) return doi;
      }
    }
    return '';
  };
  const jsonPdf = node => {
    // A contentUrl on a PDF MediaObject is evidence; no URL is constructed from a DOI.
    for (const key of ['encoding', 'associatedMedia']) {
      const value = own(node, key);
      const candidates = Array.isArray(value) ? value.slice(0, 32) : [value];
      for (const candidate of candidates) {
        const item = resolve(candidate);
        const format = clean(own(item, 'encodingFormat') || own(item, 'fileFormat'), 100);
        if (!/^(?:application\/pdf|pdf)$/iu.test(format)) continue;
        const url = safeUrl(own(item, 'contentUrl'), pageUrl) || safeUrl(own(item, 'url'), pageUrl);
        if (url) return url;
      }
    }
    return '';
  };

  metadata.title = fromTags(['citation_title', 'dc.title', 'dcterms.title'], value => clean(value, limits.title)) || clean(own(article, 'headline'), limits.title) || clean(own(article, 'name'), limits.title);
  metadata.author = fromTags(['citation_author', 'citation_authors', 'dc.creator', 'dcterms.creator'], firstAuthor) || firstAuthor(nameOf(own(article, 'author'), limits.author));
  metadata.year = fromTags(['citation_publication_date', 'citation_date', 'dc.date', 'dcterms.issued', 'dcterms.date', 'dc.date.issued', 'prism.publicationdate'], yearOf) || yearOf(own(article, 'datePublished'));
  metadata.venue = fromTags(['citation_journal_title', 'citation_conference_title', 'dc.source', 'dcterms.ispartof'], value => clean(value, limits.venue)) || venueOf(own(article, 'isPartOf'));
  metadata.doi = fromTags(['citation_doi', 'dc.identifier.doi', 'prism.doi', 'dc.identifier', 'dcterms.identifier'], doiOf) || jsonDoi(own(article, 'identifier')) || doiOf(own(article, 'doi')) || doiOf(own(article, '@id')) || doiOf(own(article, 'url'));
  metadata.pdfUrl = fromTags(['citation_pdf_url'], value => safeUrl(value, pageUrl)) || jsonPdf(article);

  const platforms = [
    ['ASCE', ['ascelibrary.org', 'asce.org'], ['american society of civil engineers']],
    ['Elsevier', ['sciencedirect.com', 'elsevier.com', 'cell.com'], ['elsevier bv', 'elsevier ltd', 'elsevier inc', 'sciencedirect']],
    ['Springer', ['springer.com', 'springeropen.com', 'biomedcentral.com'], ['springer nature', 'springerlink', 'springer science and business media']],
    ['MDPI', ['mdpi.com'], ['multidisciplinary digital publishing institute']],
    ['Wiley', ['wiley.com', 'hindawi.com'], ['john wiley and sons', 'john wiley sons', 'wiley blackwell', 'wiley online library', 'hindawi']],
    ['Taylor & Francis', ['tandfonline.com', 'taylorandfrancis.com', 'taylorfrancis.com'], ['taylor and francis', 'taylor francis', 'taylor and francis group', 'informa uk limited']],
    ['IEEE', ['ieee.org'], ['institute of electrical and electronics engineers', 'ieee xplore']],
    ['ACM', ['acm.org'], ['association for computing machinery', 'acm digital library']],
    ['Nature', ['nature.com'], ['nature publishing group', 'nature portfolio']],
    ['Science', ['science.org', 'sciencemag.org'], ['american association for the advancement of science', 'aaas']],
    ['Oxford', ['oup.com', 'oxfordjournals.org', 'oxfordacademic.com'], ['oxford university press', 'oxford academic']],
    ['Cambridge', ['cambridge.org'], ['cambridge university press', 'cambridge university press and assessment', 'cambridge core']],
    ['SAGE', ['sagepub.com', 'sagepub.co.uk'], ['sage publications', 'sage journals']],
    ['PLOS', ['plos.org'], ['public library of science']],
    ['Frontiers', ['frontiersin.org'], ['frontiers media sa', 'frontiers media']],
    ['ACS', ['acs.org'], ['american chemical society', 'acs publications']],
    ['RSC', ['rsc.org'], ['royal society of chemistry']],
    ['AIP', ['aip.org', 'scitation.org'], ['american institute of physics', 'aip publishing']],
    ['APS', ['aps.org'], ['american physical society']],
    ['IOP', ['iop.org'], ['institute of physics', 'iop publishing', 'iopscience']],
    ['PNAS', ['pnas.org'], ['national academy of sciences']],
    ['Royal Society', ['royalsocietypublishing.org'], ['the royal society', 'royal society publishing']],
    ['De Gruyter', ['degruyter.com', 'degruyterbrill.com'], ['walter de gruyter', 'de gruyter brill']],
    ['BMJ', ['bmj.com'], ['bmj publishing group']],
    ['Karger', ['karger.com'], ['s karger ag']],
    ['Annual Reviews', ['annualreviews.org'], []],
    ['eLife', ['elifesciences.org'], ['elife sciences publications']],
    ['JAMA', ['jamanetwork.com'], ['american medical association']],
    ['NEJM', ['nejm.org'], ['massachusetts medical society']],
    ['arXiv', ['arxiv.org'], []],
    ['JSTOR', ['jstor.org'], []],
    ['SSRN', ['ssrn.com'], []],
    ['PubMed', ['pubmed.ncbi.nlm.nih.gov'], []],
    ['PMC', ['pmc.ncbi.nlm.nih.gov'], []],
  ];
  const hostOf = value => {
    if (typeof value !== 'string' || value.length > 253 || !/^[a-z\d.-]+$/iu.test(value)) return '';
    return value.toLowerCase().replace(/\.$/u, '');
  };
  const publicHost = hostOf(originalHostname);
  const pageHost = pageUrl ? new URL(pageUrl).hostname.replace(/\.$/u, '') : '';
  for (const host of [publicHost, pageHost]) {
    if (!host) continue;
    const matched = platforms.find(([, domains]) => domains.some(domain => host === domain || host.endsWith(`.${domain}`)));
    if (matched) { metadata.platform = matched[0]; break; }
  }
  const publisherKey = value => clean(value, 200).toLowerCase().replace(/&/gu, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!metadata.platform) {
    const publishers = [fromTags(['citation_publisher', 'dc.publisher', 'dcterms.publisher'], value => clean(value, 200)), nameOf(own(article, 'publisher'), 200), fromTags(['og.site_name'], value => clean(value, 200))];
    for (const publisher of publishers) {
      if (!publisher) continue;
      const key = publisherKey(publisher);
      const matched = platforms.find(([name, , aliases]) => [name, ...aliases].some(alias => publisherKey(alias) === key));
      if (matched) { metadata.platform = matched[0]; break; }
    }
  }
  if (!metadata.title) {
    const siteName = fromTags(['og.site_name', 'application-name'], value => clean(value, limits.title)).toLowerCase();
    const genericNames = new Set(['home', 'homepage', 'welcome', 'article', 'articles', 'untitled', 'error', 'access denied', 'access forbidden', 'forbidden', 'page not found', '404 not found', '403 forbidden', 'service unavailable', 'sign in', 'signin', 'log in', 'login', 'user login', 'authentication required', 'institutional access', 'single sign on', 'security check', 'security verification', 'human verification', 'robot check', 'captcha', 'just a moment', 'checking your browser', 'verify you are human', 'verify that you are human', 'please wait', '登录', '登入', '用户登录', '用戶登入', '统一身份认证', '人机验证', '安全验证']);
    for (const [name, , aliases] of platforms) for (const value of [name, ...aliases]) genericNames.add(value.toLowerCase());
    const reasonableTitle = value => {
      const title = clean(value, limits.title);
      if (!title || title.toLowerCase() === siteName || [publicHost, pageHost].includes(title.toLowerCase())) return '';
      const parts = title.toLowerCase().split(/\s+[|\u2013\u2014-]\s+|\s*\|\s*/u).map(part => part.replace(/[.!…:]+$/gu, '').trim());
      if (parts.every(part => !part || genericNames.has(part))) return '';
      if (parts.some(part => /^(?:sign in|signin|log in|login|user login|authentication required|institutional access|single sign on|security check|security verification|human verification|robot check|captcha|just a moment|checking your browser|access denied|access forbidden|登录|登入|用户登录|用戶登入|统一身份认证|人机验证|安全验证)$/iu.test(part))) return '';
      if (/^(?:just a moment|please (?:wait|verify|complete the security check)|verify (?:that )?you are|checking (?:your )?browser|checking if the site connection|performing security verification|sign in to|log in to|login to|access denied|403 forbidden|404 not found)(?:\b|[.!…])/iu.test(title)) return '';
      return title;
    };
    let headingCount = 0;
    for (const heading of document.querySelectorAll('h1')) {
      if (++headingCount > 12) break;
      if (heading.hidden || heading.getAttribute('aria-hidden') === 'true') continue;
      metadata.title = reasonableTitle(heading.textContent);
      if (metadata.title) break;
    }
    if (!metadata.title) metadata.title = reasonableTitle(document.title);
  }
  return metadata;
}

export const PAPER_METADATA_SCRIPT = `(${extractPaperMetadata.toString()})()`;
