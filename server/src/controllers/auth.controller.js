const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  suspendedError,
  inactiveAccountError,
  isSelfDeactivated,
} = require('../utils/accountStatus');
const { sendSuccess } = require('../utils/apiResponse');
const { User, Cart, Wishlist, ReactivationRequest } = require('../models');
const tokenService = require('../services/token.service');
const sessionService = require('../services/session.service');
const mailService = require('../services/mail.service');
const audit = require('../services/accountAudit.service');
const googleService = require('../services/google.service');
const broadcast = require('../realtime/broadcast');
const logger = require('../utils/logger');
const env = require('../config/env');

const authPayload = (user, accessToken, sessionId) => ({
  user: user.toJSON(),
  accessToken,
  expiresIn: env.jwt.accessExpires,
  // Which device session this token belongs to. The client keeps it so the devices
  // screen can mark "this device", and so a revoke broadcast aimed at this session
  // is recognised as its own.
  sessionId,
});

/**
 * The session this request belongs to. `protect` has normally already resolved it
 * from the access token; the refresh cookie is the fallback for the one case it
 * cannot — logging out with an access token that has already expired.
 */
function readSessionId(req) {
  if (req.sessionId) return req.sessionId;
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) return null;
  try {
    return tokenService.verifyRefreshToken(token).sid || null;
  } catch {
    return null;
  }
}

/**
 * Every route that hands out a token pair does the same three things: mint them,
 * record the device session behind them, and set the refresh cookie. Keeping that in
 * one place is what guarantees no login path can quietly skip the session record.
 */
async function startSession(req, res, user, { signInMethod = 'password' } = {}) {
  const { accessToken, refreshToken, session } = await tokenService.issueTokens(user, {
    req,
    signInMethod,
  });
  res.cookie('refreshToken', refreshToken, tokenService.refreshCookieOptions());

  // Any other device already on this account refreshes its devices list.
  broadcast.sessionsChanged(user._id, 'created');

  return { accessToken, sessionId: session.sessionId };
}

/* ------------------------------------------------------------------ *
 * Email verification
 *
 * A sign-up does not become a session until the address answers back. The
 * account row is written first — it has to be, since the code lives on it —
 * but it carries `emailVerificationPending`, which every way in refuses.
 * ------------------------------------------------------------------ */

/**
 * Mints a code, stores it, and mails it. Never throws on a mail failure: the
 * caller decides what that means, since a dev box with no SMTP wants the code
 * back on the response while production wants an error.
 *
 * @returns {Promise<{code: string, sent: boolean}>}
 */
async function issueEmailOtp(user, { resend = false } = {}) {
  const code = user.createEmailOtp({ resend });
  // Nothing else on the document is being written here, and `save()` would drag
  // the whole thing (and its validators) along for a field the user never touched.
  await User.updateOne({ _id: user._id }, { $set: { otp: user.otp } });

  const startedAt = Date.now();

  // `sendEmailVerificationEmail` already answers false rather than throwing, and
  // caps how long it can take (see mail.service). This catch is the last resort
  // for a failure *before* the transport is reached — a template that throws,
  // say — and it logs rather than swallowing: a silent `catch(() => false)` here
  // is how a broken relay used to leave nothing at all behind to look at.
  const sent = await mailService
    .sendEmailVerificationEmail({
      to: user.email,
      name: user.name,
      code,
      minutes: env.otp.expiryMinutes,
    })
    .catch((err) => {
      logger.error(`Could not compose verification email for ${user.email}: ${err.message}\n${err.stack}`);
      return false;
    });

  const took = Date.now() - startedAt;
  if (!sent) {
    logger.error(
      `Verification code for ${user.email} was generated but not delivered (mail step took ${took}ms). ` +
        `The account stays pending; the shopper can retry or use resend.`
    );
  } else if (took > 5000) {
    // Not a failure, but the sign-up is now within sight of the client's own
    // timeout — worth seeing in the log before it becomes one.
    logger.warn(`Verification email to ${user.email} took ${took}ms — SMTP is running slow.`);
  }

  return { code, sent };
}

/**
 * The same mechanics as `issueEmailOtp`, for a code that is not about a sign-up.
 *
 * Deactivating and re-activating both need a one-time code, and both need it to
 * behave exactly as the sign-up code does — one live code per account, a clean
 * attempt budget, a capped resend allowance. What differs is the purpose stamped
 * on it and which template carries it, so those are the two things the caller
 * supplies and everything else is shared.
 *
 * Never throws on a mail failure, for the reason given on `issueEmailOtp`: a dev
 * box with no SMTP wants the code back on the response, production wants an error,
 * and only the caller knows which it is.
 *
 * @returns {Promise<{code: string, sent: boolean}>}
 */
async function issueAccountOtp(user, { purpose, resend = false, send: sendCode }) {
  const code = user.createEmailOtp({ resend, purpose });
  await User.updateOne({ _id: user._id }, { $set: { otp: user.otp } });

  const sent = await sendCode(code).catch((err) => {
    logger.error(`Could not compose ${purpose} email for ${user.email}: ${err.message}`);
    return false;
  });

  if (!sent) {
    logger.error(
      `A ${purpose} code for ${user.email} was generated but not delivered. Nothing has changed ` +
        `on the account; the code can be requested again.`
    );
  }

  return { code, sent };
}

/**
 * Turns a rejected code into the answer the caller sends back, shared by every
 * screen that asks for one so the wording and the tags cannot drift apart.
 *
 * A wrong code with guesses left is the only case worth distinguishing, because
 * it is the only one where trying again is the right move. Expired, exhausted and
 * simply-gone all get one answer, because there is one thing to do about all
 * three.
 */
