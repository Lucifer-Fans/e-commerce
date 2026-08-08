const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { Setting } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');
const mailService = require('../services/mail.service');
const { DEFAULT_LANGUAGE } = require('../config/languages');

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
  const settings = await Setting.getSingleton();

  // The admin panel edits the source, so it keeps the raw `translations` map; every
  // other caller gets the leaves already resolved to their language.
  const payload =
    req.user?.role === 'admin' ? settings.toJSON() : localizeSettings(settings, req.language);

  return sendSuccess(res, { message: 'Settings fetched', data: { settings: payload } });
});

/**
 * Overlays `translations[lang]` onto the settings leaves that carry prose.
 *
 * Unlike the catalogue documents this shape is nested and fixed, so the whitelist in
 * the model is walked directly rather than going through the generic `localize`.
 * A blank translation falls through to the English, same as everywhere else.
 */
function localizeSettings(settings, lang) {
  const json = settings.toJSON();
  const raw = json.translations;
  const patch = raw instanceof Map ? raw.get(lang) : raw?.[lang];

  delete json.translations;
  if (!patch || !lang || lang === DEFAULT_LANGUAGE) return json;

  for (const [key, path] of Object.entries(Setting.TRANSLATABLE_PATHS)) {
    const value = patch[key];
    if (typeof value === 'string' && value.trim()) writePath(json, path, value);
  }
  return json;
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

  // Translations arrive as a whole map (the panel always sends every language it has),
  // so it is replaced rather than merged — that is how a language gets cleared.
  if (req.body.translations !== undefined) {
    settings.translations = req.body.translations || undefined;
  }

  settings.updatedBy = req.user._id;
  await settings.save();

  await Promise.all(orphanedAssets.map((publicId) => destroyAsset(publicId).catch(() => {})));

  // Emails carry the same name, support address and socials — drop the cached copy.
  mailService.clearBrandingCache();

  // Storefronts re-title themselves and swap logo/favicon without a reload. The
  // per-language map is stripped: a socket payload has no one language to resolve to,
  // and the refetch that follows a language change picks up the right copy anyway.
  const { translations: _t, ...broadcastable } = settings.toJSON();
  broadcast.settingsUpdated(broadcastable);

  return sendSuccess(res, { message: 'Settings saved', data: { settings } });
});
