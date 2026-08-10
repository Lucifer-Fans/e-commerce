const mongoose = require('mongoose');

/**
 * The picklist a shopper chooses from when cancelling an order — fully
 * admin-managed, exactly like banners or coupons.
 *
 * "Other" is deliberately *not* a row here: it is not a reason, it is the escape
 * hatch the dialog always offers, and an admin deleting it would leave shoppers
 * with no way to say something the list does not cover. The storefront renders
 * it after whatever this collection returns.
 *
 * A chosen reason is copied onto the order as text, so editing or deleting a row
 * changes what future shoppers are offered and never what a closed order says.
 */
const cancellationReasonSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      maxlength: 120,
    },
    /** Optional one-liner under the radio — for reasons that need a caveat. */
    description: { type: String, trim: true, maxlength: 200 },
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

/**
 * The list a fresh install starts with, seeded on first read so the cancel
 * dialog is never empty before an admin has opened the screen. Seeding happens
 * once — an admin who deletes every row keeps an empty list.
 */
const DEFAULT_REASONS = [
  'Wrong contact number entered',
  'Expected delivery time is too long',
  'Purchased product from somewhere else',
  'Wrong address selected',
  'Product price has reduced',
  'Product not required anymore',
  'Ordered by mistake',
  'Incorrect product size/colour/type ordered',
  'Incorrect payment method selected',
];

module.exports = mongoose.model('CancellationReason', cancellationReasonSchema);
module.exports.DEFAULT_REASONS = DEFAULT_REASONS;