function otpError(result) {
  if (result.reason === 'mismatch' && result.remaining > 0) {
    return new ApiError(
      400,
      `That code is not correct. ${plural(result.remaining, 'attempt')} left before you will ` +
        `need a new one.`,
      { code: 'OTP_INVALID' }
    );
  }
  return new ApiError(
    400,
    result.reason === 'expired'
      ? 'This code has expired. Request a new one and we will send it straight away.'
      : 'This code can no longer be used. Request a new one and we will send it straight away.',
    { code: result.reason === 'expired' ? 'OTP_EXPIRED' : 'OTP_UNUSABLE' }
  );
}

/**
 * Enough of an address to recognise, not enough to learn.
 *
 * The reactivation screens are reached without a session, so they cannot simply
 * print the address the way the account pages do — the person holding the link
 * has proven they can read that inbox, which is not the same as having known
 * what was in it. Two characters is the balance the rest of the industry has
 * settled on: an owner recognises their own address instantly, and a stranger
 * gains nothing they could type into a login form.
 */
function maskEmail(address) {
  const [local, domain] = String(address).split('@');
  if (!domain) return address;
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

/** What a client needs to render the code screen: where it went and how long it lasts. */
const otpPayload = (user, { code, sent }) => ({
  email: user.email,
  codeLength: env.otp.length,
  expiresInMinutes: env.otp.expiryMinutes,
  resendAvailableInSeconds: env.otp.resendCooldownSeconds,
  // Dev convenience, exactly as forgot-password surfaces its link: without SMTP
  // wired up there is otherwise no way to get past this screen locally.
  ...(!sent && !env.isProd ? { devOtp: code } : {}),
});

/**
 * Refuses a sign-in whose address has never answered its code, and sends a fresh
 * one on the way out — whoever got this far knows the password, and the code they
 * were mailed at registration has very likely expired since. The cooldown still
 * applies, so repeated logins cannot be used to mail an address on demand.
 *
 * Every caller runs this *after* the password has been checked: refusing earlier
 * would turn either sign-in form into a way of asking which addresses have a
 * sign-up waiting on them.
 */
async function requireVerifiedEmail(user) {
  if (!user.emailVerificationPending) return;

  if (user.otpResendWaitSeconds() === 0 && !user.otpResendsExhausted()) {
    await issueEmailOtp(user, { resend: true }).catch(() => {});
  }

  throw ApiError.forbidden(
    `Your email address hasn't been verified yet. Enter the code we sent to ${user.email} to ` +
      `finish setting up your account.`,
    'EMAIL_NOT_VERIFIED'
  );
}

/** POST /auth/register — creates the account and mails a code. No session yet. */
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  const address = email.toLowerCase();

  const existing = await User.findOne({ email: address });

  /**
   * An account the owner closed still owns its address. Letting a fresh sign-up
   * take it would hand a stranger — or the same person forgetting they had one —
   * a brand-new account on an address whose order history, addresses and reviews
   * all belong to the closed one, and it would quietly make deactivation a way of
   * abandoning a record rather than closing it.
   *
   * The refusal is tagged so both front-ends can offer the one thing that
   * actually helps: mail a reactivation link to the address just typed. It is not
   * an enumeration leak the register form does not already have — this form
   * answers "that address is taken" for every other account too.
   */
  if (existing && isSelfDeactivated(existing)) {
    await audit.record(existing, 'registration-blocked', {
      req,
      summary: 'Sign-up refused: the address belongs to a deactivated account',
      meta: { status: existing.status },
    });
    throw new ApiError(
      409,
      existing.status === 'reactivation-pending'
        ? 'An account with this email already exists and its reactivation request is being reviewed.'
        : 'An account with this email already exists but has been deactivated.',
      { code: existing.status === 'reactivation-pending' ? 'REACTIVATION_PENDING' : 'ACCOUNT_DEACTIVATED' }
    );
  }

  /**
   * A suspended address is not free either, and answering it with the bare "that
   * address is taken" is what sent people round the loop the deactivated branch
   * above was written to end: the sign-in form tells them the account is
   * suspended, the sign-up form tells them the address is taken, and neither says
   * the one useful thing — that a person has to lift it.
   *
   * So it is answered with the same sentence a sign-in gets, reason included, and
   * tagged so the form can offer the way out. Nothing is disclosed that the reply
   * below does not already disclose to the same request.
   */
  if (existing && existing.status === 'blocked') {
    await audit.record(existing, 'registration-blocked', {
      req,
      summary: 'Sign-up refused: the address belongs to a suspended account',
      meta: { status: existing.status },
    });
    const reason = existing.blockedReason?.trim();
    throw new ApiError(
      409,
      reason
        ? `An account with this email already exists but has been suspended due to ${reason}.`
        : 'An account with this email already exists but has been suspended.',
      { code: 'ACCOUNT_SUSPENDED' }
    );
  }

  if (existing && !existing.emailVerificationPending) {
    throw ApiError.conflict('An account with this email already exists');
  }

  /**
   * A sign-up that was never verified is not yet anybody's account — no one has
   * proven they own the inbox, so there is nothing on it worth protecting. Rather
   * than let a half-finished (or malicious) registration squat an address forever,
   * the details are simply replaced and a fresh code goes out. The real owner of
   * the inbox is the only one who can ever complete either attempt.
   */
  const user = existing || new User({ email: address });
  user.name = name;
  user.phone = phone;
  user.password = password;
  user.isEmailVerified = false;
  user.emailVerificationPending = true;

  /**
   * The account row and the two empty collections beneath it. Both steps are
   * wrapped so a storage failure is *named* in the log — a bare driver message
   * arriving at the error handler says "MongoServerError" and nothing about which
   * half of a sign-up it came from. The rethrow is what the client sees: a
   * write that did not happen must not be answered with a 201.
   */
  try {
    await user.save();
  } catch (err) {
    logger.error(`Registration failed saving account ${address}: ${err.message}\n${err.stack}`);
    throw err;
  }

  // Give every new shopper an empty cart + wishlist so later writes are pure
  // updates. Upserted rather than created: a repeated sign-up on the same pending
  // account already has both, and a duplicate-key error there would fail a
  // registration that is otherwise perfectly fine.
  try {
    await Promise.all([
      Cart.updateOne({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true }),
      Wishlist.updateOne({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true }),
    ]);
  } catch (err) {
    logger.error(
      `Registration for ${address} could not create cart/wishlist: ${err.message}\n${err.stack}`
    );
    throw err;
  }

  // Deliberately no `userChanged` broadcast here. A pending sign-up is not yet an
  // account anybody can see: it is invisible to the admin users list (which filters
  // pending rows out) and to the dashboard counts, so announcing it would only make
  // an open Users screen refetch a list that cannot have changed. The 'created'
  // event is fired by verify-email instead, at the moment the row becomes real.

  const issued = await issueEmailOtp(user);

  // In production a code that never left the building leaves the shopper staring
  // at a screen asking for something they will never receive; say so instead. The
  // account stays pending, so trying again picks up exactly where this left off.
  if (!issued.sent && env.isProd) {
    throw ApiError.serviceUnavailable(
      'We could not send your verification code right now. Please try again in a few minutes.'
    );
  }

  return sendSuccess(res, {
    statusCode: 201,
    message: `We've sent a ${env.otp.length}-digit verification code to ${user.email}.`,
    data: otpPayload(user, issued),
  });
});

