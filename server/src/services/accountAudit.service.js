const AccountAudit = require('../models/AccountAudit');
const logger = require('../utils/logger');
const { clientIp } = require('./geo.service');

/**
 * Writes the account lifecycle trail.
 *
 * Every call is fire-and-forget by design. An audit row is a record of something
 * that has already happened, so failing to write one must never turn a completed
 * deactivation into a failed request — the alternative is a shopper who is told
 * their account could not be closed after it already was. Failures are logged
 * loudly instead, because a trail with holes in it is worth knowing about.
 */
const record = async (
  user,
  action,
  { actor = 'system', actorId, actorName, summary, req, meta } = {}
) => {
  try {
    await AccountAudit.create({
      user: user?._id || user,
      action,
      actor,
      actorId,
      actorName,
      summary,
      ip: req ? clientIp(req) : undefined,
      userAgent: req ? String(req.headers?.['user-agent'] || '').slice(0, 512) : undefined,
      meta,
    });
  } catch (err) {
    logger.error(`Could not write account audit (${action}): ${err.message}`);
  }
};

/**
 * The trail for one account, newest first. `limit` is generous rather than paged:
 * this is read on a single request-detail screen, and an account that has been
 * through the flow twice still has well under fifty rows.
 */
const forUser = (userId, limit = 60) =>
  AccountAudit.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();

module.exports = { record, forUser };
