const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const env = require('../config/env');
const {
  User,
  Order,
  DeactivationReason,
  ReactivationRequest,
  Cart,
  Wishlist,
} = require('../models');
const { uploadBuffer, destroyAsset } = require('../config/cloudinary');
const sessionService = require('../services/session.service');
const mailService = require('../services/mail.service');
const audit = require('../services/accountAudit.service');
const broadcast = require('../realtime/broadcast');
const logger = require('../utils/logger');
const { isSelfDeactivated } = require('../utils/accountStatus');
const { OPEN_STATUSES } = require('../models/Order');

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

/* ------------------------------------------------------------------ *
 * Deactivation — closing your own account
 *
 * Three steps, in this order: say why, prove it is you, and only then
 * is anything written. The reason is collected first because it is the
 * only part a shopper who changes their mind can abandon for free; the
 * code is second because it is the point of no return, and no code is
 * ever minted for a request that has not already named its reason.
 * ------------------------------------------------------------------ */

/**
 * The message an account with orders still on their way is turned away with.
 * One sentence, one place, because three routes say it: the pre-flight check the
 * dialog runs, and both steps of the flow itself.
 */
const OPEN_ORDERS_MESSAGE =
  'You have pending orders that are still in progress. Please wait until your orders are ' +
  'delivered or cancelled before deactivating your account.';

/**
 * The caller's orders that are still going somewhere.
 *
 * Deactivation revokes every session and closes the account to sign-in, which
 * would leave a shopper unable to track a parcel that is genuinely on its way,
 * unable to cancel it, and unable to read the delivery updates we keep sending —
 * while we still owe them goods or money. So the gate is not about tidiness: it
 * is about not letting someone lock themselves out of an obligation we have not
 * finished meeting.
 *
 * `delivered`, `cancelled` and `returned` all pass. Everything before delivery
 * blocks, which is exactly the set an order can still be cancelled from.
 *
 * Returned lean and trimmed to what a dialog lists — the shopper is being shown
 * *which* orders are in the way so the message is actionable rather than a flat
 * refusal.
 */
const openOrdersFor = (userId) =>
  Order.find({ user: userId, orderStatus: { $in: OPEN_STATUSES } })
    .select('orderNumber orderStatus pricing.total createdAt')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

/** Throws the shared refusal when anything is still open. */
async function requireNoOpenOrders(user, req) {
  const openOrders = await openOrdersFor(user._id);
  if (!openOrders.length) return;

  await audit.record(user, 'deactivation-blocked', {
    actor: 'system',
    req,
    summary: `Deactivation refused — ${openOrders.length} order(s) still in progress`,
    meta: { orderNumbers: openOrders.map((order) => order.orderNumber) },
  });

  throw new ApiError(409, OPEN_ORDERS_MESSAGE, {
    code: 'PENDING_ORDERS',
    details: {
      openOrders: openOrders.map((order) => ({
        _id: String(order._id),
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        total: order.pricing?.total,
        createdAt: order.createdAt,
      })),
    },
  });
}

/**
 * GET /users/me/deactivate/eligibility
 *
 * Read-only, and the reason the shopper meets this rule before the first dialog
 * rather than after choosing a reason and waiting for a code. Answering "no" three
 * screens into a flow is the kind of thing that reads as a bug; answering it on
 * the click that starts the flow reads as an explanation.
 *
 * It never throws for an ineligible account — "you cannot do this yet" is the
 * successful answer to this question, and the flow's own routes are what refuse.
 */
exports.deactivationEligibility = asyncHandler(async (req, res) => {
  const openOrders = await openOrdersFor(req.user._id);

  return sendSuccess(res, {
    message: openOrders.length ? OPEN_ORDERS_MESSAGE : 'Account can be deactivated',
    data: {
      eligible: openOrders.length === 0,
      reason: openOrders.length ? 'PENDING_ORDERS' : null,
      openOrders: openOrders.map((order) => ({
        _id: String(order._id),
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        total: order.pricing?.total,
        createdAt: order.createdAt,
      })),
    },
  });
});