/**
 * POST /auth/verify-email — the code, and the session it earns.
 *
 * This is the only route that turns a registration into a signed-in account, so
 * it is where the checks a login would have made are repeated: a blocked or
 * locked account does not get a way in through the sign-up door.
 */
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+otp.codeHash +loginAttempts +lockUntil'
  );

  if (!user) {
    throw ApiError.badRequest('We could not find a sign-up waiting for that email address.');
  }
  if (!user.emailVerificationPending) {
    throw new ApiError(400, 'This email is already verified — please log in.', {
      code: 'ALREADY_VERIFIED',
    });
  }
  const closed = inactiveAccountError(user);
  if (closed) throw closed;
  if (user.isLocked) throw lockedError(minutesLeft(user.lockUntil));

  const result = await user.verifyEmailOtp(otp);

  if (!result.ok) throw otpError(result);

  await user.markEmailVerified();

  const { accessToken, sessionId } = await startSession(req, res, user);

  // 'created', not 'updated': as far as every admin-facing view is concerned this
  // account comes into existence here, because that is the first moment it passes
  // the verified filter those views query behind.
  broadcast.userChanged('created', user);

  return sendSuccess(res, {
    message: 'Email verified — welcome aboard!',
    data: authPayload(user, accessToken, sessionId),
  });
});

/**
 * POST /auth/resend-otp
 *
 * Answers the same way whether or not there is a sign-up behind the address —
 * this endpoint takes an email and nothing else, so a distinct "no such pending
 * account" would turn it into a free account-enumeration oracle. The cooldown and
 * the resend budget are the two things it does report, since both are about a
 * request the caller has already proven they can make.
 */
exports.resendEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  const generic = `If a sign-up is waiting on that address, a new code is on its way.`;

  if (!user || !user.emailVerificationPending || user.status !== 'active') {
    return sendSuccess(res, {
      message: generic,
      data: { email: email.toLowerCase(), resendAvailableInSeconds: env.otp.resendCooldownSeconds },
    });
  }

  const wait = user.otpResendWaitSeconds();
  if (wait > 0) {
    throw new ApiError(429, `Please wait ${plural(wait, 'second')} before asking for a new code.`, {
      code: 'OTP_COOLDOWN',
    });
  }
  if (user.otpResendsExhausted()) {
    throw new ApiError(
      429,
      'You have requested several codes already. Please try registering again in a little while.',
      { code: 'OTP_RESEND_LIMIT' }
    );
  }

  const issued = await issueEmailOtp(user, { resend: true });

  if (!issued.sent && env.isProd) {
    throw ApiError.serviceUnavailable(
      'We could not send your verification code right now. Please try again in a few minutes.'
    );
  }

  return sendSuccess(res, { message: generic, data: otpPayload(user, issued) });
});

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Whole minutes still to run on a lock, never rounded down to a misleading zero. */
const minutesLeft = (lockUntil) => Math.max(1, Math.ceil((lockUntil.getTime() - Date.now()) / 60000));

/**
 * Shared by every way in, so a locked account gets one answer and one wording no
 * matter which button was pressed.
 */
const lockedError = (minutes) =>
  ApiError.locked(
    `This account is locked after too many failed attempts. Try again in ${plural(minutes, 'minute')}, ` +
      `or reset your password to sign in right away (link sent to your email).`,
    'ACCOUNT_LOCKED'
  );

