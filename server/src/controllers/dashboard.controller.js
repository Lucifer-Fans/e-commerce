const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { Order, Product, ProductVariant, User, Category, Review } = require('../models');

const startOfDay = (d) => new Date(new Date(d).setHours(0, 0, 0, 0));
const endOfDay = (d) => new Date(new Date(d).setHours(23, 59, 59, 999));
const daysAgo = (n) => startOfDay(Date.now() - n * 86400000);

const REVENUE_MATCH = { paymentStatus: 'paid', orderStatus: { $ne: 'cancelled' } };

/**
 * Customers, counted the same way the users list shows them: a sign-up still owing
 * its verification code is not a customer, so it must not swell the headline number
 * either — otherwise the KPI and the list it links to disagree.
 */
const CUSTOMER_MATCH = { role: 'user', emailVerificationPending: { $ne: true } };

/** GET /dashboard/stats (admin) — headline KPI cards. */
exports.getStats = asyncHandler(async (_req, res) => {
  const today = startOfDay(Date.now());
  const last30 = daysAgo(30);
  const prev30 = daysAgo(60);

  const [
    totalProducts,
    publishedProducts,
    outOfStock,
    lowStock,
    totalUsers,
    newUsers30,
    totalOrders,
    pendingOrders,
    revenueAgg,
    todayAgg,
    current30Agg,
    previous30Agg,
    pendingReviews,
    totalSkus,
    lowStockSkus,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ status: 'published' }),
    Product.countDocuments({ stock: { $lte: 0 } }),
    Product.countDocuments({ $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] } }),
    User.countDocuments(CUSTOMER_MATCH),
    User.countDocuments({ ...CUSTOMER_MATCH, createdAt: { $gte: last30 } }),
    Order.countDocuments(),
    Order.countDocuments({ orderStatus: { $in: ['pending', 'confirmed', 'packed'] } }),
    Order.aggregate([{ $match: REVENUE_MATCH }, { $group: { _id: null, total: { $sum: '$pricing.total' }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { ...REVENUE_MATCH, createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$pricing.total' }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { ...REVENUE_MATCH, createdAt: { $gte: last30 } } }, { $group: { _id: null, total: { $sum: '$pricing.total' } } }]),
    Order.aggregate([{ $match: { ...REVENUE_MATCH, createdAt: { $gte: prev30, $lt: last30 } } }, { $group: { _id: null, total: { $sum: '$pricing.total' } } }]),
    Review.countDocuments({ status: 'pending' }),
    // SKU-level inventory health: a product can look stocked and still be unbuyable in the
    // one size everybody wants.
    ProductVariant.countDocuments({ isActive: true }),
    ProductVariant.countDocuments({
      isActive: true,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
    }),
  ]);

  const revenue = revenueAgg[0]?.total || 0;
  const paidOrders = revenueAgg[0]?.count || 0;
  const current = current30Agg[0]?.total || 0;
  const previous = previous30Agg[0]?.total || 0;

  return sendSuccess(res, {
    message: 'Dashboard stats fetched',
    data: {
      revenue: {
        total: Math.round(revenue * 100) / 100,
        today: Math.round((todayAgg[0]?.total || 0) * 100) / 100,
        last30Days: Math.round(current * 100) / 100,
        // No previous period to compare against reads as 100% growth, not Infinity.
        growthPercent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : current > 0 ? 100 : 0,
      },
      orders: {
        total: totalOrders,
        today: todayAgg[0]?.count || 0,
        pending: pendingOrders,
        averageValue: paidOrders ? Math.round((revenue / paidOrders) * 100) / 100 : 0,
      },
      products: {
        total: totalProducts,
        published: publishedProducts,
        outOfStock,
        lowStock,
        totalSkus,
        lowStockSkus,
      },
      users: { total: totalUsers, newLast30Days: newUsers30 },
      moderation: { pendingReviews },
    },
  });
});

const BUCKET_FORMAT = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Plotting 400 daily points is unreadable — widen the bucket as the window grows. */
const granularityFor = (from, to) => {
  const days = Math.ceil((to - from) / 86400000) + 1;
  if (days <= 92) return 'day';
  if (days <= 1830) return 'month';
  return 'year';
};

/** Local-time bucket key that mirrors what $dateToString produces for the same date. */
const bucketKey = (date, granularity) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (granularity === 'year') return `${y}`;
  if (granularity === 'month') return `${y}-${m}`;
  return `${y}-${m}-${d}`;
};

const stepBucket = (date, granularity) => {
  const next = new Date(date);
  if (granularity === 'year') next.setFullYear(next.getFullYear() + 1, 0, 1);
  else if (granularity === 'month') next.setMonth(next.getMonth() + 1, 1);
  else next.setDate(next.getDate() + 1);
  return startOfDay(next);
};

