const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const { Review, Product, Order } = require('../models');
const broadcast = require('../realtime/broadcast');

/**
 * Reads back the product's rating aggregate. The Review model resyncs it in a post
 * hook, so by the time a handler returns this is the freshly-recomputed value.
 */
async function currentRatings(productId) {
  const product = await Product.findById(productId).select('ratings').lean();
  return product?.ratings || null;
}

/** GET /products/:productId/reviews */
exports.listReviews = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 10);

  const filter = { product: req.params.productId, status: 'approved' };
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const sortMap = {
    newest: { createdAt: -1 },
    helpful: { helpfulCount: -1, createdAt: -1 },
    highest: { rating: -1, createdAt: -1 },
    lowest: { rating: 1, createdAt: -1 },
  };

  const [reviews, total, product] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name avatar')
      .select('+helpfulBy')
      .sort(sortMap[req.query.sort] || sortMap.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    Product.findById(req.params.productId).select('ratings').lean(),
  ]);

  /**
   * The voter list is only read to answer "did *I* mark this one?" — it never
   * leaves the server, so a signed-in visitor cannot see who else voted.
   */
  const userId = req.user?._id;
  const shaped = reviews.map(({ helpfulBy = [], ...review }) => ({
    ...review,
    markedHelpful: userId ? helpfulBy.some((id) => String(id) === String(userId)) : false,
  }));

  return sendSuccess(res, {
    message: 'Reviews fetched',
    data: { reviews: shaped, summary: product?.ratings || null },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** POST /products/:productId/reviews */
exports.createReview = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!(await Product.exists({ _id: productId, status: 'published' }))) {
    throw ApiError.notFound('Product not found');
  }
  if (await Review.exists({ product: productId, user: req.user._id })) {
    throw ApiError.conflict('You have already reviewed this product. Edit your existing review instead.');
  }

  // Verified badge only when the buyer actually received the item.
  const purchase = await Order.findOne({
    user: req.user._id,
    'items.product': productId,
    orderStatus: 'delivered',
  }).select('_id');

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    order: purchase?._id,
    isVerifiedPurchase: Boolean(purchase),
    rating: req.body.rating,
    title: req.body.title,
    comment: req.body.comment,
    images: req.body.images || [],
  });

  await review.populate('user', 'name avatar');

  broadcast.reviewChanged('created', review, await currentRatings(productId));

  return sendSuccess(res, { statusCode: 201, message: 'Review submitted', data: { review } });
});

/** PATCH /reviews/:id */
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.user) !== String(req.user._id)) throw ApiError.forbidden();

  ['rating', 'title', 'comment', 'images'].forEach((field) => {
    if (req.body[field] !== undefined) review[field] = req.body[field];
  });
  await review.save();

  broadcast.reviewChanged('updated', review, await currentRatings(review.product));

  return sendSuccess(res, { message: 'Review updated', data: { review } });
});

/** DELETE /reviews/:id — owner or admin. */
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (req.user.role !== 'admin' && String(review.user) !== String(req.user._id)) {
    throw ApiError.forbidden();
  }

  await review.deleteOne();

  broadcast.reviewChanged('deleted', review, await currentRatings(review.product));

  return sendSuccess(res, { message: 'Review deleted' });
});

/** POST /reviews/:id/helpful */
/**
 * POST /reviews/:id/helpful — toggles this account's "helpful" vote.
 *
 * The vote is recorded against the user rather than just incrementing a counter,
 * so the total reflects distinct people. Both directions are a single conditional
 * update: the filter decides which way it goes, so two taps racing each other can
 * neither double-count nor drive the total below zero.
 */
exports.markHelpful = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const review = await Review.findByIdAndUpdate(
    req.params.id,
    [
      {
        $set: {
          helpfulBy: {
            $cond: [
              { $in: [userId, { $ifNull: ['$helpfulBy', []] }] },
              { $filter: { input: '$helpfulBy', as: 'v', cond: { $ne: ['$$v', userId] } } },
              { $concatArrays: [{ $ifNull: ['$helpfulBy', []] }, [userId]] },
            ],
          },
        },
      },
      // The total is never incremented, only restated as the number of voters, so
      // it cannot drift away from the list it is supposed to be counting.
      { $set: { helpfulCount: { $size: '$helpfulBy' } } },
    ],
    { new: true }
  ).select('+helpfulBy');

  if (!review) throw ApiError.notFound('Review not found');

  const markedHelpful = review.helpfulBy.some((id) => String(id) === String(userId));

  broadcast.reviewChanged('updated', review);

  return sendSuccess(res, {
    message: markedHelpful ? 'Thanks for your feedback' : 'Your feedback was removed',
    data: { helpfulCount: review.helpfulCount, markedHelpful },
  });
});

/** GET /reviews/mine */
exports.getMyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ user: req.user._id })
    .populate('product', 'name slug images finalPrice')
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, { message: 'Reviews fetched', data: { reviews } });
});