/**
 * The one place an email and password are checked, shared by the storefront and
 * admin sign-ins so the two can never drift apart on lockout or on wording.
 *
 * `revealMissing` decides what an unknown address gets. The storefront sets it so
 * shoppers who never finished signing up are sent to the register form instead of
 * re-typing a password that was never stored; the admin sign-in leaves it off, so
 * an address we have never seen there answers with the same message and takes the
 * same time as a wrong password and the endpoint will not confirm which staff
 * emails exist. What neither hides is the lockout itself: once an account
 * is a few wrong guesses from being closed, its own owner — overwhelmingly who
 * this is — is told how many are left and, afterwards, how long the wait is and
 * that a password reset ends it early. A silent lock reads as a broken login and
 * sends people to support; this sends them to the reset link instead.
 *
 * The trade is deliberate: someone who already knows an address can now learn it
 * is registered by burning attempts against it. `warnAfter` keeps that costly,
 * the per-IP `authLimiter` keeps it slow, and the lock still holds regardless.
 * `revealMissing` widens that same trade for shopper accounts — registration
 * already tells anyone whether an address is taken, so the storefront login is
 * not giving away anything the sign-up form does not.
 */
async function verifyCredentials(email, password, { revealMissing = false } = {}) {
  const { lockMinutes, maxAttempts, warnAfter } = env.login;
  const invalid = () => ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+password +loginAttempts +lockUntil'
  );

  if (!user) {
    // The storefront follows this with its own link to /register; the sentence
    // stands on its own for anything calling the API directly.
    if (revealMissing) {
      throw ApiError.unauthorized('No account found with this email address.', 'NO_ACCOUNT');
    }
    await User.burnPasswordCompare(password);
    throw invalid();
  }

  // Checked before the password so a locked account cannot be probed further, and
  // so the guesses arriving during a lock do not push its expiry back.
  if (user.isLocked) {
    await User.burnPasswordCompare(password);
    throw lockedError(minutesLeft(user.lockUntil));
  }

  if (!(await user.comparePassword(password))) {
    const { remaining, justLocked } = await user.registerFailedLogin();

    if (justLocked) {
      mailService
        .sendAccountLockedEmail({ to: user.email, name: user.name, minutes: lockMinutes })
        .catch(() => {});
      throw lockedError(lockMinutes);
    }

    // Silent until the count reaches `warnAfter`; from there the form says how
    // much rope is left, so the lock never arrives as a surprise.
    if (maxAttempts - remaining >= warnAfter) {
      throw ApiError.unauthorized(
        `Invalid email or password. ${plural(remaining, 'attempt')} left before this account is ` +
          `locked for ${plural(lockMinutes, 'minute')}.`,
        'INVALID_CREDENTIALS_WARNING'
      );
    }

    throw invalid();
  }

  if (user.loginAttempts || user.lockUntil) await User.clearLoginAttempts(user._id);

  return user;
}

/**
 * The gate every sign-in door runs once the credentials have checked out.
 *
 * It sits *after* the password rather than before it for the same reason the
 * block check always has: an endpoint that reports an account's state before
 * proving who is asking is an endpoint that reports it to anyone. Google sign-in
 * is the exception in ordering only — the credential there is verified by Google
 * before we are ever called, so its check is the first thing that branch does.
 *
 * Every refusal is recorded. A run of blocked sign-ins on a closed account is
 * exactly the context an admin reviewing its reactivation request wants, and it
 * is the only trace those attempts would otherwise leave.
 */
async function refuseClosedAccount(user, req, method) {
  const error = inactiveAccountError(user);
  if (!error) return;

  if (isSelfDeactivated(user)) {
    await audit.record(user, 'login-blocked', {
      req,
      summary: `Sign-in refused (${method}) — account is ${user.status}`,
      meta: { method, status: user.status },
    });
  }

  throw error;
}

/* ------------------------------------------------------------------ *
 * Reactivation — the way back from an account its owner closed
 *
 * Four steps, and no two of them trust the one before on the client's
 * word alone: the link is a hashed single-use token, the code is minted
 * against the account rather than the link, and the submission re-checks
 * both plus the details the account actually holds.
 * ------------------------------------------------------------------ */

/** Answers the same way whether or not the address belongs to a closed account. */
const REACTIVATION_GENERIC =
  'If that address belongs to a deactivated account, we have emailed a re-activation link to it.';

/**
 * Finds the account a reactivation token names, or throws.
 *
 * Expiry is part of the query rather than a check after it, so a lapsed token is
 * indistinguishable from a wrong one — there is nothing to learn by presenting
 * an old link. The status is re-read every time because an admin may have
 * approved the account in the minutes since the link was mailed, and a token
 * that outlives the state it was issued for must not still be spendable.
 */
async function userForReactivationToken(rawToken) {
  const user = await User.findOne({
    reactivationToken: User.hashReactivationToken(rawToken),
    reactivationExpires: { $gt: new Date() },
  }).select('+reactivationToken +reactivationExpires +otp.codeHash');

  if (!user) {
    throw new ApiError(400, 'This re-activation link is invalid or has expired.', {
      code: 'REACTIVATION_LINK_INVALID',
    });
  }
  if (user.status === 'active') {
    throw new ApiError(400, 'This account is already active — please sign in.', {
      code: 'ALREADY_ACTIVE',
    });
  }
  if (user.status === 'blocked') throw suspendedError(user);

  return user;
}

/**
 * POST /auth/reactivation/request — email me a link.
 *
 * Reachable without a session, which is the whole point: the person asking
 * cannot sign in. That also makes it the one endpoint here an attacker can aim
 * at somebody else's inbox, so it is rate-limited, it answers identically for
 * every address, and the link it sends only ever goes to the registered address.
 */
