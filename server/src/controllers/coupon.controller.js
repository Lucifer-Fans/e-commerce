const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const { Coupon } = require('../models');
const broadcast = require('../realtime/broadcast');

/**
 * Blank means unlimited/uncapped, never zero. The schema setters enforce this on
 * the way into the database; doing it here too keeps the conflict and range
 * checks below reading the same value the document will end up holding.
 */
const optional = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The catalogue this coupon is pinned to. The form reads populated documents
 * back and sends ids, so this tolerates both and stores ids, de-duplicated.
 * An empty list is the default and means "the whole cart", never "nothing".
 */
const toIdList = (value) =>
  Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry?._id || entry)).filter(Boolean))]
    : [];

/** Only the keys that were sent are touched, so a partial PATCH keeps the rest. */
function normaliseAppliesTo(body, current) {
  if (body.appliesTo === undefined) return undefined;
  const sent = body.appliesTo || {};
  return {
    categories:
      sent.categories === undefined ? toIdList(current?.appliesTo?.categories) : toIdList(sent.categories),
    products:
      sent.products === undefined ? toIdList(current?.appliesTo?.products) : toIdList(sent.products),
  };
}

/** Names for the fields the storefront and the admin table read back. */
const SCOPE_POPULATE = [
  { path: 'appliesTo.categories', select: 'name slug' },
  { path: 'appliesTo.products', select: 'name slug' },
];

/**
 * Shared by create and update so an edit can never bypass a create-time rule.
 * `current` is the stored coupon on a PATCH: a partial update that sends only
 * `discountValue` still has to be judged against the type already on record.
 */
function normalisePayload(body, current = null) {
  const payload = { ...body };

  if (payload.code !== undefined) payload.code = String(payload.code).toUpperCase().trim();
  if (payload.usageLimit !== undefined) payload.usageLimit = optional(payload.usageLimit);
  if (payload.perUserLimit !== undefined) payload.perUserLimit = optional(payload.perUserLimit);
  if (payload.maxDiscountAmount !== undefined) {
    payload.maxDiscountAmount = optional(payload.maxDiscountAmount);
  }

  const discountType = payload.discountType || current?.discountType || 'percentage';

  // A cap is a percentage-coupon device. Carrying one on a flat coupon is what
  // turned "flat ₹500 off" into ₹0 off.
  if (discountType === 'flat') payload.maxDiscountAmount = null;

  const appliesTo = normaliseAppliesTo(payload, current);
  if (appliesTo) payload.appliesTo = appliesTo;

  if (discountType === 'percentage' && Number(payload.discountValue ?? current?.discountValue) > 90) {
    throw ApiError.badRequest('Percentage discount cannot exceed 90%');
  }

  return payload;
}

/** GET /coupons/available — publicly advertisable coupons for the cart page. */
exports.listAvailable = asyncHandler(async (_req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gte: now },
    // Never advertise a code that has already been claimed to its global limit.
    ...Coupon.hasSlotFilter(),
  })
    .select('code description discountType discountValue maxDiscountAmount minOrderAmount expiresAt appliesTo')
    .populate(SCOPE_POPULATE)
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
    Coupon.find(filter)
      .populate(SCOPE_POPULATE)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
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
  const payload = normalisePayload(req.body);

  if (await Coupon.exists({ code: payload.code })) {
    throw ApiError.conflict('A coupon with this code already exists');
  }

  const coupon = await Coupon.create(payload);
  await coupon.populate(SCOPE_POPULATE);
  broadcast.couponChanged('created', coupon);

  return sendSuccess(res, { statusCode: 201, message: 'Coupon created', data: { coupon } });
});

/** PATCH /coupons/:id (admin) */
exports.updateCoupon = asyncHandler(async (req, res) => {
  const current = await Coupon.findById(req.params.id);
  if (!current) throw ApiError.notFound('Coupon not found');

  const payload = normalisePayload(req.body, current);
  delete payload.usedCount; // usage history is never editable
  delete payload.usedBy;

  if (payload.code && (await Coupon.exists({ code: payload.code, _id: { $ne: current._id } }))) {
    throw ApiError.conflict('A coupon with this code already exists');
  }

  const coupon = await Coupon.findByIdAndUpdate(current._id, payload, {
    new: true,
    runValidators: true,
  }).populate(SCOPE_POPULATE);

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
