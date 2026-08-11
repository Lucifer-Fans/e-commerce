const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Banner } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');
const { createTtlCache } = require('../utils/ttlCache');

/**
 * The hero rota is on the storefront's first paint and changes on a campaign
 * schedule, so it is held in memory between writes.
 *
 * The TTL is short here where the other near-static caches use minutes, because
 * the public filter is time-based: a slide with a `startsAt` goes live when the
 * query runs, so the cache is also the delay on a scheduled campaign appearing.
 * A minute is under the resolution anyone schedules to.
 */
const bannerCache = createTtlCache({ ttlMs: 60 * 1000 });

/** GET /banners?placement=hero — only currently-scheduled, active slides. */
exports.listBanners = asyncHandler(async (req, res) => {
  const isAdminView = req.query.adminView === 'true' && req.user?.role === 'admin';
  const placement = req.query.placement || null;

  // The admin's banner manager reads back its own writes, so it queries directly.
  if (isAdminView) {
    const banners = await Banner.find(placement ? { placement } : {})
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();
    return sendSuccess(res, { message: 'Banners fetched', data: { banners } });
  }

  const banners = await bannerCache.resolve(placement || '*', () => fetchLive(placement));

  return sendSuccess(res, { message: 'Banners fetched', data: { banners } });
});

/** Active slides whose schedule window contains "now", serialised for reuse. */
async function fetchLive(placement) {
  const now = new Date();
  const filter = {
    isActive: true,
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  if (placement) filter.placement = placement;

  const banners = await Banner.find(filter).sort({ displayOrder: 1, createdAt: -1 }).lean();

  // Serialised once so the cached copy is plain data: `.lean()` still hands back
  // ObjectIds and Dates, and this turns them into the strings the client already
  // receives. The schema has no virtuals or `toJSON` transform, so the bytes on the
  // wire are unchanged.
  return JSON.parse(JSON.stringify(banners));
}

/** Any write invalidates every placement — the rota is small and reads are cheap. */
const clearBannerCache = () => bannerCache.clear();

/** POST /banners (admin) */
exports.createBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.create(req.body);
  clearBannerCache();
  broadcast.bannerChanged('created', banner);

  return sendSuccess(res, { statusCode: 201, message: 'Banner created', data: { banner } });
});

/** PATCH /banners/:id (admin) */
exports.updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');

  if (req.body.image?.publicId && banner.image?.publicId !== req.body.image.publicId) {
    await destroyAsset(banner.image.publicId);
  }

  Object.assign(banner, req.body);
  await banner.save();

  clearBannerCache();
  broadcast.bannerChanged('updated', banner);

  return sendSuccess(res, { message: 'Banner updated', data: { banner } });
});

/** DELETE /banners/:id (admin) */
exports.deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');

  await Promise.all([destroyAsset(banner.image?.publicId), destroyAsset(banner.mobileImage?.publicId)]);
  await banner.deleteOne();

  clearBannerCache();
  broadcast.bannerChanged('deleted', banner);

  return sendSuccess(res, { message: 'Banner deleted' });
});

/** PATCH /banners/reorder (admin)  { order: [{ id, displayOrder }] } */
exports.reorderBanners = asyncHandler(async (req, res) => {
  const updates = (req.body.order || []).map(({ id, displayOrder }) =>
    Banner.updateOne({ _id: id }, { displayOrder })
  );
  await Promise.all(updates);

  clearBannerCache();
  broadcast.bannerChanged('reordered', null);

  return sendSuccess(res, { message: 'Banner order updated' });
});
