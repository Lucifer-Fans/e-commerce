const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * One login on one device.
 *
 * This collection is the record of who is signed in where, and it is the authority
 * on whether a token is still usable: the access and refresh tokens both carry the
 * `sessionId` below, so revoking a row here logs that device out on its very next
 * request rather than whenever its 15-minute access token happens to lapse. That is
 * what makes "Log out from this device" mean it.
 *
 * A row is created on every successful login and lives until it is revoked, runs out
 * of refresh lifetime, or goes idle past the inactivity policy. Mongo's TTL monitor
 * removes it once `expiresAt` passes, so the collection stays proportional to the
 * number of live logins rather than to the number of logins ever made.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /**
     * Public identifier of this session — travels inside both tokens and is what the
     * devices API accepts. Deliberately not the `_id`: it is minted by the token
     * layer before the document exists, so the pair can be signed in one step.
     */
    sessionId: { type: String, required: true, unique: true },

    /**
     * SHA-256 of the refresh token currently valid for this session. Rotated on every
     * refresh, so a stolen-and-replayed old token no longer matches. Hashed, never
     * stored raw: a leaked dump of this collection must not be a set of live
     * credentials.
     */
    refreshTokenHash: { type: String, required: true, select: false, index: true },

    device: {
      name: { type: String, default: 'Unknown device' },
      type: {
        type: String,
        enum: ['mobile', 'tablet', 'desktop', 'bot', 'unknown'],
        default: 'unknown',
      },
      vendor: String,
      model: String,
    },
    browser: { name: String, version: String },
    os: { name: String, version: String },

    /** Kept raw as well — parsing improves over time, the header does not. */
    userAgent: { type: String, maxlength: 512 },

    ip: String,
    location: {
      city: String,
      region: String,
      country: String,
      countryCode: String,
    },

    /** Which front-end signed in, so an admin console login is recognisable as one. */
    client: { type: String, enum: ['storefront', 'admin'], default: 'storefront' },

    /** How the credentials were presented — the devices screen shows this verbatim. */
    signInMethod: { type: String, enum: ['password', 'google'], default: 'password' },

    loginAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },

    /**
     * Absolute end of life, matching the refresh token's own expiry. Mongo deletes
     * the document once this passes; until then an expired row is still worth
     * keeping, because it lets a returning device be told "your session expired"
     * instead of the far more alarming "that session was revoked".
     */
    expiresAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ['active', 'revoked', 'expired'],
      default: 'active',
      index: true,
    },
    revokedAt: Date,
    revokedReason: {
      type: String,
      enum: [
        'logout',
        'logout-all',
        'revoked-by-user',
        'password-change',
        'password-reset',
        'account-blocked',
        // The owner closed the account themselves. Kept apart from
        // 'account-blocked' so the trail says which of the two happened.
        'account-deactivated',
        'session-limit',
        'inactivity',
        'expired',
        'reuse-detected',
      ],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        // Never leaves the server, under any projection mistake.
        delete ret.refreshTokenHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/** The devices screen reads exactly this: my sessions, most recently used first. */
sessionSchema.index({ user: 1, status: 1, lastActiveAt: -1 });

/** Self-cleanup. `expireAfterSeconds: 0` means "delete when expiresAt is in the past". */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Idle cut-off for this session under the current policy. */
sessionSchema.virtual('idleDeadline').get(function idleDeadline() {
  return new Date(this.lastActiveAt.getTime() + env.session.inactivityDays * 86400 * 1000);
});

/** True when the session may still authenticate a request. */
sessionSchema.methods.isLive = function isLive(now = new Date()) {
  return this.status === 'active' && this.expiresAt > now && this.idleDeadline > now;
};

module.exports = mongoose.model('Session', sessionSchema);
