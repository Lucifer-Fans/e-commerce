const mongoose = require('mongoose');

const REACTIVATION_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * A deactivated account asking to come back.
 *
 * Deactivation is something a shopper does alone; reactivation is not. The
 * account was closed on a stated reason, its sessions were destroyed and its
 * email was locked out of registration — undoing all of that is a decision, so
 * this document is what a person proved and what an admin then decided about it.
 *
 * The identity fields are *snapshots* taken when the request was submitted, not
 * references resolved when an admin opens the queue. That is deliberate: the
 * question an approver is answering is "did the person who submitted this prove
 * they are the account holder", and the answer must not change because the name
 * on the account was edited afterwards.
 *
 * One open request per account is enforced below. Approved and rejected rows are
 * kept: a second request from someone whose first was refused is exactly the case
 * an admin needs the history for.
 */
const reactivationRequestSchema = new mongoose.Schema(
  {
    // The index lives at the foot of this file: a plain one here would duplicate
    // the partial-unique one that actually enforces 'at most one open request'.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    /* ---- Snapshot of who asked, as it read at submission ---- */
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    phone: { type: String, trim: true },

    /* ---- Snapshot of the deactivation being appealed ---- */
    deactivatedAt: Date,
    deactivationReason: { type: String, trim: true, maxlength: 300 },

    requestedAt: { type: Date, default: Date.now, index: true },

    /**
     * What the requester actually proved, and how. Both stamps have to be present
     * for the request to have been accepted at all — the controller refuses to
     * create one otherwise — so an admin reading this is checking *when*, not
     * whether.
     */
    verification: {
      /** Opened the single-use link we mailed to the registered address. */
      linkVerifiedAt: Date,
      /** Re-typed the name and mobile number held on the account. */
      detailsConfirmedAt: Date,
      /** Answered a fresh one-time code sent to that same address. */
      emailOtpVerifiedAt: Date,
      /** Which of the account's registered details were re-confirmed. */
      confirmedFields: [String],
      ip: String,
      userAgent: { type: String, maxlength: 512 },
    },

    status: { type: String, enum: REACTIVATION_STATUSES, default: 'pending', index: true },

    /** Anything the requester wanted the reviewer to know. Optional. */
    message: { type: String, trim: true, maxlength: 500 },

    /* ---- The decision ---- */
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Snapshotted for the same reason the requester's details are. */
    reviewedByName: String,
    reviewedAt: Date,
    /** Staff-facing note, on an approval as well as a rejection. */
    adminNotes: { type: String, trim: true, maxlength: 500 },
    /** Shown to the shopper in the rejection email, so it is written for them. */
    rejectionReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

/** The queue reads exactly this: everything waiting, oldest request first. */
reactivationRequestSchema.index({ status: 1, requestedAt: -1 });

/**
 * At most one open request per account, enforced by the database rather than by a
 * check-then-write in the controller: the link is emailable and the submit button
 * is clickable twice, so two requests arriving together is a race that actually
 * happens. Partial, so the closed rows an account accumulates never collide.
 */
reactivationRequestSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('ReactivationRequest', reactivationRequestSchema);
module.exports.REACTIVATION_STATUSES = REACTIVATION_STATUSES;
