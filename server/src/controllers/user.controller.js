const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const env = require('../config/env');
const { User, Order } = require('../models');
const { uploadBuffer, destroyAsset } = require('../config/cloudinary');
const sessionService = require('../services/session.service');
const broadcast = require('../realtime/broadcast');

/* ---------------- Self service ---------------- */

/** PATCH /users/me — the avatar has its own routes so no raw image URL is trusted here. */
exports.updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone'];
  const payload = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => allowed.includes(key))
  );

  const user = await User.findByIdAndUpdate(req.user._id, payload, {
    new: true,
    runValidators: true,
  });

  broadcast.profileUpdated(user._id, user);
  broadcast.userChanged('updated', user);

  return sendSuccess(res, { message: 'Profile updated', data: { user } });
});

/**
 * PATCH /users/me/language — its own route because it is written on a click, not a
 * form submit, and must not drag the rest of the profile payload along with it.
 */
exports.updateLanguage = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      // Stored as `preferredLanguage` — see the note on the schema field.
      $set: { preferredLanguage: req.body.language },
      // Accounts touched before that rename carry a stray top-level `language`.
      // It is inert now, but it is the field MongoDB reserves for text search, so
      // clear it as each user passes through rather than leaving a live landmine.
      $unset: { language: '' },
    },
    { new: true, runValidators: true }
  );

  // Other tabs and devices on this account follow along without a refresh.
  broadcast.profileUpdated(user._id, user);

  return sendSuccess(res, { message: 'Language preference saved', data: { user } });
});

/** POST /users/me/avatar  (field: image) */
exports.updateAvatar = asyncHandler(async (req, res) => {
  if (!env.cloudinaryEnabled) {
    throw ApiError.serviceUnavailable(
      'Image uploads are not configured. Add your Cloudinary credentials to the server .env file.'
    );
  }
  if (!req.file) throw ApiError.badRequest('No image received');

  const previousPublicId = req.user.avatar?.publicId;

  const image = await uploadBuffer(req.file.buffer, {
    folder: `${env.cloudinary.folder}/avatars`,
  });

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatar: { url: image.url, publicId: image.publicId, source: 'upload' } },
    { new: true, runValidators: true }
  );

  // Only after the new photo is safely stored — a failed upload must leave the old one intact.
  // A Google-hosted picture has no publicId, so nothing is destroyed when replacing one.
  if (previousPublicId && previousPublicId !== image.publicId) await destroyAsset(previousPublicId);

  broadcast.profileUpdated(user._id, user);

  return sendSuccess(res, { message: 'Profile photo updated', data: { user } });
});

/** DELETE /users/me/avatar — falls back to the initial-letter avatar. */
exports.removeAvatar = asyncHandler(async (req, res) => {
  const publicId = req.user.avatar?.publicId;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { avatar: 1 } },
    { new: true }
  );

  if (publicId) await destroyAsset(publicId);

  broadcast.profileUpdated(user._id, user);

  return sendSuccess(res, { message: 'Profile photo removed', data: { user } });
});

/** DELETE /users/me — soft delete; order history must survive for accounting. */
exports.deactivateAccount = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, { status: 'blocked' }, { new: true });

  // Every device, not just this one — a deactivated account must not stay usable
  // on the phone the user last had it open on.
  await sessionService.revokeAllForUser(req.user._id, { reason: 'account-blocked' });
  broadcast.sessionRevoked(req.user._id, { reason: 'account-blocked' });

  res.clearCookie('refreshToken');

  if (user) broadcast.userChanged('status', user);

  return sendSuccess(res, { message: 'Account deactivated' });
});

/* ---------------- Admin ---------------- */

/** GET /users (admin) */
exports.listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 15);

  const filter = {};
  if (req.query.role && req.query.role !== 'all') filter.role = req.query.role;
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.search) {
    const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  // Order counts make the list far more useful than raw registrations.
  const stats = await Order.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', orderCount: { $sum: 1 }, totalSpent: { $sum: '$pricing.total' } } },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));

  return sendSuccess(res, {
    message: 'Users fetched',
    data: {
      users: users.map((u) => ({
        ...u,
        orderCount: byUser.get(String(u._id))?.orderCount || 0,
        totalSpent: Math.round((byUser.get(String(u._id))?.totalSpent || 0) * 100) / 100,
      })),
    },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** GET /users/:id (admin) */
exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound('User not found');

  const orders = await Order.find({ user: user._id })
    .select('orderNumber pricing.total orderStatus paymentStatus createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return sendSuccess(res, { message: 'User fetched', data: { user, recentOrders: orders } });
});

/** PATCH /users/:id/status (admin) */
exports.updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own status');
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!user) throw ApiError.notFound('User not found');

  if (status === 'blocked') {
    await sessionService.revokeAllForUser(user._id, { reason: 'account-blocked' });
    broadcast.sessionRevoked(user._id, { reason: 'account-blocked' });
  }

  broadcast.userChanged('status', user);
  // Tell the affected session immediately instead of waiting for its next 401.
  broadcast.accountStatusChanged(user);

  return sendSuccess(res, { message: `User ${status}`, data: { user } });
});

/** PATCH /users/:id/role (admin) */
exports.updateUserRole = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own role');
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role: req.body.role },
    { new: true, runValidators: true }
  );
  if (!user) throw ApiError.notFound('User not found');

  broadcast.userChanged('role', user);
  broadcast.accountStatusChanged(user);

  return sendSuccess(res, { message: `Role updated to ${req.body.role}`, data: { user } });
});
