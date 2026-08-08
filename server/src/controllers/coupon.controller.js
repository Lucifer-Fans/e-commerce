const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const { Coupon } = require('../models');
const broadcast = require('../realtime/broadcast');

/** GET /coupons/available — publicly advertisable coupons for the cart page. */
exports.listAvailable = asyncHandler(async (_req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gte: now },
  })
    .select('code description discountType discountValue maxDiscountAmount minOrderAmount expiresAt')
    .sort({ discountValue: -1 })
    .limit(10)
    .lean();

  return sendSuccess(res, { message: 'Coupons fetched', data: { coupons } });
});

/** GET /coupons (admin) */
exports.listCoupons = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);

  const filter = {};
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.search) filter.code = new RegExp(String(req.query.search).toUpperCase(), 'i');

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Coupon.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: 'Coupons fetched',
    data: { coupons },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** POST /coupons (admin) */
exports.createCoupon = asyncHandler(async (req, res) => {
  const payload = { ...req.body, code: String(req.body.code).toUpperCase().trim() };

  if (payload.discountType === 'percentage' && payload.discountValue > 90) {
    throw ApiError.badRequest('Percentage discount cannot exceed 90%');
  }
  if (await Coupon.exists({ code: payload.code })) {
    throw ApiError.conflict('A coupon with this code already exists');
  }

  const coupon = await Coupon.create(payload);
  broadcast.couponChanged('created', coupon);

  return sendSuccess(res, { statusCode: 201, message: 'Coupon created', data: { coupon } });
});

/** PATCH /coupons/:id (admin) */
exports.updateCoupon = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  delete payload.usedCount; // usage history is never editable
  delete payload.usedBy;
  if (payload.code) payload.code = String(payload.code).toUpperCase().trim();

  const coupon = await Coupon.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });
  if (!coupon) throw ApiError.notFound('Coupon not found');

  broadcast.couponChanged('updated', coupon);

  return sendSuccess(res, { message: 'Coupon updated', data: { coupon } });
});

/** DELETE /coupons/:id (admin) */
exports.deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');

  broadcast.couponChanged('deleted', coupon);

  return sendSuccess(res, { message: 'Coupon deleted' });
});
