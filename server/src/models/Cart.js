const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    /**
     * The exact SKU the shopper chose. Null only for products that carry no variants at all —
     * everything downstream (stock, pricing, packing, returns) keys off this when it is set,
     * so two sizes of the same shirt are two independent lines.
     */
    variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    /** Denormalised so a cart row still identifies itself if the variant is later deleted. */
    variantSku: { type: String, default: null },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'], default: 1 },
    // Snapshot taken when added — lets us warn the shopper if the price moved before checkout.
    priceAtAdd: { type: Number, required: true },
    savedForLater: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
    coupon: {
      code: String,
      discountAmount: { type: Number, default: 0 },
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

cartSchema.virtual('activeItems').get(function activeItems() {
  return this.items.filter((item) => !item.savedForLater);
});

module.exports = mongoose.model('Cart', cartSchema);
