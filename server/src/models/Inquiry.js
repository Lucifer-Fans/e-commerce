const mongoose = require('mongoose');

/**
 * A "Contact us" message from the storefront.
 *
 * Written by anonymous visitors, read only by admins. Nothing here is ever shown
 * back to the public, so the document keeps the raw contact details the admin needs
 * to reply plus a small audit trail of the reply itself.
 */
const inquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: 120,
      index: true,
    },
    // Stored as the 10 digits the form collects; the +91 prefix is presentation.
    phone: { type: String, trim: true, maxlength: 20 },
    subject: { type: String, trim: true, maxlength: 150, default: '' },
    message: { type: String, required: [true, 'Message is required'], trim: true, maxlength: 3000 },

    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,

    reply: {
      message: { type: String, trim: true, maxlength: 3000 },
      sentAt: Date,
      // False when SMTP is not configured — the reply is still recorded, and the
      // panel can tell the admin it was not actually delivered.
      delivered: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // Kept for abuse triage only; never surfaced in a list response.
    meta: {
      ip: { type: String, select: false },
      userAgent: { type: String, select: false, maxlength: 300 },
    },
  },
  { timestamps: true }
);

// The inbox is always "newest first", optionally narrowed to unread.
inquirySchema.index({ createdAt: -1 });
inquirySchema.index({ isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Inquiry', inquirySchema);
