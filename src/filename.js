export const NAMING_FIELDS = Object.freeze(['title', 'author', 'year', 'venue', 'platform']);
export const DEFAULT_NAMING_FIELDS = Object.freeze(['title', 'year', 'platform']);

export function normalizeNamingFields(input = DEFAULT_NAMING_FIELDS) {
  if (!Array.isArray(input) || input.length > NAMING_FIELDS.length) throw new TypeError('Naming fields must be an array of at most five allowed fields.');
  const selected = new Set();
  for (const field of input) {
    if (typeof field !== 'string' || !NAMING_FIELDS.includes(field)) throw new TypeError('Unknown filename field.');
    if (selected.has(field)) throw new TypeError('Filename fields must be unique.');
    selected.add(field);
  }
  return NAMING_FIELDS.filter(field => selected.has(field));
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const deviceName = value => /^(?:CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|COM[0-9]|LPT[0-9])$/iu.test(value.split('.', 1)[0].normalize('NFKC').trim());
const trimEdges = value => value.replace(/^[ ._]+|[ ._]+$/gu, '');
const trimEnd = value => value.replace(/[ ._]+$/gu, '');
const hasContent = value => /[^\p{M}\p{Cf}\p{Z}_.]/u.test(value);
const byteLength = value => Buffer.byteLength(value, 'utf8');

function sanitize(value) {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return '';
  let text = String(value).slice(0, 16384).normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cs}\p{Cf}]/gu, character => ['\u200c', '\u200d'].includes(character) ? character : '')
    .replace(/[<>:"/\\|?*\uff1c\uff1e\uff1a\uff02\uff0f\uff3c\uff5c\uff1f\uff0a\u2044\u2215\u29f5\u29f8]/gu, '_')
    .replace(/[\uff0e\u2024\ufe52]/gu, '.')
    .replace(/\.{2,}/gu, '.')
    .replace(/_+/gu, '_');
  text = trimEdges(text);
  if (!text || !/[^\p{M}\p{Cf}\p{Z}]/u.test(text)) return '';
  return deviceName(text) ? `_${text}` : text;
}

function truncateUtf8(value, budget) {
  let result = '';
  let bytes = 0;
  for (const { segment } of segmenter.segment(value)) {
    const size = byteLength(segment);
    if (bytes + size > budget) break;
    result += segment;
    bytes += size;
  }
  return trimEnd(result);
}

function minimumPrefixBytes(value) {
  let bytes = 0;
  for (const { segment } of segmenter.segment(value)) {
    bytes += byteLength(segment);
    if (hasContent(segment)) return bytes;
  }
  return Infinity;
}

function allocateComponents(available, budget) {
  const components = [];
  let remaining = budget;
  for (const { field, value } of available) {
    const minimum = minimumPrefixBytes(value);
    const cost = minimum + (components.length ? 1 : 0);
    if (cost > remaining) continue;
    components.push({ field, value, budget: minimum, size: byteLength(value) });
    remaining -= cost;
  }
  while (remaining > 0) {
    let next;
    for (const component of components) {
      if (component.budget < component.size && (!next || component.budget < next.budget)) next = component;
    }
    if (!next) break;
    next.budget++;
    remaining--;
  }
  for (const component of components) component.part = truncateUtf8(component.value, component.budget);
  remaining = budget - Math.max(0, components.length - 1) - components.reduce((total, component) => total + byteLength(component.part), 0);
  for (const component of components) {
    if (remaining <= 0) break;
    const previousBytes = byteLength(component.part);
    const expanded = truncateUtf8(component.value, previousBytes + remaining);
    remaining -= byteLength(expanded) - previousBytes;
    component.part = expanded;
  }
  return components;
}

export function buildPaperFilename(metadata = {}, fields = DEFAULT_NAMING_FIELDS, { extension = '.pdf', maxBytes = 200 } = {}) {
  const selected = normalizeNamingFields(fields);
  if (typeof extension !== 'string' || extension.toLowerCase() !== '.pdf') throw new TypeError('Only the .pdf extension is supported.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 5) throw new RangeError('maxBytes must be an integer of at least 5.');
  const missingFields = [];
  const available = [];
  for (const field of selected) {
    const descriptor = metadata && typeof metadata === 'object' ? Object.getOwnPropertyDescriptor(metadata, field) : undefined;
    const value = sanitize(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined);
    if (value) available.push({ field, value });
    else missingFields.push(field);
  }
  const components = allocateComponents(available, Math.min(maxBytes, 255) - 4);
  const usedFields = components.map(component => component.field);
  let stem = components.map(component => component.part).join('_');
  if (deviceName(stem)) stem = `_${truncateUtf8(stem, Math.min(maxBytes, 255) - 5)}`;
  if (!stem || stem === '_') return { filename: null, missingFields, usedFields: [] };
  return { filename: `${stem}.pdf`, missingFields, usedFields };
}
