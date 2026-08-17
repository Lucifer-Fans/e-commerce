const mongoose = require('mongoose');

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Blank, zero and negative all mean "no limit"; only a positive number is one.
 * Storing 0 for "unlimited" is what silently zeroed flat coupons — a 0 cap read
 * back as a ceiling of zero rupees — so the distinction is enforced at the field.
 */
const optionalAmount = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const optionalCount = (value) => {
  const n = optionalAmount(value);
  return n === null ? null : Math.floor(n);
};

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 24,
    },
    description: { type: String, trim: true, maxlength: 200 },
    discountType: { type: String, enum: ['percentage', 'flat'], default: 'percentage' },
    discountValue: { type: Number, required: true, min: 0 },
    /** Caps percentage coupons only. null = uncapped. */
    maxDiscountAmount: { type: Number, default: null, set: optionalAmount },
    minOrderAmount: { type: Number, default: 0 },
    /** Successful redemptions allowed across every customer. null = unlimited. */
    usageLimit: { type: Number, default: null, set: optionalCount },
    /** Successful redemptions counted against `usageLimit`. */
    usedCount: { type: Number, default: 0 },
    /** Successful redemptions allowed for one customer. null = unlimited. */
    perUserLimit: { type: Number, default: 1, set: optionalCount },
    /**
     * Per-customer tally, tracked independently of `usedCount`: one shopper
     * spending three of their allowance moves this by three and the global
     * counter by three, but neither limit is ever read off the other.
     */
    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 1 },
      },
    ],
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    appliesTo: {
      categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1, isActive: 1 });

/**
 * Reads a stored limit the way the setters write it. Coupons created before
 * those setters existed hold a literal 0 for "unlimited", and a 0 read as a real
 * ceiling makes a coupon permanently exhausted — so every read goes through here
 * rather than comparing the raw field.
 */
const limitOf = (value) => (value == null || Number(value) <= 0 ? null : Number(value));

