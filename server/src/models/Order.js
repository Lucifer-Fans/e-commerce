const mongoose = require('mongoose');

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
];

/**
 * Legal forward transitions. Orders may be cancelled up to (and including) "shipped";
 * after delivery only a return is possible.
 */
const STATUS_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

/**
 * Order items are denormalised snapshots. A product being renamed, repriced or deleted
 * must never rewrite historical orders or invoices.
 */
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    /**
     * The SKU that was actually shipped. Inventory, returns, warehouse picking and
     * per-SKU analytics all read this; `product` alone cannot tell Black/M from Blue/L.
     * Null for products that have no variants.
     */
    variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    variantSku: String,
    variantLabel: String, // "Black · M" — printed on invoices and packing slips
    /** Snapshot of the chosen pairs, so a later attribute rename can't rewrite history. */
    variantAttributes: {
      type: [
        {
          name: String,
          value: String,
          _id: false,
        },
      ],
      default: [],
    },
    /** Shipping data captured per SKU — a 256 GB unit may weigh differently to a 128 GB one. */
    weight: {
      value: Number,
      unit: String,
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: String,
    },
    name: { type: String, required: true },
    slug: String,
    image: String,
    brand: String,
    categoryName: String,
    subCategoryName: String,
    price: { type: Number, required: true }, // MRP at purchase time
    discountPercent: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true }, // per-unit paid price
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      validate: { validator: (v) => v.length > 0, message: 'Order must contain at least one item' },
    },

    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      addressLine1: { type: String, required: true },
      addressLine2: String,
      landmark: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },

    /**
     * `subtotal − couponDiscount + shipping = total`, and that is the whole sum.
     * `mrpTotal` and `discount` describe the same money from the pre-discount
     * side for display; neither is a deduction still to be taken.
     */
    pricing: {
      /** Sum of the MRP line totals. Display only — the struck-through original. */
      mrpTotal: { type: Number, default: 0 },
      /** Sum of the discounted line totals — what the item table adds up to. */
      subtotal: { type: Number, required: true },
      /** MRP less `subtotal`: the saving already baked into the prices above. */
      discount: { type: Number, default: 0 },
      couponCode: String,
      /** The one deduction from `subtotal`. */
      couponDiscount: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },

    paymentMethod: { type: String, enum: ['razorpay', 'cod'], default: 'razorpay' },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },

    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUSES },
        note: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
      },
    ],

    trackingNumber: String,
    courierPartner: String,
    expectedDeliveryDate: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    cancellationReason: String,

    invoiceNumber: String,
    notes: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

orderSchema.virtual('itemCount').get(function itemCount() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

orderSchema.virtual('isCancellable').get(function isCancellable() {
  return STATUS_FLOW[this.orderStatus]?.includes('cancelled') ?? false;
});

orderSchema.pre('validate', async function assignNumbers(next) {
  if (this.isNew && !this.orderNumber) {
    // ORD-<yy><mm>-<6 char suffix from the ObjectId> — sortable and collision-free.
    const now = new Date();
    const ym = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.orderNumber = `ORD-${ym}-${this._id.toString().slice(-6).toUpperCase()}`;
    this.invoiceNumber = `INV-${ym}-${this._id.toString().slice(-6).toUpperCase()}`;
  }
  next();
});

orderSchema.statics.ORDER_STATUSES = ORDER_STATUSES;
orderSchema.statics.STATUS_FLOW = STATUS_FLOW;
orderSchema.statics.canTransition = (from, to) => Boolean(STATUS_FLOW[from]?.includes(to));

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.STATUS_FLOW = STATUS_FLOW;
