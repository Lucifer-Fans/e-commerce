const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { Setting } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');
const mailService = require('../services/mail.service');
const seoService = require('../services/seo.service');
const { createTtlCache } = require('../utils/ttlCache');

/**
 * Every cold storefront load reads the store settings to render its title, logo and
 * footer, and an admin changes them a few times a month — so the singleton is held
 * in memory and dropped explicitly by the save below.
 */
const settingsCache = createTtlCache({ ttlMs: 5 * 60 * 1000 });

/** "general.siteName" -> the value held at that path. */
const readPath = (source, path) =>
  path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), source);

const writePath = (target, path, value) => {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => {
    if (node[key] == null) node[key] = {};
    return node[key];
  }, target);
  parent[last] = value;
};

/** Keywords arrive as an array or as the comma-separated string the panel shows. */
const normaliseKeywords = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((keyword) => String(keyword).trim())
    .filter(Boolean)
    .slice(0, 30);

/** Admins paste either the src or the entire <iframe …> snippet — store the src either way. */
const normaliseMapEmbed = (value) => {
  const raw = String(value ?? '').trim();
  const fromIframe = raw.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return (fromIframe ? fromIframe[1] : raw).trim();
};

const normaliseAsset = (value) => ({
  url: value?.url?.trim() || '',
  publicId: value?.publicId?.trim() || '',
});

/** Compares only what the UI can change, so timestamps stay meaningful. */
function isSameValue(path, before, after) {
  if (path === 'seo.metaKeywords') {
    const a = before || [];
    return a.length === after.length && a.every((keyword, i) => keyword === after[i]);
  }
  if (path.startsWith('branding.')) {
    return (before?.url || '') === after.url && (before?.publicId || '') === after.publicId;
  }
  return (before ?? '') === after;
}

/**
 * GET /settings — public.
 * The storefront reads this for its title, meta tags, logo, favicon and footer links,
 * so it stays open; nothing here is sensitive.
 */
exports.getSettings = asyncHandler(async (req, res) => {
  // The admin panel edits the source, so it reads straight through — a save is
  // visible on the next refresh. Every other caller is served the cached copy.
  if (req.user?.role === 'admin') {
    const settings = await Setting.getSingleton();
    return sendSuccess(res, { message: 'Settings fetched', data: { settings: settings.toJSON() } });
  }

  const json = await settingsCache.resolve('store', loadSettingsJson);

  return sendSuccess(res, { message: 'Settings fetched', data: { settings: json } });
});

/**
 * The cached shape is the *serialised* document, not the hydrated one.
 *
 * Round-tripping through JSON is what makes it safe to hand the same object to
 * concurrent requests: Maps flatten, ObjectIds and Dates become the strings the
 * client already receives, and nothing left in the tree holds a reference back
 * into Mongoose. The result is byte-identical to what `res.json` produced before.
 */
async function loadSettingsJson() {
  const settings = await Setting.getSingleton();
  return JSON.parse(JSON.stringify(settings.toJSON()));
}

/**
 * PATCH /settings (admin) — partial update.
 * Only whitelisted paths are applied; each changed leaf gets a fresh timestamp and
 * a replaced logo/favicon is released from Cloudinary.
 */
exports.updateSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.getSingleton();
  const now = new Date();
  const orphanedAssets = [];

  for (const path of Setting.EDITABLE_PATHS) {
    const incoming = readPath(req.body, path);
    if (incoming === undefined) continue; // untouched by this request

    let next;
    if (path === 'seo.metaKeywords') next = normaliseKeywords(incoming);
    else if (path === 'general.mapEmbedUrl') next = normaliseMapEmbed(incoming);
    else if (path.startsWith('branding.')) next = normaliseAsset(incoming);
    else next = typeof incoming === 'string' ? incoming.trim() : incoming;

    const current = readPath(settings, path);
    if (isSameValue(path, current, next)) continue;

    // The old asset is referenced by nothing else once the new URL is saved.
    if (path.startsWith('branding.') && current?.publicId && current.publicId !== next.publicId) {
      orphanedAssets.push(current.publicId);
    }

    writePath(settings, path, next);
    settings.fieldHistory.set(Setting.historyKey(path), now);
  }

  settings.updatedBy = req.user._id;
  await settings.save();

  await Promise.all(orphanedAssets.map((publicId) => destroyAsset(publicId).catch(() => {})));

  // Every cached view of this document is now wrong. Cleared before the broadcast so
  // a storefront that refetches on the socket event cannot race the stale copy.
  settingsCache.clear();

  // Emails carry the same name, support address and socials — drop the cached copy.
  mailService.clearBrandingCache();

  // Server-rendered meta tags read the same document; without this an admin who
  // fixes the meta title would still see the old one in a link preview for a minute.
  seoService.clearSettingsCache();

  // Storefronts re-title themselves and swap logo/favicon without a reload.
  broadcast.settingsUpdated(settings.toJSON());

  return sendSuccess(res, { message: 'Settings saved', data: { settings } });
});
