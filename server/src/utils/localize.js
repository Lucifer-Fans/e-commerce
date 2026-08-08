const { DEFAULT_LANGUAGE } = require('../config/languages');

/**
 * Overlays a document's `translations[lang]` onto the document itself, so every
 * consumer downstream — controllers, serializers, the client — keeps reading plain
 * `name` / `description` fields and never has to know translations exist.
 *
 * The overlay is per *field*, not per document: a translation that fills in `name`
 * but not `description` yields a translated name and the English description. A
 * half-finished language therefore degrades gracefully instead of blanking copy.
 *
 * Arrays overlay positionally and element-wise (`features[2].value` alone can be
 * translated), except `variantAttributes`, which is matched by slug because the
 * admin can reorder axes.
 */

/** Empty string and null mean "not translated"; 0 and false are legitimate values. */
const isFilled = (value) =>
  value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

const overlayPlain = (base, patch) => {
  if (!patch || typeof patch !== 'object') return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isFilled(value)) out[key] = value;
  }
  return out;
};

/** Element-wise overlay that keeps the base array's length and order. */
const overlayList = (baseList = [], patchList) => {
  if (!Array.isArray(patchList) || !patchList.length) return baseList;
  return baseList.map((item, i) => {
    const patch = patchList[i];
    if (!isFilled(patch)) return item;
    return typeof item === 'object' && item !== null ? overlayPlain(item, patch) : patch;
  });
};

/** Variant axes are matched by slug — the admin may reorder them between edits. */
const overlayVariantAttributes = (baseAttrs = [], patchAttrs) => {
  if (!Array.isArray(patchAttrs) || !patchAttrs.length) return baseAttrs;
  const bySlug = new Map(patchAttrs.filter((a) => a?.slug).map((a) => [a.slug, a]));

  return baseAttrs.map((attr) => {
    const patch = bySlug.get(attr.slug);
    if (!patch) return attr;

    const valuePatch = new Map((patch.values || []).filter((v) => v?.slug).map((v) => [v.slug, v]));

    return {
      ...attr,
      ...(isFilled(patch.name) ? { name: patch.name } : {}),
      ...(isFilled(patch.helpText) ? { helpText: patch.helpText } : {}),
      values: (attr.values || []).map((value) => {
        const label = valuePatch.get(value.slug)?.label;
        return isFilled(label) ? { ...value, label } : value;
      }),
    };
  });
};

const LIST_FIELDS = new Set(['highlights', 'features', 'faqs']);

/**
 * @param {object} doc   a lean document (call .toJSON()/.lean() first)
 * @param {string} lang  target language code
 * @returns {object} the document with translated copy applied and `translations` stripped
 */
function localize(doc, lang) {
  if (!doc || typeof doc !== 'object') return doc;

  // Mongoose Maps survive .lean() as plain objects but as real Maps off a hydrated doc.
  const raw = doc.translations;
  const patch = raw instanceof Map ? raw.get(lang) : raw?.[lang];

  // Always drop `translations` from the response: it can be many times the size of
  // the document itself, and the storefront has no use for the other languages.
  const { translations: _translations, ...rest } = doc;

  if (!lang || lang === DEFAULT_LANGUAGE || !patch) return rest;
  const plain = patch instanceof Map ? Object.fromEntries(patch) : patch;

  const out = { ...rest };
  for (const [key, value] of Object.entries(plain)) {
    if (key === 'variantAttributes') {
      out.variantAttributes = overlayVariantAttributes(rest.variantAttributes, value);
    } else if (LIST_FIELDS.has(key)) {
      out[key] = overlayList(rest[key], value);
    } else if (key === 'meta') {
      out.meta = overlayPlain(rest.meta || {}, value);
    } else if (isFilled(value)) {
      out[key] = value;
    }
  }
  return out;
}

/** Same, for a list — and for the populated `category` / `subCategory` on a product. */
const localizeAll = (docs, lang) => (Array.isArray(docs) ? docs.map((d) => localize(d, lang)) : docs);

/**
 * A product carries populated taxonomy that needs translating too, and its
 * category name is rendered on the card, the breadcrumb and the details table.
 */
function localizeProduct(product, lang) {
  if (!product) return product;
  const out = localize(product, lang);
  if (out.category && typeof out.category === 'object') out.category = localize(out.category, lang);
  if (out.subCategory && typeof out.subCategory === 'object') {
    out.subCategory = localize(out.subCategory, lang);
  }
  return out;
}

const localizeProducts = (products, lang) =>
  Array.isArray(products) ? products.map((p) => localizeProduct(p, lang)) : products;

module.exports = { localize, localizeAll, localizeProduct, localizeProducts };
