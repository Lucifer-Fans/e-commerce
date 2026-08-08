const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const { NewsletterSubscriber } = require('../models');
const broadcast = require('../realtime/broadcast');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * POST /newsletter — public.
 *
 * Idempotent: re-submitting an address is a success, not a 409. The three outcomes
 * are told apart in the response so the footer can say "you are already on the list"
 * instead of thanking someone twice.
 *
 * That does mean the form confirms whether an address is subscribed. The public rate
 * limit is what keeps this from being a usable way to harvest the list.
 */
exports.subscribe = asyncHandler(async (req, res) => {
  const email = String(req.body.email).trim().toLowerCase();
  const now = new Date();

  const existing = await NewsletterSubscriber.findOne({ email });

  if (existing?.status === 'subscribed') {
    return sendSuccess(res, {
      message: 'This email is already subscribed to our newsletter.',
      data: { subscribed: true, alreadySubscribed: true },
    });
  }

  if (existing) {
    existing.status = 'subscribed';
    existing.subscribedAt = now;
    existing.unsubscribedAt = undefined;
    await existing.save();
    broadcast.newsletterChanged('resubscribed', existing);

    return sendSuccess(res, {
      message: 'Welcome back! You are subscribed again.',
      data: { subscribed: true, resubscribed: true },
    });
  }

  const created = await NewsletterSubscriber.create({
    email,
    source: 'footer',
    subscribedAt: now,
    meta: { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) },
  });
  broadcast.newsletterChanged('subscribed', created);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Thanks for subscribing! Look out for our next update.',
    data: { subscribed: true },
  });
});

/** GET /newsletter (admin) — search + status filter, server-paginated. */
exports.listSubscribers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.search?.trim()) {
    filter.email = new RegExp(escapeRegex(req.query.search.trim()), 'i');
  }

  const sort = req.query.sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

  const [subscribers, total, subscribedCount] = await Promise.all([
    NewsletterSubscriber.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NewsletterSubscriber.countDocuments(filter),
    NewsletterSubscriber.countDocuments({ status: 'subscribed' }),
  ]);

  return sendSuccess(res, {
    message: 'Subscribers fetched',
    data: { subscribers, subscribedCount },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** PATCH /newsletter/:id/status (admin)  { status } */
exports.setSubscriberStatus = asyncHandler(async (req, res) => {
  const subscriber = await NewsletterSubscriber.findById(req.params.id);
  if (!subscriber) throw ApiError.notFound('Subscriber not found');

  const now = new Date();
  subscriber.status = req.body.status;
  if (subscriber.status === 'subscribed') {
    subscriber.subscribedAt = now;
    subscriber.unsubscribedAt = undefined;
  } else {
    subscriber.unsubscribedAt = now;
  }
  await subscriber.save();

  broadcast.newsletterChanged('status', subscriber);

  return sendSuccess(res, {
    message: subscriber.status === 'subscribed' ? 'Marked as subscribed' : 'Marked as unsubscribed',
    data: { subscriber },
  });
});

/** DELETE /newsletter/:id (admin) — removes the record entirely. */
exports.deleteSubscriber = asyncHandler(async (req, res) => {
  const subscriber = await NewsletterSubscriber.findById(req.params.id);
  if (!subscriber) throw ApiError.notFound('Subscriber not found');

  await subscriber.deleteOne();
  broadcast.newsletterChanged('deleted', subscriber);

  return sendSuccess(res, { message: 'Subscriber removed' });
});
