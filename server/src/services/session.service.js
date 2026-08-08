const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');
const Session = require('../models/Session');
const { parseUserAgent } = require('../utils/userAgent');
const geoService = require('./geo.service');

/**
 * Login-session bookkeeping.
 *
 * Everything that creates, renews, inspects or ends a device session goes through
 * here, so the rules — what a live session is, how long it survives idle, how many
 * an account may hold — are stated once. Controllers deal in sessions; only this
 * module and the token service know they are also a token store.
 */

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const newSessionId = () => crypto.randomUUID();

const idleCutoff = (now = new Date()) =>
  new Date(now.getTime() - env.session.inactivityDays * 86400 * 1000);

/** The filter every read of a usable session shares. */
const liveFilter = (now = new Date()) => ({
  status: 'active',
  expiresAt: { $gt: now },
  lastActiveAt: { $gt: idleCutoff(now) },
});

/**
 * Describes the device a request came from: what we can read from the headers, plus
 * an approximate location. Awaiting this is what makes the geo lookup worth having,
 * and it is bounded by `env.geoip.timeoutMs`.
 */
async function describeRequest(req) {
  const userAgent = String(req.headers?.['user-agent'] || '').slice(0, 512);
  const { name, type, vendor, model, browser, os } = parseUserAgent(userAgent);
  const { ip, location } = await geoService.locate(req);

  return {
    device: { name, type, vendor, model },
    browser,
    os,
    userAgent,
    ip,
    location: location || undefined,
    // The admin console and the storefront share this API; which one signed in is
    // part of what makes a session recognisable to its owner.
    client: req.headers?.['x-client'] === 'admin' ? 'admin' : 'storefront',
  };
}

/**
 * Records a fresh login. `sessionId` is minted by the caller because it has to be
 * signed into the tokens before this row can reference them.
 */
async function create({ userId, sessionId, refreshToken, expiresAt, signInMethod, req }) {
  const context = await describeRequest(req);

  const session = await Session.create({
    ...context,
    user: userId,
    sessionId,
    refreshTokenHash: hash(refreshToken),
    signInMethod,
    expiresAt,
    loginAt: new Date(),
    lastActiveAt: new Date(),
  });

  // Enforced after the fact so a legitimate new login is never the one refused —
  // the account's oldest idle device is signed out instead.
  await enforceLimit(userId, sessionId);

  return session;
}

/**
 * Rotates the stored credential after a refresh. Returns `null` when the presented
 * token is not the one this session is holding, which is the signal a caller needs
 * to treat the attempt as a replay.
 */
async function rotate({ sessionId, presentedToken, nextToken, expiresAt }) {
  const now = new Date();

  return Session.findOneAndUpdate(
    { sessionId, refreshTokenHash: hash(presentedToken), ...liveFilter(now) },
    {
      $set: {
        refreshTokenHash: hash(nextToken),
        expiresAt,
        lastActiveAt: now,
      },
    },
    { new: true }
  );
}

/**
 * Confirms a session is still usable and keeps `lastActiveAt` roughly current.
 *
 * Called on every authenticated request, so the write is throttled: a value the UI
 * renders as "Active now" or "2 hours ago" does not need second-level precision, and
 * a write per request would be the most expensive thing this API does.
 */
async function touch(sessionId) {
  if (!sessionId) return null;

  const now = new Date();
  const session = await Session.findOne({ sessionId, ...liveFilter(now) }).lean();
  if (!session) return null;

  const staleBy = now.getTime() - new Date(session.lastActiveAt).getTime();
  if (staleBy >= env.session.touchIntervalSeconds * 1000) {
    // Fire and forget: a failed heartbeat must never fail the request it rode in on.
    Session.updateOne({ sessionId }, { $set: { lastActiveAt: now } }).catch((err) =>
      logger.warn(`Could not touch session ${sessionId}: ${err.message}`)
    );
  }

  return session;
}