exports.requestReactivation = asyncHandler(async (req, res) => {
  const address = String(req.body.email).toLowerCase();
  const user = await User.findOne({ email: address });

  if (!user || !isSelfDeactivated(user)) {
    return sendSuccess(res, { message: REACTIVATION_GENERIC, data: { email: address } });
  }

  /**
   * A request already with an admin is not restarted by mailing another link.
   * Someone waiting on a decision who presses this every morning would otherwise
   * be handed a fresh way to submit a second request each time, and the queue
   * fills with duplicates from one person waiting for news.
   */
  if (user.status === 'reactivation-pending') {
    return sendSuccess(res, {
      message:
        'Your re-activation request is already being reviewed. We will email you as soon as your ' +
        'account is active.',
      data: { email: address, pending: true },
    });
  }

  const rawToken = user.createReactivationToken();
  await user.save({ validateBeforeSave: false });

  const activateUrl = `${env.clientUrl}/reactivate/${rawToken}`;
  const sent = await mailService
    .sendReactivationLinkEmail({ to: user.email, name: user.name, activateUrl })
    .catch((err) => {
      logger.error(`Could not compose reactivation email for ${user.email}: ${err.message}`);
      return false;
    });

  await audit.record(user, 'reactivation-email-sent', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: sent ? 'Re-activation link emailed' : 'Re-activation link generated but not delivered',
    meta: { delivered: Boolean(sent) },
  });

  if (!sent && env.isProd) {
    throw ApiError.serviceUnavailable(
      'We could not send the re-activation email right now. Please try again in a few minutes.'
    );
  }

  return sendSuccess(res, {
    message: REACTIVATION_GENERIC,
    data: {
      email: address,
      // Dev convenience, exactly as forgot-password surfaces its link: without
      // SMTP wired up there is otherwise no way to reach the next screen locally.
      ...(!sent && !env.isProd ? { devReactivateUrl: activateUrl } : {}),
    },
  });
});

/**
 * POST /auth/reactivation/open — the link has been clicked.
 *
 * Returns only what the identity form needs to be answerable: the masked address
 * it will be checked against, and whether the account holds a mobile number the
 * requester will have to reproduce. The name is *not* returned — the next step
 * asks for it, and handing it over first would make that question worthless.
 */
exports.openReactivation = asyncHandler(async (req, res) => {
  const user = await userForReactivationToken(req.body.token);

  await audit.record(user, 'reactivation-link-opened', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: 'Re-activation link opened',
  });

  return sendSuccess(res, {
    message: 'Re-activation link verified',
    data: {
      email: maskEmail(user.email),
      requiresPhone: Boolean(user.phone),
      phoneHint: user.phone ? `•••••• ${user.phone.slice(-4)}` : null,
      deactivatedAt: user.deactivation?.at || null,
      codeLength: env.otp.length,
      expiresInMinutes: env.otp.expiryMinutes,
      resendAvailableInSeconds: env.otp.resendCooldownSeconds,
    },
  });
});

/**
 * POST /auth/reactivation/otp — send the code for the identity step.
 *
 * Separate from opening the link so a code is only minted when the requester has
 * actually reached the form that asks for it: a link opened by a mail client's
 * link-preview fetch must not burn a code and start a ten-minute clock nobody is
 * watching.
 */
exports.sendReactivationOtp = asyncHandler(async (req, res) => {
  const user = await userForReactivationToken(req.body.token);

  const wait = user.otp?.purpose === 'account-reactivation' ? user.otpResendWaitSeconds() : 0;
  if (wait > 0) {
    throw new ApiError(429, `Please wait ${plural(wait, 'second')} before asking for a new code.`, {
      code: 'OTP_COOLDOWN',
    });
  }
  if (user.otp?.purpose === 'account-reactivation' && user.otpResendsExhausted()) {
    throw new ApiError(
      429,
      'You have requested several codes already. Please start again from the link we emailed you.',
      { code: 'OTP_RESEND_LIMIT' }
    );
  }

  const issued = await issueAccountOtp(user, {
    purpose: 'account-reactivation',
    // A first code for this link starts the budget; every later one spends from it.
    resend: user.otp?.purpose === 'account-reactivation',
    send: (code) =>
      mailService.sendDeactivationOtpEmail({
        to: user.email,
        name: user.name,
        code,
        minutes: env.otp.expiryMinutes,
      }),
  });

  await audit.record(user, 'reactivation-otp-sent', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: 'Verification code sent for re-activation',
    meta: { delivered: issued.sent },
  });

  if (!issued.sent && env.isProd) {
    throw ApiError.serviceUnavailable(
      'We could not send your verification code right now. Please try again in a few minutes.'
    );
  }

  return sendSuccess(res, {
    message: `We've sent a ${env.otp.length}-digit code to your registered email address.`,
    data: otpPayload(user, issued),
  });
});

/**
 * POST /auth/reactivation/submit — the request itself.
 *
 * Three things have to line up: the link, the code, and the details the account
 * actually holds. None of the three is sufficient alone — the link proves access
 * to the inbox, the code proves that access is live right now, and the details
 * prove the person is the account holder rather than someone who has reached the
 * inbox. Only when all three agree does a request reach an admin.
 *
 * The token is spent whatever happens next, and the account moves to
 * `reactivation-pending`. It is *not* activated: that is a decision, and this
 * endpoint's job ends at putting a verified request in front of the person who
 * makes it.
 */