/**
 * Resolves whichever half of the picklist arrived into the text that will be
 * stored, or throws.
 *
 * A published row is re-read rather than trusted from the payload for the same
 * reason the order cancel dialog re-reads its own: a reason retired this morning
 * must not still be selectable from a tab left open since yesterday, and a client
 * could otherwise post any label it liked into a field an admin later reports on.
 */
async function resolveDeactivationReason({ reasonId, reason }) {
  if (reasonId) {
    const row = await DeactivationReason.findOne({ _id: reasonId, isActive: true }).lean();
    if (!row) {
      throw ApiError.badRequest('That reason is no longer available — please choose another.');
    }
    return { reason: row.label, reasonId: row._id, isOther: false };
  }

  return { reason: String(reason).trim(), reasonId: undefined, isOther: true };
}

/**
 * POST /users/me/deactivate/request — the reason, and the code it earns.
 *
 * The reason is written to `deactivation.pending` rather than handed back to the
 * client to return with the code. That is what stops the confirming request
 * substituting a different reason for the one this step recorded — the code and
 * the reason have to describe the same decision, and only the server can
 * guarantee they do.
 */
exports.requestDeactivation = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+otp.codeHash');

  /**
   * An admin closing their own account would leave the panel with one fewer way
   * in and no way to undo it from inside — reactivation needs an approver, and
   * the last admin has nobody to approve them. Staff hand the role over first.
   */
  if (user.role === 'admin') {
    throw ApiError.forbidden(
      'Admin accounts cannot be deactivated from here. Ask another administrator to change ' +
        'your role first.'
    );
  }

  /**
   * Checked before the reason is stored and before a code is minted, so a shopper
   * who cannot deactivate is never sent an email telling them how to.
   */
  await requireNoOpenOrders(user, req);

  const chosen = await resolveDeactivationReason(req.body);

  // The resend budget is only spent by an actual resend; opening the dialog again
  // after abandoning it starts the count fresh, which is what the cooldown is for.
  const resending = user.otp?.purpose === 'account-deactivation';
  if (resending) {
    const wait = user.otpResendWaitSeconds();
    if (wait > 0) {
      throw new ApiError(429, `Please wait ${wait} second(s) before asking for a new code.`, {
        code: 'OTP_COOLDOWN',
      });
    }
    if (user.otpResendsExhausted()) {
      throw new ApiError(
        429,
        'You have requested several codes already. Please try again in a little while.',
        { code: 'OTP_RESEND_LIMIT' }
      );
    }
  }

  const code = user.createEmailOtp({ resend: resending, purpose: 'account-deactivation' });
  await User.updateOne(
    { _id: user._id },
    { $set: { otp: user.otp, 'deactivation.pending': { ...chosen, at: new Date() } } }
  );

  const sent = await mailService
    .sendDeactivationOtpEmail({
      to: user.email,
      name: user.name,
      code,
      minutes: env.otp.expiryMinutes,
    })
    .catch((err) => {
      logger.error(`Could not compose deactivation code for ${user.email}: ${err.message}`);
      return false;
    });

  await audit.record(user, 'deactivation-requested', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: `Deactivation started — reason: ${chosen.reason}`,
    meta: { reason: chosen.reason, isOther: chosen.isOther },
  });
  await audit.record(user, 'deactivation-otp-sent', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: sent ? 'Confirmation code emailed' : 'Confirmation code generated but not delivered',
    meta: { delivered: Boolean(sent) },
  });

  if (!sent && env.isProd) {
    throw ApiError.serviceUnavailable(
      'We could not send your confirmation code right now. Please try again in a few minutes.'
    );
  }

  return sendSuccess(res, {
    message: `We've sent a ${env.otp.length}-digit confirmation code to ${user.email}.`,
    data: {
      email: user.email,
      codeLength: env.otp.length,
      expiresInMinutes: env.otp.expiryMinutes,
      resendAvailableInSeconds: env.otp.resendCooldownSeconds,
      reason: chosen.reason,
      // Dev convenience, exactly as the sign-up code screen has: without SMTP
      // wired up there is otherwise no way past this dialog locally.
      ...(!sent && !env.isProd ? { devOtp: code } : {}),
    },
  });
});