/** Matches coupons with a global slot still free. Shared by the claim and the storefront list. */
couponSchema.statics.hasSlotFilter = () => ({
  $or: [
    { usageLimit: null },
    { usageLimit: { $lte: 0 } },
    { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
  ],
});

/** How many of this coupon's global slots are still unclaimed (Infinity = unlimited). */
couponSchema.virtual('remainingUses').get(function remainingUses() {
  const limit = limitOf(this.usageLimit);
  return limit == null ? Infinity : Math.max(0, limit - this.usedCount);
});

/** This shopper's tally so far — the number behind `perUserLimit`. */
couponSchema.methods.usesBy = function usesBy(userId) {
  return this.usedBy.find((u) => String(u.user) === String(userId))?.count || 0;
};

/**
 * A coupon may be pinned to part of the catalogue — named categories, named
 * products, or both. Empty on both sides, which is the default, means the whole
 * cart. Anything else is a promotion on those goods and nothing beside them.
 */
couponSchema.methods.isScoped = function isScoped() {
  return Boolean(this.appliesTo?.categories?.length || this.appliesTo?.products?.length);
};

/**
 * The lines this coupon is allowed to discount. Callers pass the same billable
 * lines the order is charged on — each carrying its product and category id —
 * so a category coupon is priced against that category's goods alone and never
 * against the whole basket that happens to contain them.
 */
couponSchema.methods.eligibleLines = function eligibleLines(lines = []) {
  if (!this.isScoped()) return lines;
  const products = new Set((this.appliesTo.products || []).map(String));
  const categories = new Set((this.appliesTo.categories || []).map(String));
  return lines.filter(
    (line) => products.has(String(line.productId)) || categories.has(String(line.categoryId))
  );
};

/** What those lines are worth — the base a scoped coupon is measured against. */
couponSchema.methods.eligibleAmount = function eligibleAmount(lines = []) {
  return round(this.eligibleLines(lines).reduce((sum, l) => sum + l.finalPrice * l.quantity, 0));
};

/**
 * Returns { valid, reason } so callers can surface a precise message.
 *
 * `lines` is the billable basket. It is what decides whether a scoped coupon has
 * anything to come off; `minOrderAmount` stays measured against the whole order,
 * because the threshold is a condition on the order, not on the discounted goods.
 */
couponSchema.methods.check = function check({ userId, subtotal, lines }) {
  const now = new Date();
  if (!this.isActive) return { valid: false, reason: 'This coupon is no longer active' };
  if (this.startsAt > now) return { valid: false, reason: 'This coupon is not active yet' };
  if (this.expiresAt < now) return { valid: false, reason: 'This coupon has expired' };
  if (subtotal < this.minOrderAmount) {
    return { valid: false, reason: `Minimum order of ₹${this.minOrderAmount} required` };
  }
  // A coupon pinned to part of the catalogue is not "invalid" on a basket that
  // misses it — it simply has nothing to discount, and saying so is the only
  // message a shopper can act on.
  if (lines && this.isScoped() && this.eligibleAmount(lines) <= 0) {
    return {
      valid: false,
      reason: 'This coupon applies only to selected products, and your cart has none of them',
    };
  }
  // Global availability and the shopper's own allowance are separate gates: a
  // coupon can be exhausted store-wide while this shopper still has uses left,
  // and vice versa. Each is reported in its own words.
  const globalLimit = limitOf(this.usageLimit);
  if (globalLimit != null && this.usedCount >= globalLimit) {
    return { valid: false, reason: 'This coupon has reached its usage limit' };
  }

  const userLimit = limitOf(this.perUserLimit);
  if (userLimit != null && this.usesBy(userId) >= userLimit) {
    return {
      valid: false,
      reason:
        userLimit === 1
          ? 'You have already used this coupon'
          : `You have already used this coupon ${userLimit} times`,
    };
  }
  return { valid: true };
};

/**
 * @param {number} subtotal   the billable subtotal
 * @param {Array}  [lines]    the billable lines; supplied, a scoped coupon is
 *                            priced off the eligible ones instead of the whole cart
 */
couponSchema.methods.computeDiscount = function computeDiscount(subtotal, lines) {
  // The base is the money this coupon is entitled to touch: the whole subtotal
  // for an unrestricted coupon, only the eligible goods for a scoped one.
  const base = lines && this.isScoped() ? this.eligibleAmount(lines) : subtotal;

  let discount =
    this.discountType === 'percentage' ? (base * this.discountValue) / 100 : this.discountValue;

  // The cap is a percentage-coupon device, and only a positive one is a cap at
  // all. Applying a 0/blank cap to a flat coupon is what made FLAT500 worth ₹0.
  if (this.discountType === 'percentage' && this.maxDiscountAmount > 0) {
    discount = Math.min(discount, this.maxDiscountAmount);
  }
  return round(Math.min(Math.max(discount, 0), base));
};

/**
 * Claims one redemption: a global slot plus one against this shopper's tally.
 * The global claim is a conditional $inc, so two orders racing for the last slot
 * cannot both win — the loser gets `false` and no counter moves.
 *
 * Returns false when the coupon ran out store-wide between validation and here.
 */
couponSchema.statics.claim = async function claim({ couponId, userId }, opts = {}) {
  const claimed = await this.findOneAndUpdate(
    { _id: couponId, ...this.hasSlotFilter() },
    { $inc: { usedCount: 1 } },
    { new: true, ...opts }
  );
  if (!claimed) return false;

  // Bump the shopper's own entry, or open one. Split in two so the tally is
  // maintained by the database rather than by a read-modify-write in the caller.
  const bumped = await this.updateOne(
    { _id: couponId, 'usedBy.user': userId },
    { $inc: { 'usedBy.$.count': 1 } },
    opts
  );
  if (bumped.matchedCount === 0) {
    await this.updateOne(
      { _id: couponId, 'usedBy.user': { $ne: userId } },
      { $push: { usedBy: { user: userId, count: 1 } } },
      opts
    );
  }
  return true;
};

/**
 * Gives a redemption back — cancelled, refunded or never-paid orders must leave
 * the coupon exactly as they found it, for the store and for the shopper.
 */
couponSchema.statics.release = async function release({ couponId, userId }, opts = {}) {
  await this.updateOne({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, opts);
  await this.updateOne(
    { _id: couponId, usedBy: { $elemMatch: { user: userId, count: { $gt: 0 } } } },
    { $inc: { 'usedBy.$.count': -1 } },
    opts
  );
  // A shopper back at zero should look like one who never used it.
  await this.updateOne({ _id: couponId }, { $pull: { usedBy: { count: { $lte: 0 } } } }, opts);
};

module.exports = mongoose.model('Coupon', couponSchema);
