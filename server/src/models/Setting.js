const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: '' },
    publicId: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Organization settings — a single document the admin panel owns end to end.
 *
 * Everything the storefront needs to identify the business (name, contact, logo,
 * favicon, meta tags, social profiles) lives here instead of in .env or hardcoded
 * strings, so a non-developer can change it without a redeploy.
 *
 * `fieldHistory` maps a leaf path ("general.siteName") to the moment it last
 * changed, which is what the panel prints beside each input.
 */
const settingSchema = new mongoose.Schema(
  {
    // Guard rail: one document, always. The unique key makes a second one impossible.
    key: { type: String, default: 'store', unique: true, immutable: true },

    general: {
      siteName: { type: String, trim: true, maxlength: 80, default: '' },
      contactEmail: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
      contactNumber: { type: String, trim: true, maxlength: 24, default: '' },
      companyAddress: { type: String, trim: true, maxlength: 300, default: '' },
      // Google Maps "Embed a map" src. Long by nature — the pb= payload encodes the
      // exact camera position, so it is stored verbatim rather than rebuilt from the address.
      mapEmbedUrl: { type: String, trim: true, maxlength: 2000, default: '' },
    },

    seo: {
      metaTitle: { type: String, trim: true, maxlength: 70, default: '' },
      metaDescription: { type: String, trim: true, maxlength: 200, default: '' },
      metaKeywords: { type: [String], default: [] },
    },

    branding: {
      logo: { type: assetSchema, default: () => ({}) },
      favicon: { type: assetSchema, default: () => ({}) },
    },

    // Rendered as the careers page's "Contact HR" card. Edited from Inquiries →
    // Careers rather than the Organization screen, since HR owns it, not marketing.
    careers: {
      hrEmail: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
      hrPhone: { type: String, trim: true, maxlength: 24, default: '' },
    },

    social: {
      instagram: { type: String, trim: true, maxlength: 200, default: '' },
      twitter: { type: String, trim: true, maxlength: 200, default: '' },
      whatsapp: { type: String, trim: true, maxlength: 200, default: '' },
      facebook: { type: String, trim: true, maxlength: 200, default: '' },
      linkedin: { type: String, trim: true, maxlength: 200, default: '' },
    },

    /**
     * One-time bookkeeping the panel never shows. A default list is planted on
     * first use; the flag is what stops it growing back after an admin has
     * deliberately emptied it.
     */
    seeded: {
      cancellationReasons: { type: Boolean, default: false },
    },

    fieldHistory: { type: Map, of: Date, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    minimize: false,
    // Pinned explicitly: a plain "settings" collection is a magnet for collisions when
    // several projects share one database, and the default MONGO_URI has no db name.
    collection: 'store_settings',

    // Mongo map keys cannot contain a dot, so history is stored as "general:siteName"
    // and handed to the clients as the dotted path they actually work with.
    toJSON: {
      transform(_doc, ret) {
        if (ret.fieldHistory) {
          ret.fieldHistory = Object.fromEntries(
            Object.entries(ret.fieldHistory).map(([key, value]) => [key.replace(/:/g, '.'), value])
          );
        }
        return ret;
      },
    },
  }
);

/** Path <-> map-key translation, kept next to the field it serves. */
settingSchema.statics.historyKey = (path) => path.replace(/\./g, ':');

/** Every leaf the admin panel can edit — also the whitelist the controller applies. */
settingSchema.statics.EDITABLE_PATHS = [
  'general.siteName',
  'general.contactEmail',
  'general.contactNumber',
  'general.companyAddress',
  'general.mapEmbedUrl',
  'seo.metaTitle',
  'seo.metaDescription',
  'seo.metaKeywords',
  'branding.logo',
  'branding.favicon',
  'social.instagram',
  'social.twitter',
  'social.whatsapp',
  'social.facebook',
  'social.linkedin',
];

/** Fetches the singleton, creating it on first call so the panel never 404s. */
settingSchema.statics.getSingleton = async function getSingleton() {
  const existing = await this.findOne({ key: 'store' });
  if (existing) return existing;

  try {
    return await this.create({ key: 'store' });
  } catch (err) {
    // Two first-ever requests can race; the unique index picks one winner.
    if (err.code === 11000) return this.findOne({ key: 'store' });
    throw err;
  }
};

module.exports = mongoose.model('Setting', settingSchema);