exports.submitReactivation = asyncHandler(async (req, res) => {
  const { token, otp, name, phone, message } = req.body;

  const user = await userForReactivationToken(token);

  // The code is checked before the details, so a stranger who has somehow reached
  // the inbox cannot use this form to probe the name on the account: without a
  // live code they never get as far as an answer about it.
  const result = await user.verifyEmailOtp(otp, 'account-reactivation');

  if (!result.ok) {
    await audit.record(user, 'deactivation-otp-failed', {
      actor: 'user',
      actorId: user._id,
      req,
      summary: `Re-activation code rejected (${result.reason})`,
      meta: { reason: result.reason, flow: 'reactivation' },
    });
    throw otpError(result);
  }

  /**
   * The details, compared the way a human would: case and spacing are not what
   * this question is about, and refusing "ananya sharma" for "Ananya Sharma"
   * fails the actual account holder while stopping nobody.
   */
  const normalise = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const confirmed = ['name'];

  if (normalise(name) !== normalise(user.name)) {
    throw new ApiError(400, 'The details you entered do not match our records.', {
      code: 'DETAILS_MISMATCH',
    });
  }
  if (user.phone) {
    if (String(phone || '').trim() !== user.phone) {
      throw new ApiError(400, 'The details you entered do not match our records.', {
        code: 'DETAILS_MISMATCH',
      });
    }
    confirmed.push('phone');
  }

  const now = new Date();

  // Spent before the request is written: a token that survives its own submission
  // is a token that can submit again, and the unique index below would then turn a
  // double-click into a 500 rather than a duplicate.
  await user.clearOtp();

  let request;
  try {
    request = await ReactivationRequest.create({
      user: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      deactivatedAt: user.deactivation?.at,
      deactivationReason: user.deactivation?.reason,
      requestedAt: now,
      message: message ? String(message).trim() : undefined,
      verification: {
        linkVerifiedAt: now,
        detailsConfirmedAt: now,
        emailOtpVerifiedAt: now,
        confirmedFields: confirmed,
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
      },
    });
  } catch (err) {
    // The partial unique index: a request from this account is already open. Two
    // submissions racing is the ordinary cause, and the honest answer to the
    // second is the same thing the first was told.
    if (err?.code === 11000) {
      throw new ApiError(
        409,
        'A re-activation request for this account is already being reviewed.',
        { code: 'REACTIVATION_PENDING' }
      );
    }
    throw err;
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: { status: 'reactivation-pending', reactivationRequestedAt: now },
      $unset: { reactivationToken: 1, reactivationExpires: 1 },
    }
  );
  user.status = 'reactivation-pending';

  await audit.record(user, 'reactivation-otp-verified', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: 'Identity verified for re-activation',
    meta: { confirmedFields: confirmed },
  });
  await audit.record(user, 'reactivation-requested', {
    actor: 'user',
    actorId: user._id,
    req,
    summary: 'Re-activation request submitted',
    meta: { requestId: String(request._id) },
  });

  mailService
    .sendReactivationSubmittedEmail({
      to: user.email,
      name: user.name,
      requestedAt: now,
      reason: user.deactivation?.reason,
    })
    .catch((err) => logger.error(`Reactivation acknowledgement failed: ${err.message}`));

  broadcast.reactivationRequestChanged('created', request);
  broadcast.userChanged('status', user);

  return sendSuccess(res, {
    statusCode: 201,
    message:
      'Your reactivation request has been submitted. Your account will be activated within 2-3 ' +
      'working days. We will send you an email once your account has been reactivated.',
    data: { status: 'pending', requestedAt: now },
  });
});

/** POST /auth/login */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await verifyCredentials(email, password, { revealMissing: true });
  await refuseClosedAccount(user, req, 'password');

  await requireVerifiedEmail(user);

  // Proof enough that this account has a password: repairs any record whose provider
  // list predates the flag (e.g. a Google account that reset its password earlier).
  if (!user.authProviders.includes('local')) {
    user.enableLocalLogin();
    await user.save({ validateBeforeSave: false });
  }

  const { accessToken, sessionId } = await startSession(req, res, user);

  return sendSuccess(res, { message: 'Logged in successfully', data: authPayload(user, accessToken, sessionId) });
});

/** POST /auth/google — exchanges a Google ID token for our own session. */
exports.googleLogin = asyncHandler(async (req, res) => {
  const profile = await googleService.verifyIdToken(req.body.credential);

  // `loginAttempts`/`lockUntil` are `select: false`, so they have to be asked for by
  // name — without them `isLocked` is always false here and Google sign-in walks
  // straight past the lock.
  let user = await User.findOne({
    $or: [{ googleId: profile.googleId }, { email: profile.email }],
  }).select('+loginAttempts +lockUntil');

  if (user) {
    /**
     * Checked here, before anything else this branch does, because Google sign-in
     * is the door a deactivated account is most likely to try: it needs no
     * password, and the profile it presents is genuinely theirs. Proving who you
     * are was never the question — the account is closed.
     */
    await refuseClosedAccount(user, req, 'google');

    // A lock closes the account, not just the password form. Google proves who is
    // knocking, but the whole point of the lock is that nobody gets in until it
    // runs out — otherwise any account with Google linked has a way around it.
    if (user.isLocked) throw lockedError(minutesLeft(user.lockUntil));

    // First Google sign-in on an existing email account: link the two.
    if (!user.googleId) {
      user.googleId = profile.googleId;
      if (!user.authProviders.includes('google')) user.authProviders.push('google');
    }
    // Google has already proven ownership of the address, which is exactly what a
    // pending code was going to ask for — so signing in this way *finishes* an
    // unverified sign-up rather than being blocked by it. Cleared below the save,
    // where the outstanding code can be removed from the document outright.
    user.isEmailVerified = true;
    const wasPending = user.emailVerificationPending;

    // Pull the latest profile picture on every sign-in, but never clobber a photo
    // the user uploaded themselves — theirs always wins once it exists.
    const uploadedByUser = Boolean(user.avatar?.publicId); // only our own uploads have one
    if (profile.picture && !uploadedByUser) {
      user.avatar = { url: profile.picture, source: 'google' };
    }

    await user.save({ validateBeforeSave: false });

    if (wasPending) await user.markEmailVerified();

    // Any sign-in that succeeds ends the run of failures, whichever door it came
    // through — otherwise a half-built count survives to shorten the next lockout.
    if (user.loginAttempts) await User.clearLoginAttempts(user._id);
  } else {
    user = await User.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      authProviders: ['google'],
      isEmailVerified: true,
      avatar: profile.picture ? { url: profile.picture, source: 'google' } : undefined,
    });
    await Promise.all([Cart.create({ user: user._id }), Wishlist.create({ user: user._id })]);
    broadcast.userChanged('created', user);
  }

  const { accessToken, sessionId } = await startSession(req, res, user, { signInMethod: 'google' });

  return sendSuccess(res, {
    message: 'Logged in with Google',
    data: authPayload(user, accessToken, sessionId),
  });
});

