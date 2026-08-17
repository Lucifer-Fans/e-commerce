const mongoose = require('mongoose');

/**
 * The account lifecycle trail: every step of a deactivation and of the
 * reactivation that may follow it, in the order it happened.
 *
 * It is append-only and nothing reads it to make a decision — the User and
 * ReactivationRequest documents carry the live state. What this collection
 * answers is "how did this account get here", which is a question support and
 * compliance ask months later, when the request document has been approved and
 * overwritten and the session rows have long since expired.
 *
 * Every row therefore records who acted (the account holder, an admin, or the
 * system itself), from where, and what changed — a shape that stays useful
 * whichever end of the flow the row came from.
 */
const ACCOUNT_AUDIT_ACTIONS = [
  // Refused before it began — the account still owes, or is owed, an order.
  'deactivation-blocked',
  'deactivation-requested',
  'deactivation-otp-sent',
  'deactivation-otp-failed',
  'deactivation-otp-verified',
  'deactivated',
  'login-blocked',
  'registration-blocked',
  'reactivation-email-sent',
  'reactivation-link-opened',
  'reactivation-otp-sent',
  'reactivation-otp-verified',
  'reactivation-requested',
  'reactivation-approved',
  'reactivation-rejected',
  'reactivated',
];

const accountAuditSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    action: { type: String, enum: ACCOUNT_AUDIT_ACTIONS, required: true, index: true },

    /**
     * Who caused it. 'user' is the account holder acting on their own account,
     * 'admin' is staff, and 'system' covers the steps nobody clicks — a login
     * refused, a registration turned away.
     */
    actor: { type: String, enum: ['user', 'admin', 'system'], default: 'system' },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Snapshotted, because an admin account can be renamed or removed later. */
    actorName: String,

    /** One line an admin can read without expanding anything. */
    summary: { type: String, trim: true, maxlength: 300 },

    ip: String,
    userAgent: { type: String, maxlength: 512 },

    /** Free-form extras — the reason text, the request id, the channel used. */
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** The one query this collection serves: one account's trail, newest first. */
accountAuditSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('AccountAudit', accountAuditSchema);
module.exports.ACCOUNT_AUDIT_ACTIONS = ACCOUNT_AUDIT_ACTIONS;