/**
 * POST /users/me/deactivate/confirm — the code, and the closure it performs.
 *
 * Everything irreversible happens here and nowhere else. The order matters: the
 * status is written first, so that even if the session sweep or the email fails
 * afterwards the account is genuinely closed rather than half-closed — every
 * gate reads the status, and a live session on a closed account dies on its next
 * request regardless.
 */
exports.confirmDeactivation = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+otp.codeHash');

  const pending = user.deactivation?.pending;
  if (!pending?.reason) {
    throw new ApiError(400, 'Please choose a reason for deactivating first.', {
      code: 'REASON_REQUIRED',
    });
  }

  /**
   * Re-checked here rather than trusted from step one. The code is good for ten
   * minutes, and placing an order takes less than that — a shopper who checks out
   * with the confirmation screen still open would otherwise close their account
   * over an order we have just accepted money for.
   */
  await requireNoOpenOrders(user, req);

  const result = await user.verifyEmailOtp(req.body.otp, 'account-deactivation');
  if (!result.ok) {
    await audit.record(user, 'deactivation-otp-failed', {
      actor: 'user',
      actorId: user._id,
      req,
      summary: `Deactivation code rejected (${result.reason})`,
      meta: { reason: result.reason },
    });

    if (result.reason === 'mismatch' && result.remaining > 0) {
      throw new ApiError(
        400,
        `That code is not correct. ${result.remaining} attempt(s) left before you will need a new one.`,
        { code: 'OTP_INVALID' }
      );
    }
    throw new ApiError(
      400,
      result.reason === 'expired'
        ? 'This code has expired. Request a new one and we will send it straight away.'
        : 'This code can no longer be used. Request a new one and we will send it straight away.',
      { code: result.reason === 'expired' ? 'OTP_EXPIRED' : 'OTP_UNUSABLE' }
    );
  }

  const at = new Date();
  const updated = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        status: 'deactivated',
        deactivation: {
          reason: pending.reason,
          reasonId: pending.reasonId,
          isOther: pending.isOther,
          at,
        },
      },
      // The spent code goes, and so does any half-finished reactivation from a
      // previous closure — neither describes the account as it now stands.
      $unset: { otp: 1, reactivationToken: 1, reactivationExpires: 1, reactivationRequestedAt: 1 },
    },
    { new: true }
  );

  /**
   * Every device, not just this one. A closed account must not stay usable on the
   * phone its owner last had it open on, and revoking the session rows is what
   * makes that true immediately rather than whenever a 15-minute access token
   * happens to lapse — the refresh tokens die with the rows they name.
   */
  await sessionService.revokeAllForUser(user._id, { reason: 'account-deactivated' });
  broadcast.sessionRevoked(user._id, { reason: 'account-deactivated' });

  res.clearCookie('refreshToken');

  await audit.record(updated, 'deactivation-otp-verified', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: 'Confirmation code accepted',
  });
  await audit.record(updated, 'deactivated', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: `Account deactivated — reason: ${pending.reason}`,
    meta: { reason: pending.reason, isOther: pending.isOther },
  });

  mailService
    .sendAccountDeactivatedEmail({
      to: updated.email,
      name: updated.name,
      reason: pending.reason,
      at,
    })
    .catch((err) => logger.error(`Deactivation confirmation email failed: ${err.message}`));

  broadcast.userChanged('status', updated);

  return sendSuccess(res, { message: 'Your account has been deactivated' });
});

/* ---------------- Admin ---------------- */