/** POST /auth/admin/login — same credentials, but rejects non-admins up front. */
exports.adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await verifyCredentials(email, password);
  if (user.role !== 'admin') throw ApiError.forbidden('This account does not have admin access');
  await refuseClosedAccount(user, req, 'password');
  // Staff accounts are made by other staff and are verified from birth; this only
  // ever fires for one that was promoted out of an unfinished storefront sign-up.
  await requireVerifiedEmail(user);

  const { accessToken, sessionId } = await startSession(req, res, user);

  return sendSuccess(res, { message: 'Welcome back', data: authPayload(user, accessToken, sessionId) });
});

/**
 * POST /auth/refresh
 *
 * Renews the pair in place: the session keeps its identity and its place on the
 * devices screen, and only the credential rotates.
 */
exports.refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) throw ApiError.unauthorized('No refresh token provided');

  let decoded;
  try {
    decoded = tokenService.verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  // Tokens issued before sessions existed carry no `sid`, so there is no device
  // record to renew. Signing in again is the only safe answer — and it is what
  // creates that record.
  if (!decoded.sid) throw ApiError.unauthorized('Please log in again to continue');

  const user = await User.findById(decoded.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Session is no longer valid');

  const rotated = await tokenService.rotateTokens(user, decoded.sid, token);

  if (!rotated) {
    /**
     * The token verified but is not the one this session is holding — either the
     * session was revoked, or an already-rotated token is being replayed. Both are
     * answered the same way: the whole session dies. A replay means someone else has
     * a copy, and refusing just this request would leave their copy usable.
     */
    await sessionService.revoke(decoded.sid, { reason: 'reuse-detected' });
    broadcast.sessionRevoked(user._id, { sessionIds: [decoded.sid], reason: 'reuse-detected' });
    res.clearCookie('refreshToken', { ...tokenService.refreshCookieOptions(), maxAge: undefined });
    throw ApiError.unauthorized('Session has been revoked, please log in again');
  }

  res.cookie('refreshToken', rotated.refreshToken, tokenService.refreshCookieOptions());

  return sendSuccess(res, {
    message: 'Session refreshed',
    data: authPayload(user, rotated.accessToken, decoded.sid),
  });
});

/** POST /auth/logout — ends this device's session only. */
exports.logout = asyncHandler(async (req, res) => {
  const sessionId = req.sessionId || readSessionId(req);

  if (sessionId && req.user) {
    await sessionService.revoke(sessionId, { userId: req.user._id, reason: 'logout' });
    broadcast.sessionsChanged(req.user._id, 'revoked', { sessionId });
  }

  res.clearCookie('refreshToken', { ...tokenService.refreshCookieOptions(), maxAge: undefined });
  return sendSuccess(res, { message: 'Logged out successfully' });
});

/** GET /auth/me — also names the session this request arrived on, so a page reload
 *  restores which device the client is looking at itself as. */
exports.me = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: 'Profile fetched',
    data: { user: req.user.toJSON(), sessionId: req.sessionId || null },
  })
);