/**
 * Resolves ?range=month|year|all|custom (with ?from/?to for custom) into a concrete
 * window. `days` is still honoured so older callers keep working.
 */
async function resolveRange(query) {
  const now = new Date();
  const to = endOfDay(now);

  if (query.from || query.to) {
    const parsedFrom = new Date(query.from);
    const parsedTo = new Date(query.to || now);
    if (!Number.isNaN(parsedFrom.valueOf()) && !Number.isNaN(parsedTo.valueOf())) {
      const a = startOfDay(Math.min(parsedFrom, parsedTo));
      const b = endOfDay(Math.max(parsedFrom, parsedTo));
      return { from: a, to: b, range: 'custom' };
    }
  }

  const range = String(query.range || '').toLowerCase();

  if (range === 'all') {
    const first = await Order.findOne().sort({ createdAt: 1 }).select('createdAt').lean();
    return { from: startOfDay(first?.createdAt || daysAgo(29)), to, range: 'all' };
  }
  if (range === 'year') return { from: startOfDay(new Date(now).setFullYear(now.getFullYear() - 1)), to, range: 'year' };
  if (range === 'month') return { from: daysAgo(29), to, range: 'month' };

  const days = Math.min(3650, Math.max(2, Number(query.days) || 30));
  return { from: daysAgo(days - 1), to, range: 'custom' };
}

/**
 * A `createdAt` filter for panels whose range is optional. Absent or `range=all`
 * means all time, so these endpoints keep their original behaviour for callers
 * that don't ask for a window.
 */
async function optionalDateMatch(query = {}) {
  const explicit = query.from || query.to || (query.range && String(query.range).toLowerCase() !== 'all');
  if (!explicit) return { match: {}, range: { key: 'all', from: null, to: null } };

  const { from, to, range } = await resolveRange(query);
  return { match: { createdAt: { $gte: from, $lte: to } }, range: { key: range, from, to } };
}

/** Revenue / orders / customers / AOV for one window, as a single row. */
async function periodTotals(from, to) {
  const [row] = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
        customers: { $addToSet: '$user' },
      },
    },
  ]);

  const revenue = row?.revenue || 0;
  const orders = row?.orders || 0;
  return {
    revenue: round2(revenue),
    orders,
    customers: row?.customers?.length || 0,
    aov: orders ? round2(revenue / orders) : 0,
  };
}

/** No previous period to compare against reads as 100% growth, not Infinity. */
const growthOf = (current, previous) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : current > 0 ? 100 : 0;

/** GET /dashboard/sales-chart?range=month|year|all|custom&from&to (admin) */
exports.getSalesChart = asyncHandler(async (req, res) => {
  const { from, to, range } = await resolveRange(req.query);
  const granularity = granularityFor(from, to);

  const rows = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: BUCKET_FORMAT[granularity], date: '$createdAt' } },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
        customers: { $addToSet: '$user' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Backfill quiet buckets so the chart has no gaps.
  const byKey = new Map(rows.map((r) => [r._id, r]));
  const series = [];
  for (let cursor = startOfDay(from); cursor <= to && series.length < 400; cursor = stepBucket(cursor, granularity)) {
    const key = bucketKey(cursor, granularity);
    const row = byKey.get(key);
    const revenue = round2(row?.revenue);
    const orders = row?.orders || 0;
    series.push({
      date: key,
      revenue,
      orders,
      customers: row?.customers?.length || 0,
      aov: orders ? round2(revenue / orders) : 0,
    });
  }

  const totals = await periodTotals(from, to);

  // "All time" has nothing before it to compare against.
  let growth = { revenue: 0, orders: 0, customers: 0, aov: 0 };
  if (range !== 'all') {
    const span = to - from;
    const previous = await periodTotals(new Date(from.getTime() - span - 1), new Date(from.getTime() - 1));
    growth = {
      revenue: growthOf(totals.revenue, previous.revenue),
      orders: growthOf(totals.orders, previous.orders),
      customers: growthOf(totals.customers, previous.customers),
      aov: growthOf(totals.aov, previous.aov),
    };
  }

  return sendSuccess(res, {
    message: 'Sales chart fetched',
    data: {
      range: { key: range, from, to, granularity },
      series,
      totals,
      growth,
    },
  });
});

/** GET /dashboard/payment-preference?range=month|year|all|custom&from&to (admin) */
exports.getPaymentPreference = asyncHandler(async (req, res) => {
  const LABELS = { razorpay: 'Online', cod: 'Cash on delivery' };
  const { match, range } = await optionalDateMatch(req.query);

  const rows = await Order.aggregate([
    { $match: { orderStatus: { $ne: 'cancelled' }, ...match } },
    { $group: { _id: '$paymentMethod', count: { $sum: 1 }, value: { $sum: '$pricing.total' } } },
    { $sort: { count: -1 } },
  ]);

  return sendSuccess(res, {
    message: 'Payment preference fetched',
    data: {
      range,
      breakdown: rows.map((r) => ({
        method: r._id || 'razorpay',
        label: LABELS[r._id] || 'Online',
        count: r.count,
        value: round2(r.value),
      })),
    },
  });
});

