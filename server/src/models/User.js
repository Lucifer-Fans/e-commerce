const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { SUPPORTED_LANGUAGES } = require('../config/languages');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10 digit mobile number'],
    },
    password: {
      type: String,
      // Social accounts never set one — they authenticate through the provider.
      required: [
        function passwordRequired() {
          return !this.googleId;
        },
        'Password is required',
      ],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    googleId: { type: String, index: { unique: true, sparse: true } },
    authProviders: {
      type: [{ type: String, enum: ['local', 'google'] }],
      default: ['local'],
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    avatar: {
      url: String,
      // Only set for images we host — Google-hosted pictures have no asset of ours
      // to destroy, so `source` decides whether cleanup and refreshes apply.
      publicId: String,
      // No default: accounts that predate this field must not be mislabelled.
      source: { type: String, enum: ['upload', 'google'] },
    },
    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
      index: true,
    },

    /**
     * Preferred interface language, so the choice follows the account across
     * devices. Deliberately without a default: "unset" is meaningful — it lets the
     * client adopt the language the visitor was already browsing in rather than
     * overwriting it with English the first time they sign in.
     *
     * NOT named `language`: this collection carries a text index (below), and
     * MongoDB reserves a top-level field of that exact name as the per-document
     * text-search language override. Storing `hi` or `ta` there makes every write
     * fail with "language override unsupported", because those are interface
     * languages, not stemmer languages. `en` would sneak through and mask the bug.
     */
    preferredLanguage: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
    },

    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },

    /**
     * Whether this account still owes us a code before it may sign in.
     *
     * This — not `isEmailVerified` — is what the login path reads, and the two are
     * deliberately not the same question. `isEmailVerified` asks whether the address
     * has ever been proven, and it is false for every account that predates OTP
     * sign-up; gating login on it would lock those owners out of accounts they have
     * been using for months. This flag is only ever set by a registration that was
     * actually handed a code, so nobody is asked for one they were never sent.
     */
    emailVerificationPending: { type: Boolean, default: false },

    /**
     * The live one-time code, or nothing. Only ever one per account: asking for a
     * new code retires the old one, so a mailbox holding five of our emails still
     * has exactly one code that opens the account — the last one.
     *
     * `codeHash` is hidden for the same reason a password is. `attempts` and
     * `resends` are the two budgets that make a six-digit secret safe: one caps
     * guessing, the other caps how much mail one pending sign-up can send.
     */
    otp: {
      codeHash: { type: String, select: false },
      channel: { type: String, enum: ['email', 'sms'] },
      purpose: { type: String, enum: ['email-verification'] },
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
      sentAt: Date,
      resends: { type: Number, default: 0 },
    },

    /**
     * Consecutive failed password attempts, and how long the account stays closed
     * to them once that runs out. Both are hidden: whether an account is currently
     * locked is exactly what an attacker probing for valid emails wants to learn.
     */
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },

    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date, select: false },

    lastLoginAt: Date,
    /**
     * Refresh tokens used to live here as a capped array of hashes. They now live in
     * the `sessions` collection, one document per signed-in device, which is what
     * lets the account holder see and revoke each one individually — an array of
     * opaque hashes could only ever be dropped wholesale.
     */
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.otp;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

userSchema.index({ name: 'text', email: 'text' });
userSchema.index({ createdAt: -1 });

/**
 * Whether the account can sign in with email + password. `password` is select:false,
 * so the provider list — not the field — is the reliable signal, and every write that
 * sets a password adds 'local' to keep the two in step.
 */
userSchema.virtual('hasPassword').get(function hasPassword() {
  return this.authProviders?.includes('local') ?? false;
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.bcryptRounds);
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000); // guard token race
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return false; // Google-only account: nothing to compare against
  return bcrypt.compare(candidate, this.password);
};

