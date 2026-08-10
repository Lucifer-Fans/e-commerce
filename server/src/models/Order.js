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
 * Legal forward transitions. Orders may be cancelled up to (and including)
 * "out_for_delivery"; after delivery only a return is possible.
 *
 * This is the *staff* ladder. A shopper cancelling from the storefront is held to
 * the narrower window below — see CUSTOMER_CANCELLABLE.
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
 * How far a shopper may cancel on their own: up to, but not including, the moment
 * the parcel leaves the warehouse. Once it is with a courier the money and the
 * goods are both in motion, and stopping that is a support decision — staff keep
 * the wider window STATUS_FLOW allows, because they can actually recall a parcel.
 *
 * Both front-ends mirror this list; the cancel endpoint is what enforces it.
 */
const CUSTOMER_CANCELLABLE = ['pending', 'confirmed', 'packed'];

/** Who ended an order. Recorded on the order and on the history entry alike. */
const CANCELLED_BY = ['customer', 'admin'];

const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refund_pending', 'refunded'];

/**
 * The payment status is maintained by the system, not by hand.
 *
 *   pending → paid            a verified Razorpay payment, or a COD order
 *                             reaching `delivered` — cash is collected on
 *                             handover, so delivery *is* the payment
 *   pending → failed          an abandoned or rejected gateway attempt
 *   paid → refund_pending     the order was cancelled or returned after payment
 *
 * Every one of those happens on its own, in the controller that owns the event.
 * That leaves exactly one thing a human has to decide: whether the refund has
 * actually left the account. Money moves through the gateway, not through a
 * status field, so nothing can know that but the person who raised it.
 *
 * Hence a single manual move, and no map: `refund_pending → refunded`.
 *
 * A cash-on-delivery order never reaches it. Cancelled before handover it
 * collected nothing and owes nothing back, so it simply stays `pending`;
 * delivered, it is marked paid without anyone touching it.
 */
const canMarkRefunded = (order) => order.paymentStatus === 'refund_pending';

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
      enum: PAYMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    /** When staff confirmed the refund had actually been raised. */
    refundedAt: Date,
    /** The gateway/bank reference staff can quote to a shopper chasing it. */
    refundReference: String,
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },

    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUSES },
        note: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        /**
         * Which side made the move. `changedBy` names the account, but an admin
         * panel reading back a closed order needs to say "cancelled by customer"
         * without first resolving a user id against the staff list.
         */
        actor: { type: String, enum: ['customer', 'admin', 'system'], default: 'admin' },
        changedAt: { type: Date, default: Date.now },
      },
    ],

    trackingNumber: String,
    courierPartner: String,
    expectedDeliveryDate: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    /**
     * The reason as it will be read back — the label of the predefined reason the
     * shopper picked, or the sentence they typed under "Other". Stored as text so
     * a later edit to the admin's reason list cannot rewrite a closed order.
     */
    cancellationReason: String,
    cancelledBy: { type: String, enum: CANCELLED_BY },
    cancelledByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

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

/**
 * Whether the *shopper* may still cancel this themselves. The storefront reads
 * this to decide what its Cancel button does; staff go by STATUS_FLOW instead.
 */
orderSchema.virtual('isCancellable').get(function isCancellable() {
  return CUSTOMER_CANCELLABLE.includes(this.orderStatus);
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
orderSchema.statics.CUSTOMER_CANCELLABLE = CUSTOMER_CANCELLABLE;
orderSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;
orderSchema.statics.canMarkRefunded = canMarkRefunded;
orderSchema.statics.canTransition = (from, to) => Boolean(STATUS_FLOW[from]?.includes(to));

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.STATUS_FLOW = STATUS_FLOW;
module.exports.CUSTOMER_CANCELLABLE = CUSTOMER_CANCELLABLE;
module.exports.CANCELLED_BY = CANCELLED_BY;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.canMarkRefunded = canMarkRefunded;