/** GET /dashboard/order-status-breakdown?range=month|year|all|custom&from&to (admin) */
exports.getOrderStatusBreakdown = asyncHandler(async (req, res) => {
  const { match, range } = await optionalDateMatch(req.query);

  const rows = await Order.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $group: { _id: '$orderStatus', count: { $sum: 1 }, value: { $sum: '$pricing.total' } } },
    { $sort: { count: -1 } },
  ]);

  return sendSuccess(res, {
    message: 'Order status breakdown fetched',
    data: {
      range,
      breakdown: rows.map((r) => ({
        status: r._id,
        count: r.count,
        value: Math.round(r.value * 100) / 100,
      })),
    },
  });
});

/** GET /dashboard/top-products?limit&range=month|year|all|custom&from&to (admin) */
exports.getTopProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(20, Number(req.query.limit) || 5);
  const { match, range } = await optionalDateMatch(req.query);

  // `groupBy=variant` reports per SKU — which colour and size actually sold — while the
  // default keeps the product-level view every existing caller expects.
  const bySku = req.query.groupBy === 'variant';

  const rows = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, ...match } },
    { $unwind: '$items' },
    {
      $group: {
        _id: bySku ? { product: '$items.product', variant: '$items.variant' } : '$items.product',
        name: { $first: '$items.name' },
        image: { $first: '$items.image' },
        variantSku: { $first: '$items.variantSku' },
        variantLabel: { $first: '$items.variantLabel' },
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: limit },
  ]);

  return sendSuccess(res, {
    message: 'Top products fetched',
    data: {
      range,
      groupBy: bySku ? 'variant' : 'product',
      products: rows.map((r) => ({
        ...r,
        _id: bySku ? r._id.variant || r._id.product : r._id,
        productId: bySku ? r._id.product : r._id,
        revenue: Math.round(r.revenue * 100) / 100,
      })),
    },
  });
});

/** GET /dashboard/category-performance (admin) */
exports.getCategoryPerformance = asyncHandler(async (_req, res) => {
  const rows = await Order.aggregate([
    { $match: REVENUE_MATCH },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.categoryName',
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);

  const totalCategories = await Category.countDocuments();

  return sendSuccess(res, {
    message: 'Category performance fetched',
    data: {
      totalCategories,
      categories: rows.map((r) => ({
        name: r._id || 'Uncategorised',
        unitsSold: r.unitsSold,
        revenue: Math.round(r.revenue * 100) / 100,
      })),
    },
  });
});

/** GET /dashboard/recent-orders (admin) */
exports.getRecentOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate('user', 'name email')
    .select('orderNumber items pricing.total orderStatus paymentStatus createdAt')
    .sort({ createdAt: -1 })
    .limit(Math.min(20, Number(req.query.limit) || 8))
    .lean();

  return sendSuccess(res, { message: 'Recent orders fetched', data: { orders } });
});

/** GET /dashboard/low-stock (admin) */
exports.getLowStockProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 10);

  // Un-varied products are judged on their own stock. Varied ones are judged per SKU,
  // because a product sitting on 200 units can still be unsellable in size L — the rollup
  // would hide exactly the row a restock decision needs.
  const [products, variants] = await Promise.all([
    Product.find({
      hasVariants: { $ne: true },
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      status: { $ne: 'archived' },
    })
      .select('name slug stock lowStockThreshold images finalPrice sku')
      .sort({ stock: 1 })
      .limit(limit)
      .lean({ virtuals: true }),

    ProductVariant.find({ isActive: true, $expr: { $lte: ['$stock', '$lowStockThreshold'] } })
      .populate({ path: 'product', select: 'name slug status images' })
      .sort({ stock: 1 })
      .limit(limit)
      .lean({ virtuals: true }),
  ]);

  const variantRows = variants
    .filter((v) => v.product && v.product.status !== 'archived')
    .map((v) => ({
      _id: String(v._id),
      productId: String(v.product._id),
      name: v.product.name,
      slug: v.product.slug,
      sku: v.sku,
      variantLabel: (v.attributes || []).map((a) => a.value).join(' · '),
      stock: v.stock,
      lowStockThreshold: v.lowStockThreshold,
      finalPrice: v.finalPrice,
      images: v.images?.length ? v.images : v.product.images,
    }));

  const merged = [
    ...products.map((p) => ({ ...p, productId: String(p._id), variantLabel: null })),
    ...variantRows,
  ]
    .sort((a, b) => a.stock - b.stock)
    .slice(0, limit);

  return sendSuccess(res, { message: 'Low stock products fetched', data: { products: merged } });
});
