const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Banner } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');

/** GET /banners?placement=hero — only currently-scheduled, active slides. */
exports.listBanners = asyncHandler(async (req, res) => {
  const now = new Date();
  const isAdminView = req.query.adminView === 'true' && req.user?.role === 'admin';

  const filter = isAdminView
    ? {}
    : {
        isActive: true,
        $and: [
          { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
          { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] },
        ],
      };
  if (req.query.placement) filter.placement = req.query.placement;

  const banners = await Banner.find(filter).sort({ displayOrder: 1, createdAt: -1 });

  return sendSuccess(res, { message: 'Banners fetched', data: { banners } });
});

/** POST /banners (admin) */
exports.createBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.create(req.body);
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

  broadcast.bannerChanged('updated', banner);

  return sendSuccess(res, { message: 'Banner updated', data: { banner } });
});

/** DELETE /banners/:id (admin) */
exports.deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');

  await Promise.all([destroyAsset(banner.image?.publicId), destroyAsset(banner.mobileImage?.publicId)]);
  await banner.deleteOne();

  broadcast.bannerChanged('deleted', banner);

  return sendSuccess(res, { message: 'Banner deleted' });
});

/** PATCH /banners/reorder (admin)  { order: [{ id, displayOrder }] } */
exports.reorderBanners = asyncHandler(async (req, res) => {
  const updates = (req.body.order || []).map(({ id, displayOrder }) =>
    Banner.updateOne({ _id: id }, { displayOrder })
  );
  await Promise.all(updates);

  broadcast.bannerChanged('reordered', null);

  return sendSuccess(res, { message: 'Banner order updated' });
});
