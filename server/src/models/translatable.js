const mongoose = require('mongoose');
const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = require('../config/languages');

/**
 * Per-language overrides for admin-authored catalogue copy.
 *
 * Shape on the document:
 *
 *   translations: {
 *     hi: { name: '…', description: '…' },
 *     ta: { name: '…' },            // partial is fine
 *   }
 *
 * The base fields (`name`, `description`, …) stay exactly where they are and remain
 * the English source of truth. A translation *overlays* them field by field, so a
 * half-finished language shows its translated fields and the English original for
 * the rest — never a blank product name.
 *
 * Why a Map rather than `name_hi`, `name_ta`, … columns: adding a language must not
 * touch the schema, and this keeps every index, validator and query on the base
 * fields working untouched.
 *
 * Deliberately NOT translatable, because these are matched on, not read:
 *   • `slug`      — lives in URLs
 *   • `sku`       — identifier
 *   • `brand`     — a plain string on Product that filters and order snapshots join
 *                   on; translating it would silently break brand filtering
 *   • `tags`      — feeds the text index
 *   • attribute/value `slug` — how a variant selection is matched
 */
const translationsField = (fieldsSchema) => ({
  type: Map,
  of: new mongoose.Schema(fieldsSchema, { _id: false }),
  default: undefined,
  validate: {
    validator(map) {
      if (!map) return true;
      return [...map.keys()].every(
        (code) => SUPPORTED_LANGUAGES.includes(code) && code !== DEFAULT_LANGUAGE
      );
    },
    // English is the base document, so storing an `en` override would create two
    // competing sources of truth for the same string.
    message: 'Translations must be keyed by a supported language code other than English',
  },
});

/** Spec row / FAQ / highlight shapes, reused by the Product translation schema. */
const featurePair = { key: { type: String, trim: true }, value: { type: String, trim: true } };
const faqPair = { question: { type: String, trim: true }, answer: { type: String, trim: true } };

module.exports = { translationsField, featurePair, faqPair };
