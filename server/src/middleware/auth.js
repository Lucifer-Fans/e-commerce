const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { inactiveAccountError } = require('../utils/accountStatus');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');
const sessionService = require('../services/session.service');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

/** Wording that tells the user what actually happened to their session. */
const SESSION_GONE = {
  revoked: 'You were signed out from this device',
  expired: 'Session expired, please log in again',
  inactive: 'Session expired after a long period of inactivity',
  unknown: 'Session is no longer valid, please log in again',
};

/** Requires a valid access token and an active user. */
const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Please log in to continue');

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.accessSecret);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token'
    );
  }

  const user = await User.findById(decoded.sub).select('+passwordChangedAt');
  if (!user) throw ApiError.unauthorized('This account no longer exists');

  /**
   * Every closed state, not just the blocked one.
   *
   * This is the check that makes deactivation hold against a direct API call: the
   * sessions are revoked the instant an account closes, but an access token
   * already in flight is a bearer credential nobody can recall, and it stays
   * signable for up to its fifteen minutes. Reading the live status on every
   * request is what closes that window to zero.
   */
  const closed = inactiveAccountError(user);
  if (closed) throw closed;
  if (user.passwordChangedAfter(decoded.iat)) {
    throw ApiError.unauthorized('Password was changed recently, please log in again');
  }

  /**
   * The session behind this token has to still be live, and this is also where its
   * "last active" stamp is kept current. Revoking a device therefore takes effect on
   * its next request instead of whenever its access token would have lapsed.
   *
   * Tokens minted before sessions existed carry no `sid`. They are honoured until
   * they expire on their own — no more than the access-token lifetime — so shipping
   * this does not sign the whole user base out.
   */
  if (decoded.sid) {
    const session = await sessionService.touch(decoded.sid);
    if (!session) {
      throw ApiError.unauthorized(SESSION_GONE[await sessionService.explain(decoded.sid)]);
    }
    req.sessionId = decoded.sid;
    req.session = session;
  }

  req.user = user;
  next();
});

/** Attaches req.user when a token is present, but never rejects. */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret);
    const user = await User.findById(decoded.sub);
    if (!user || user.status !== 'active') return next();

    // A revoked device must not keep browsing as its old owner — a signed-out phone
    // would otherwise still see that account's prices and cart hints.
    if (decoded.sid && !(await sessionService.touch(decoded.sid))) return next();

    req.user = user;
    req.sessionId = decoded.sid;
  } catch {
    /* anonymous request — carry on */
  }
  next();
});

const restrictTo =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

module.exports = { protect, optionalAuth, restrictTo, adminOnly: restrictTo('admin') };
