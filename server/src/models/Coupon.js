const mongoose = require('mongoose');

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
    maxDiscountAmount: { type: Number, default: null }, // caps percentage coupons
    minOrderAmount: { type: Number, default: 0 },
    usageLimit: { type: Number, default: null }, // null = unlimited
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
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

/** Returns { valid, reason } so callers can surface a precise message. */
couponSchema.methods.check = function check({ userId, subtotal }) {
  const now = new Date();
  if (!this.isActive) return { valid: false, reason: 'This coupon is no longer active' };
  if (this.startsAt > now) return { valid: false, reason: 'This coupon is not active yet' };
  if (this.expiresAt < now) return { valid: false, reason: 'This coupon has expired' };
  if (subtotal < this.minOrderAmount) {
    return { valid: false, reason: `Minimum order of ₹${this.minOrderAmount} required` };
  }
  if (this.usageLimit !== null && this.usedCount >= this.usageLimit) {
    return { valid: false, reason: 'This coupon has reached its usage limit' };
  }
  const mine = this.usedBy.find((u) => String(u.user) === String(userId));
  if (mine && mine.count >= this.perUserLimit) {
    return { valid: false, reason: 'You have already used this coupon' };
  }
  return { valid: true };
};

couponSchema.methods.computeDiscount = function computeDiscount(subtotal) {
  let discount =
    this.discountType === 'percentage' ? (subtotal * this.discountValue) / 100 : this.discountValue;
  if (this.maxDiscountAmount != null) discount = Math.min(discount, this.maxDiscountAmount);
  return Math.round(Math.min(discount, subtotal) * 100) / 100;
};

module.exports = mongoose.model('Coupon', couponSchema);