/**
 * A hash of nothing anyone can log in with, compared against when the submitted
 * email matches no account. Without it a miss returns as fast as the lookup while
 * a hit pays for bcrypt, and that difference alone tells an attacker which
 * addresses are registered — the thing every message in the login path is
 * carefully worded to avoid revealing.
 *
 * Built on first use rather than at import, and asynchronously.
 * `bcrypt.hashSync` at module scope is a full work factor's worth of arithmetic
 * with nothing else able to run — it lands during boot, before the process is
 * even listening, which on a fraction of a core is time added to a cold start
 * that the first request is already waiting through. The async form yields
 * between rounds, and by deferring it the cost falls on the first sign-in
 * against an unknown address instead of on every deploy. Cached from then on:
 * the point is a comparison that costs what a real one costs, not a fresh hash.
 *
 * The promise is what is cached, not the hash: two sign-ins arriving together
 * before it exists then share the one computation rather than each paying for
 * their own — which on this budget is the whole saving, twice over.
 */
let dummyHash = null;

userSchema.statics.burnPasswordCompare = function burnPasswordCompare(candidate) {
  dummyHash ||= bcrypt.hash('login-timing-equaliser', env.bcryptRounds);
  return dummyHash.then((hash) => bcrypt.compare(String(candidate ?? ''), hash));
};

/** Whether the account is currently closed to password sign-in. */
userSchema.virtual('isLocked').get(function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

/**
 * Counts a wrong password against the account.
 *
 * @returns {Promise<{attempts: number, remaining: number, justLocked: boolean,
 *   lockUntil: Date|null}>} where it left the count. `justLocked` marks the one
 *   attempt that tripped the lock, which is the only moment worth emailing the
 *   owner about; `remaining` is how many guesses are left before that happens,
 *   which is what the sign-in form counts down.
 */
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  const { maxAttempts, lockMinutes } = env.login;

  // A lock that has already run out is not carried forward: the next wrong
  // password starts a fresh count rather than re-locking on the old total.
  if (this.lockUntil && this.lockUntil.getTime() <= Date.now()) {
    await this.constructor.updateOne(
      { _id: this._id },
      { $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } }
    );
    return { attempts: 1, remaining: maxAttempts - 1, justLocked: false, lockUntil: null };
  }

  const attempts = (this.loginAttempts || 0) + 1;
  const locking = attempts >= maxAttempts;
  const lockUntil = locking ? new Date(Date.now() + lockMinutes * 60 * 1000) : null;

  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        loginAttempts: attempts,
        ...(locking ? { lockUntil } : {}),
      },
    }
  );

  return {
    attempts,
    remaining: Math.max(0, maxAttempts - attempts),
    justLocked: locking,
    lockUntil,
  };
};

/** Clears the count — on a correct password, and on a completed password reset. */
userSchema.statics.clearLoginAttempts = function clearLoginAttempts(userId) {
  return this.updateOne({ _id: userId }, { $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });
};

/** True when the password changed after the JWT was issued. */
userSchema.methods.passwordChangedAfter = function passwordChangedAfter(jwtIssuedAtSeconds) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > jwtIssuedAtSeconds;
};

/**
 * Records that this account now has a password of its own. Google sign-in stays
 * available — the two providers coexist, and the Google avatar is left untouched.
 */
userSchema.methods.enableLocalLogin = function enableLocalLogin() {
  if (!this.authProviders.includes('local')) this.authProviders.push('local');
};

/* ------------------------------------------------------------------ *
 * Email verification — the one-time code a new sign-up types back
 * ------------------------------------------------------------------ */

/**
 * Only the digest is stored, exactly as for a password reset token: a database
 * dump must not hand over live codes. SHA-256 rather than bcrypt because this
 * secret defends itself by expiring in minutes and answering five guesses, not by
 * being expensive to hash — and the login path already pays for one bcrypt.
 */
const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

/**
 * Mints a fresh code and retires whatever came before it.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.resend] Counts against the resend budget. A first code
 *   for a sign-up starts that budget at zero; every later one spends from it.
 * @returns {string} The plain code — emailed, never stored.
 */