/** GET /users (admin) */
exports.listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 15);

  // Sign-ups that never answered their code are not accounts yet — nobody has proven
  // they own the address, and the row exists only because the code has to be stored
  // somewhere. `$ne: true` rather than `false`: every account made before OTP sign-up
  // existed, and every one made through Google, has no such field at all.
  const filter = { emailVerificationPending: { $ne: true } };
  if (req.query.role && req.query.role !== 'all') filter.role = req.query.role;
  /**
   * 'deactivated' selects both halves of that one story — closed, and closed with
   * a request in the queue. An admin filtering for deactivated accounts is asking
   * "who has left", and splitting that into two chips they have to remember to
   * tick both of would only hide half the answer.
   */
  if (req.query.status && req.query.status !== 'all') {
    filter.status =
      req.query.status === 'deactivated'
        ? { $in: ['deactivated', 'reactivation-pending'] }
        : req.query.status;
  }
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
  // Same rule as the list it is opened from: an id that only exists because a
  // sign-up is half-finished must not resolve to a profile page.
  const user = await User.findOne({
    _id: req.params.id,
    emailVerificationPending: { $ne: true },
  }).lean();
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
  const { status, blockedReason } = req.body;

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own status');
  }

  /**
   * An account its owner closed is not reachable from this control, in either
   * direction.
   *
   * Blocking one would overwrite the record of a self-deactivation with a staff
   * suspension and lose why it closed. Flipping one to active is the more
   * important half: reactivation exists precisely because coming back requires
   * the account holder to prove who they are, and a status dropdown that reopens
   * an account skips every one of those proofs — it would let a single mis-click
   * hand a closed account back to whoever asked. The Reactivation Requests screen
   * is the only door, and this is the check that makes it the only one.
   */
  const target = await User.findById(req.params.id).select('status name');
  if (!target) throw ApiError.notFound('User not found');

  if (isSelfDeactivated(target)) {
    throw ApiError.badRequest(
      target.status === 'reactivation-pending'
        ? `${target.name} deactivated this account and has asked to come back. Approve or reject ` +
          `the request under Reactivation Requests — the status cannot be changed here.`
        : `${target.name} deactivated this account themselves. It can only be reopened by ` +
          `approving a reactivation request, which the customer starts from the sign-in page.`
    );
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    // Reactivating unsets the stored reason so it never outlives the block it explains.
    status === 'blocked'
      ? { status, blockedReason: String(blockedReason).trim() }
      : { status, $unset: { blockedReason: '' } },
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

/* ------------------------------------------------------------------ *
 * Reactivation requests (admin)
 *
 * The queue where a closed account comes back — or does not. Every row
 * here has already proven the link, the code and the account's own
 * details; what is left is the judgement call, and these three routes
 * are all there is to it.
 * ------------------------------------------------------------------ */

/** GET /users/reactivation-requests (admin) */
exports.listReactivationRequests = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 15);

  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.search) {
    const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [requests, total, counts] = await Promise.all([
    ReactivationRequest.find(filter)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      // The live status, which the snapshot deliberately does not carry: an
      // approved request sits next to an account that is active again, and the
      // row should say so rather than only what it said the day it arrived.
      .populate('user', 'status email name phone avatar createdAt')
      .lean(),
    ReactivationRequest.countDocuments(filter),
    ReactivationRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const stats = { pending: 0, approved: 0, rejected: 0 };
  for (const row of counts) stats[row._id] = row.count;

  return sendSuccess(res, {
    message: 'Reactivation requests fetched',
    data: { requests, stats },
    meta: paginationMeta({ total, page, limit }),
  });
});

/**
 * GET /users/reactivation-requests/:id (admin)
 *
 * The request plus the account's whole audit trail. The trail is what turns this
 * from a form into a decision: it shows when the account was closed and why, how
 * many refused sign-ins there have been since, and — on a second request — what
 * happened to the first.
 */
exports.getReactivationRequest = asyncHandler(async (req, res) => {
  const request = await ReactivationRequest.findById(req.params.id)
    .populate('user', 'status email name phone avatar createdAt deactivation authProviders')
    .populate('reviewedBy', 'name email')
    .lean();
  if (!request) throw ApiError.notFound('Request not found');

  const [trail, orderStats] = await Promise.all([
    audit.forUser(request.user?._id || request.user),
    Order.aggregate([
      { $match: { user: request.user?._id || request.user } },
      { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$pricing.total' } } },
    ]),
  ]);

  return sendSuccess(res, {
    message: 'Request fetched',
    data: {
      request,
      trail,
      customer: {
        orders: orderStats[0]?.orders || 0,
        spent: Math.round((orderStats[0]?.spent || 0) * 100) / 100,
      },
    },
  });
});

/**
 * PATCH /users/reactivation-requests/:id (admin) — approve or reject.
 *
 * One route for both because they are one decision with two answers, and because
 * everything around the answer — the request must still be open, the account must
 * still be the one that asked, the trail must record who decided and when — is
 * identical either way.
 *
 * Approving is the only thing in the system that turns a self-closed account back
 * to active. That is why the account is re-read here rather than trusted from the
 * request snapshot: a shopper whose account was blocked by staff *after* asking to
 * come back must not be laundered into an active one by an approval.
 */
exports.decideReactivationRequest = asyncHandler(async (req, res) => {
  const { decision, adminNotes, rejectionReason } = req.body;

  const request = await ReactivationRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('Request not found');
  if (request.status !== 'pending') {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }

  const user = await User.findById(request.user);
  if (!user) throw ApiError.notFound('The account this request belongs to no longer exists');
  if (user.status === 'blocked') {
    throw ApiError.badRequest(
      'This account has since been blocked by an administrator. Unblock it first if you intend ' +
        'to let the customer back in.'
    );
  }

  const at = new Date();
  request.status = decision;
  request.reviewedBy = req.user._id;
  request.reviewedByName = req.user.name;
  request.reviewedAt = at;
  if (adminNotes) request.adminNotes = String(adminNotes).trim();
  if (decision === 'rejected') request.rejectionReason = String(rejectionReason).trim();
  await request.save();

  if (decision === 'approved') {
    /**
     * Back to where the account was before its owner closed it: active, with the
     * closure's own record cleared so a later reading of this document describes
     * the account as it now stands rather than as it once was. The trail keeps the
     * history — that is what it is for.
     */
    await User.updateOne(
      { _id: user._id },
      {
        $set: { status: 'active' },
        $unset: {
          deactivation: 1,
          reactivationRequestedAt: 1,
          reactivationToken: 1,
          reactivationExpires: 1,
        },
      }
    );
    user.status = 'active';

    // A returning account needs the two empty collections every sign-up gets —
    // upserted, because an account that only ever closed still has both.
    await Promise.all([
      Cart.updateOne({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true }),
      Wishlist.updateOne({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true }),
    ]);
  } else {
    /**
     * A refusal returns the account to plain 'deactivated' rather than leaving it
     * pending: pending means "someone is looking at this", and once nobody is, the
     * customer must be able to ask again — with a fresh link and fresh proof.
     */
    await User.updateOne(
      { _id: user._id },
      { $set: { status: 'deactivated' }, $unset: { reactivationRequestedAt: 1 } }
    );
    user.status = 'deactivated';
  }

  await audit.record(user, decision === 'approved' ? 'reactivation-approved' : 'reactivation-rejected', {
    actor: 'admin',
    actorId: req.user._id,
    actorName: req.user.name,
    req,
    summary:
      decision === 'approved'
        ? `Reactivation approved by ${req.user.name}`
        : `Reactivation rejected by ${req.user.name} — ${request.rejectionReason}`,
    meta: { requestId: String(request._id), adminNotes: request.adminNotes },
  });

  if (decision === 'approved') {
    await audit.record(user, 'reactivated', {
      actor: 'admin',
      actorId: req.user._id,
      actorName: req.user.name,
      req,
      summary: 'Account returned to active',
    });
  }

  const mail =
    decision === 'approved'
      ? mailService.sendAccountReactivatedEmail({
          to: request.email,
          name: request.name,
          reviewedAt: at,
          adminNotes: request.adminNotes,
        })
      : mailService.sendReactivationRejectedEmail({
          to: request.email,
          name: request.name,
          reason: request.rejectionReason,
          reviewedAt: at,
        });
  mail.catch((err) => logger.error(`Reactivation decision email failed: ${err.message}`));

  broadcast.reactivationRequestChanged(decision, request);
  broadcast.userChanged('status', user);
  broadcast.accountStatusChanged(user);

  return sendSuccess(res, {
    message: decision === 'approved' ? 'Account reactivated' : 'Request rejected',
    data: { request },
  });
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