/** Why a session that is no longer live stopped being live — for an honest 401. */
async function explain(sessionId) {
  const session = await Session.findOne({ sessionId }).lean();
  if (!session) return 'unknown';
  if (session.status === 'revoked') return 'revoked';
  if (session.expiresAt <= new Date()) return 'expired';
  if (new Date(session.lastActiveAt) <= idleCutoff()) return 'inactive';
  return 'unknown';
}

/** The account's live sessions, most recently used first. */
function listForUser(userId) {
  return Session.find({ user: userId, ...liveFilter() }).sort({ lastActiveAt: -1 }).lean();
}

/**
 * Ends one session. Scoped by user as well as id, so a session id learned by any
 * other means still cannot be used to sign out somebody else's device.
 */
function revoke(sessionId, { userId, reason = 'revoked-by-user' } = {}) {
  return Session.findOneAndUpdate(
    { sessionId, ...(userId ? { user: userId } : {}), status: 'active' },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason } },
    { new: true }
  );
}

/**
 * Ends every session on an account, optionally sparing the one making the request.
 * This is what a password change, an account block and "log out everywhere" all use.
 *
 * @returns {Promise<number>} how many sessions were ended
 */
async function revokeAllForUser(userId, { exceptSessionId, reason = 'logout-all' } = {}) {
  const result = await Session.updateMany(
    {
      user: userId,
      status: 'active',
      ...(exceptSessionId ? { sessionId: { $ne: exceptSessionId } } : {}),
    },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason } }
  );
  return result.modifiedCount || 0;
}

/**
 * Keeps an account within `env.session.maxPerUser` live devices. The newest login is
 * always kept; the least recently used are dropped, which is the same rule every
 * major provider applies and the one least likely to surprise the owner.
 */
async function enforceLimit(userId, keepSessionId) {
  const limit = env.session.maxPerUser;
  if (!limit || limit < 1) return 0;

  const live = await Session.find({ user: userId, ...liveFilter() })
    .select('sessionId lastActiveAt')
    .sort({ lastActiveAt: -1 })
    .lean();

  const surplus = live.slice(limit).filter((s) => s.sessionId !== keepSessionId);
  if (!surplus.length) return 0;

  await Session.updateMany(
    { sessionId: { $in: surplus.map((s) => s.sessionId) } },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: 'session-limit' } }
  );
  return surplus.length;
}

/**
 * Marks sessions that have gone idle past the policy as expired.
 *
 * Reads already ignore them — `liveFilter` compares against the cut-off on every
 * query, so correctness never depends on this running. It exists so the stored
 * `status` eventually matches reality for anyone reading the collection directly.
 */
async function expireInactive() {
  const result = await Session.updateMany(
    { status: 'active', lastActiveAt: { $lte: idleCutoff() } },
    { $set: { status: 'expired', revokedAt: new Date(), revokedReason: 'inactivity' } }
  );
  return result.modifiedCount || 0;
}

/** Shape the devices screen renders. Nothing secret survives this projection. */
function toPublicJSON(session, currentSessionId) {
  return {
    id: session.sessionId,
    device: {
      name: session.device?.name || 'Unknown device',
      type: session.device?.type || 'unknown',
      vendor: session.device?.vendor || '',
      model: session.device?.model || '',
    },
    browser: {
      name: session.browser?.name || '',
      version: session.browser?.version || '',
    },
    os: {
      name: session.os?.name || '',
      version: session.os?.version || '',
    },
    location: session.location?.city || session.location?.country ? session.location : null,
    // The full address is the owner's own data and is what makes an unfamiliar
    // session identifiable — the same call Google and GitHub make on these screens.
    ip: session.ip || '',
    client: session.client || 'storefront',
    signInMethod: session.signInMethod || 'password',
    loginAt: session.loginAt,
    lastActiveAt: session.lastActiveAt,
    expiresAt: session.expiresAt,
    isCurrent: Boolean(currentSessionId) && session.sessionId === currentSessionId,
  };
}

module.exports = {
  hash,
  newSessionId,
  describeRequest,
  create,
  rotate,
  touch,
  explain,
  listForUser,
  revoke,
  revokeAllForUser,
  enforceLimit,
  expireInactive,
  toPublicJSON,
};
