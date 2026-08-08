const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const sessionService = require('./session.service');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Both tokens carry `sid`, the id of the login session they belong to.
 *
 * That single claim is what turns "log out from this device" into something that
 * takes effect immediately: the auth middleware checks the session on every request,
 * so a revoked device stops working on its next call rather than when its access
 * token happens to lapse.
 */
const signAccessToken = (user, sessionId) =>
  jwt.sign({ sub: user._id.toString(), role: user.role, sid: sessionId }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires,
  });

const signRefreshToken = (user, sessionId) =>
  jwt.sign({ sub: user._id.toString(), type: 'refresh', sid: sessionId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });

const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

/** When a token actually runs out, read back from what was signed rather than re-derived. */
const expiryOf = (token) => {
  const { exp } = jwt.decode(token) || {};
  return exp ? new Date(exp * 1000) : new Date(Date.now() + 30 * 86400 * 1000);
};

/**
 * Signs a user in on this device: mints a token pair and records the session behind
 * it. Every login path (password, Google, admin, password reset) goes through here,
 * which is why every login shows up on the devices screen.
 *
 * @returns {{ accessToken: string, refreshToken: string, session: object }}
 */
async function issueTokens(user, { req, signInMethod = 'password' } = {}) {
  const sessionId = sessionService.newSessionId();

  const accessToken = signAccessToken(user, sessionId);
  const refreshToken = signRefreshToken(user, sessionId);

  const session = await sessionService.create({
    userId: user._id,
    sessionId,
    refreshToken,
    expiresAt: expiryOf(refreshToken),
    signInMethod,
    req,
  });

  await user.constructor.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return { accessToken, refreshToken, session };
}

/**
 * Rotates the pair for a session that is already established — the refresh path.
 * The old refresh token is burned in the same update that stores the new one, so a
 * replayed token finds nothing to match and the session is treated as compromised.
 *
 * @returns {Promise<{ accessToken, refreshToken, session } | null>} null if the
 *   presented token is no longer the session's own.
 */
async function rotateTokens(user, sessionId, presentedToken) {
  const accessToken = signAccessToken(user, sessionId);
  const refreshToken = signRefreshToken(user, sessionId);

  const session = await sessionService.rotate({
    sessionId,
    presentedToken,
    nextToken: refreshToken,
    expiresAt: expiryOf(refreshToken),
  });

  if (!session) return null;
  return { accessToken, refreshToken, session };
}

/** Cookie options shared by login/refresh/logout so they always match. */
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
});

module.exports = {
  hash,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  expiryOf,
  issueTokens,
  rotateTokens,
  refreshCookieOptions,
};
