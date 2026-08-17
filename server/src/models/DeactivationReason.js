const mongoose = require('mongoose');

/**
 * The picklist a shopper chooses from when deactivating their own account —
 * admin-managed, and deliberately the twin of CancellationReason rather than a
 * variation on it: the two are curated side by side on the same Reasons screen,
 * and an admin who has learnt one list has learnt the other.
 *
 * "Other" is not a row here for the same reason it is not one there: it is the
 * escape hatch the dialog always offers underneath, and an admin deleting it
 * would leave people with no way to say something the list does not cover.
 *
 * A chosen reason is copied onto the user as text, so editing or deleting a row
 * changes what future shoppers are offered and never what a closed account says
 * it closed for.
 */
const deactivationReasonSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      maxlength: 120,
    },
    /** Its slot in the picklist — kept a gap-free 0..n-1 run by the controller. */
    displayOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

/**
 * The list a fresh install starts with, seeded on first read so the deactivation
 * dialog is never empty before an admin has opened the screen. Seeding happens
 * once — an admin who deletes every row keeps an empty list.
 */
const DEFAULT_REASONS = [
  'I no longer use this account',
  'Privacy concerns',
  'Poor experience with the service',
  'Security concerns',
  'I created a duplicate account',
  'Too many marketing emails',
];

module.exports = mongoose.model('DeactivationReason', deactivationReasonSchema);
module.exports.DEFAULT_REASONS = DEFAULT_REASONS;