userSchema.methods.createEmailOtp = function createEmailOtp({ resend = false } = {}) {
  const { length, expiryMinutes } = env.otp;

  // randomInt, not Math.random: the code is a credential, and it is short enough
  // that a predictable generator would be guessable outright. Zero-padded, so
  // `000123` stays six digits rather than becoming three.
  const code = String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');

  this.otp = {
    codeHash: hashOtp(code),
    channel: 'email',
    purpose: 'email-verification',
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    // A new code gets a clean attempt budget; that is what makes "request a new
    // code" the honest way out of having burnt the guesses on the old one.
    attempts: 0,
    sentAt: new Date(),
    resends: resend ? (this.otp?.resends || 0) + 1 : 0,
  };

  return code;
};

/** Seconds still to wait before another code may be asked for; 0 once it may. */
userSchema.methods.otpResendWaitSeconds = function otpResendWaitSeconds() {
  const sentAt = this.otp?.sentAt;
  if (!sentAt) return 0;
  const elapsed = (Date.now() - sentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(env.otp.resendCooldownSeconds - elapsed));
};

/** Whether this sign-up has already spent its allowance of codes. */
userSchema.methods.otpResendsExhausted = function otpResendsExhausted() {
  return (this.otp?.resends || 0) >= env.otp.maxResends;
};

/**
 * Checks a submitted code and spends one of the account's guesses.
 *
 * Requires `otp.codeHash`, which is `select: false` — a document loaded without it
 * would compare against nothing and reject every code, so callers must ask for it
 * by name. The write is unconditional and immediate: an attempt that is not
 * recorded until the end of the request is an attempt that parallel guesses can
 * ride over.
 *
 * @returns {Promise<{ok: boolean, reason?: 'no-code'|'expired'|'exhausted'|'mismatch',
 *   remaining: number}>}
 */
userSchema.methods.verifyEmailOtp = async function verifyEmailOtp(code) {
  const { maxAttempts } = env.otp;
  const otp = this.otp;

  if (!otp?.codeHash || !otp.expiresAt) return { ok: false, reason: 'no-code', remaining: 0 };
  if (otp.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired', remaining: 0 };
  if ((otp.attempts || 0) >= maxAttempts) return { ok: false, reason: 'exhausted', remaining: 0 };

  const submitted = hashOtp(String(code || '').trim());
  // Constant time, so the response cannot be timed digit by digit. Both sides are
  // fixed-length hex digests, which is what makes the lengths safe to assume.
  const match = crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(otp.codeHash));

  if (match) return { ok: true, remaining: maxAttempts - (otp.attempts || 0) };

  const attempts = (otp.attempts || 0) + 1;
  await this.constructor.updateOne({ _id: this._id }, { $set: { 'otp.attempts': attempts } });
  this.otp.attempts = attempts;

  return { ok: false, reason: 'mismatch', remaining: Math.max(0, maxAttempts - attempts) };
};

/**
 * Records that the address is proven: the code is spent and the gate comes down.
 *
 * Written straight through rather than via `save()`, because the code has to be
 * *gone* — assigning `undefined` to a nested path leaves the stored subdocument
 * exactly where it was, and a spent code that survives in the database is a spent
 * code that can be replayed. `$unset` is the only thing that removes it.
 */
userSchema.methods.markEmailVerified = async function markEmailVerified() {
  await this.constructor.updateOne(
    { _id: this._id },
    { $set: { isEmailVerified: true, emailVerificationPending: false }, $unset: { otp: 1 } }
  );
  this.isEmailVerified = true;
  this.emailVerificationPending = false;
  this.otp = undefined;
};

userSchema.methods.createPasswordResetToken = function createPasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
  return rawToken; // emailed to the user; only the hash is stored
};

module.exports = mongoose.model('User', userSchema);