/** POST /auth/forgot-password */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always answer 200 — revealing which emails exist is an enumeration leak.
  const genericMessage =
    'If an account exists for that email, a password reset link has been sent.';

  if (!user) return sendSuccess(res, { message: genericMessage });

  /**
   * A closed account gets the same generic answer and no email.
   *
   * Without this the reset flow is a complete bypass of everything deactivation
   * does: reset-password ends by handing out a session, so anyone who could reach
   * the inbox would be signed straight into an account that email and Google
   * sign-in both refuse. Whether that inbox belongs to the owner is beside the
   * point — coming back is a decision an admin makes, and it is made on the
   * reactivation queue, not by proving the same thing a reactivation link proves.
   */
  if (user.status !== 'active') return sendSuccess(res, { message: genericMessage });

  const rawToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.corsOrigins[0] || 'http://localhost:5173'}/reset-password/${rawToken}`;
  const sent = await mailService.sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
  });

  if (!sent && !env.isProd) {
    // Dev convenience: surface the link when SMTP isn't wired up yet.
    return sendSuccess(res, { message: genericMessage, data: { devResetUrl: resetUrl } });
  }
  return sendSuccess(res, { message: genericMessage });
});

/** POST /auth/reset-password/:token */
exports.resetPassword = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');

  /**
   * Belt and braces for the window between a link being mailed and the account
   * closing minutes later: forgot-password will not mint a token for a closed
   * account, but one already in an inbox has to be refused here too, since this
   * is the route that would otherwise return a session with it.
   */
  const closed = inactiveAccountError(user);
  if (closed) throw closed;

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // A Google-only account that sets a password gains email+password login without
  // losing Google sign-in. The avatar is deliberately left alone — a picture synced
  // from Google stays until the user replaces or removes it themselves.
  user.enableLocalLogin();
  await user.save();

  // Proving control of the inbox outranks a lockout: an owner locked out by someone
  // else's guessing gets back in through here without waiting the window out.
  await User.clearLoginAttempts(user._id);

  // Whoever reset the password owns the account from here; every device signed in
  // under the old one is signed out, this browser included, and replaced below.
  await sessionService.revokeAllForUser(user._id, { reason: 'password-reset' });
  broadcast.sessionsChanged(user._id, 'revoked-all');

  const { accessToken, sessionId } = await startSession(req, res, user);

  return sendSuccess(res, {
    message: 'Password reset successfully',
    data: authPayload(user, accessToken, sessionId),
  });
});

/**
 * POST /auth/set-password — first password for an account created through Google.
 * There is no current password to prove, so the live session is the proof; accounts
 * that already have one must use /auth/change-password.
 */
exports.setPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (user.password) {
    // Reachable only if the provider list drifted out of step; correct it so the
    // client re-renders as change-password rather than offering this route again.
    if (!user.authProviders.includes('local')) {
      user.enableLocalLogin();
      await user.save({ validateBeforeSave: false });
    }
    throw ApiError.badRequest('Your account already has a password. Use change password instead.');
  }

  user.password = req.body.password;
  user.enableLocalLogin();
  await user.save();

  // Other devices re-authenticate under the new credentials.
  await sessionService.revokeAllForUser(user._id, { reason: 'password-change' });
  broadcast.sessionsChanged(user._id, 'revoked-all');

  const { accessToken, sessionId } = await startSession(req, res, user);

  return sendSuccess(res, {
    message: 'Password created. You can now log in with your email and password.',
    data: authPayload(user, accessToken, sessionId),
  });
});

/** PATCH /auth/change-password */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user.password) {
    // Google-only account — there is nothing to verify against, so it must go
    // through the dedicated set-password route instead.
    throw ApiError.badRequest(
      'Your account signs in with Google. Create a password first to enable email login.'
    );
  }
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect');
  }

  user.password = newPassword;
  user.enableLocalLogin();
  await user.save();

  await sessionService.revokeAllForUser(user._id, { reason: 'password-change' });
  broadcast.sessionsChanged(user._id, 'revoked-all');

  const { accessToken, sessionId } = await startSession(req, res, user);

  return sendSuccess(res, {
    message: 'Password changed successfully',
    data: authPayload(user, accessToken, sessionId),
  });
});

/* ------------------------------------------------------------------ *
 * Devices — the sessions this account is signed in on
 * ------------------------------------------------------------------ */

/**
 * GET /auth/sessions
 *
 * Only ever the caller's own sessions: the filter is the authenticated user id, so
 * there is no id a client could pass to read somebody else's devices.
 */
exports.listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listForUser(req.user._id);
  const currentSessionId = readSessionId(req);

  return sendSuccess(res, {
    message: 'Sessions fetched',
    data: {
      sessions: sessions.map((s) => sessionService.toPublicJSON(s, currentSessionId)),
      currentSessionId,
    },
  });
});

/**
 * DELETE /auth/sessions/:sessionId — sign one device out.
 *
 * Revoking the session you are currently on is allowed and behaves exactly like
 * logging out, cookie and all; anything else would make "sign out my other laptop"
 * depend on which device you happened to open the screen from.
 */
exports.revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await sessionService.revoke(sessionId, {
    userId: req.user._id,
    reason: 'revoked-by-user',
  });
  if (!session) throw ApiError.notFound('That session no longer exists');

  broadcast.sessionRevoked(req.user._id, {
    sessionIds: [sessionId],
    reason: 'revoked-by-user',
    originSocketId: req.get('x-socket-id'),
  });
  broadcast.sessionsChanged(req.user._id, 'revoked');

  const isCurrent = sessionId === readSessionId(req);
  if (isCurrent) {
    res.clearCookie('refreshToken', { ...tokenService.refreshCookieOptions(), maxAge: undefined });
  }

  return sendSuccess(res, {
    message: isCurrent ? 'Logged out successfully' : 'Device signed out',
    data: { sessionId, wasCurrent: isCurrent },
  });
});

/**
 * DELETE /auth/sessions — sign out everywhere, this device included.
 *
 * Signing the current device out too is the point: this is the button someone
 * reaches for when they think the account is compromised, and leaving one live
 * session behind would only be right if they were certain this device is the safe
 * one. `?keepCurrent=true` is there for the milder "tidy up my old devices" case.
 */
exports.revokeAllSessions = asyncHandler(async (req, res) => {
  const keepCurrent = req.query.keepCurrent === 'true';
  const currentSessionId = readSessionId(req);

  const revoked = await sessionService.revokeAllForUser(req.user._id, {
    exceptSessionId: keepCurrent ? currentSessionId : undefined,
    reason: 'logout-all',
  });

  // No id list: "everything except this one, if any" covers both variants, and it
  // stays correct however many devices were live when the click landed.
  broadcast.sessionRevoked(req.user._id, {
    exceptSessionId: keepCurrent ? currentSessionId : null,
    reason: 'logout-all',
    originSocketId: req.get('x-socket-id'),
  });
  broadcast.sessionsChanged(req.user._id, 'revoked-all');

  if (!keepCurrent) {
    res.clearCookie('refreshToken', { ...tokenService.refreshCookieOptions(), maxAge: undefined });
  }

  return sendSuccess(res, {
    message: keepCurrent
      ? 'Signed out from all other devices'
      : 'Signed out from all devices',
    data: { revoked, keptCurrent: keepCurrent },
  });
});
