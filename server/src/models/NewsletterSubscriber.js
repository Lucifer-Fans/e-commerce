const mongoose = require('mongoose');

/**
 * A newsletter sign-up from the storefront footer.
 *
 * The email is the identity — a unique index makes re-subscribing an update rather
 * than a duplicate row, which is what keeps the list clean when someone submits the
 * same address twice. Unsubscribing keeps the record and flips `status`, so a later
 * re-subscribe is provable and the original sign-up date is never lost.
 */
const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 120,
    },

    status: {
      type: String,
      enum: ['subscribed', 'unsubscribed'],
      default: 'subscribed',
      index: true,
    },

    // Where the sign-up came from — only the footer today, but a promo modal or a
    // checkout opt-in would land here too.
    source: { type: String, trim: true, maxlength: 40, default: 'footer' },

    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: Date,

    // Abuse triage only; never returned in a list response.
    meta: {
      ip: { type: String, select: false },
      userAgent: { type: String, select: false, maxlength: 300 },
    },
  },
  { timestamps: true }
);

// The admin list is always newest-first, optionally narrowed by status.
newsletterSubscriberSchema.index({ createdAt: -1 });

module.exports = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
