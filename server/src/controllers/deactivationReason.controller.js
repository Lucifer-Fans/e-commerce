const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { DeactivationReason, Setting } = require('../models');
const broadcast = require('../realtime/broadcast');
const { DEFAULT_REASONS } = require('../models/DeactivationReason');
const {
  nextDisplayOrder,
  parseRequestedOrder,
  resequence,
  placeAndResequence,
} = require('../utils/displayOrder');

/**
 * The twin of cancellationReason.controller, deliberately line for line: the two
 * picklists are curated on the same screen and behave identically, and the day one
 * of them grows a feature the other should grow it too. Anything that reads
 * differently here would be a difference an admin has to learn.
 */
let seedChecked = false;

async function seedOnce() {
  if (seedChecked) return;

  const settings = await Setting.getSingleton();
  if (settings.seeded?.deactivationReasons) {
    seedChecked = true;
    return;
  }

  if ((await DeactivationReason.estimatedDocumentCount()) === 0) {
    await DeactivationReason.insertMany(
      DEFAULT_REASONS.map((label, index) => ({ label, displayOrder: index }))
    );
  }

  settings.set('seeded.deactivationReasons', true);
  await settings.save();
  seedChecked = true;
}

/**
 * GET /deactivation-reasons — the picklist the deactivation dialog offers.
 *
 * `?adminView=true` from an admin returns the inactive rows too, which is what
 * the management screen edits. Everyone else sees only what they may pick.
 */
exports.listReasons = asyncHandler(async (req, res) => {
  await seedOnce();

  const isAdminView = req.query.adminView === 'true' && req.user?.role === 'admin';

  if (isAdminView) await resequence(DeactivationReason);

  const reasons = await DeactivationReason.find(isAdminView ? {} : { isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();

  return sendSuccess(res, { message: 'Deactivation reasons fetched', data: { reasons } });
});

/** POST /deactivation-reasons (admin) */
exports.createReason = asyncHandler(async (req, res) => {
  const { label, isActive } = req.body;

  const requestedOrder = parseRequestedOrder(req.body.displayOrder);
  const reason = await DeactivationReason.create({
    label,
    isActive,
    displayOrder: requestedOrder ?? (await nextDisplayOrder(DeactivationReason)),
  });

  await placeAndResequence(DeactivationReason, {}, reason, requestedOrder);
  broadcast.deactivationReasonChanged('created', reason);

  return sendSuccess(res, { statusCode: 201, message: 'Reason added', data: { reason } });
});

/** PATCH /deactivation-reasons/:id (admin) */
exports.updateReason = asyncHandler(async (req, res) => {
  const reason = await DeactivationReason.findById(req.params.id);
  if (!reason) throw ApiError.notFound('Reason not found');

  // A patch that never mentions the order is not a move — the status chip flips
  // the switch alone, and that must not shuffle the list.
  const requestedOrder = parseRequestedOrder(req.body.displayOrder);

  const { label, isActive } = req.body;
  if (label !== undefined) reason.label = label;
  if (isActive !== undefined) reason.isActive = isActive;
  await reason.save();

  await placeAndResequence(DeactivationReason, {}, reason, requestedOrder);
  broadcast.deactivationReasonChanged('updated', reason);

  return sendSuccess(res, { message: 'Reason updated', data: { reason } });
});

/**
 * DELETE /deactivation-reasons/:id (admin)
 *
 * Accounts already closed against this reason keep their own copy of the text, so
 * removing a row only changes what future shoppers are offered.
 */
exports.deleteReason = asyncHandler(async (req, res) => {
  const reason = await DeactivationReason.findById(req.params.id);
  if (!reason) throw ApiError.notFound('Reason not found');

  await reason.deleteOne();
  await resequence(DeactivationReason);
  broadcast.deactivationReasonChanged('deleted', reason);

  return sendSuccess(res, { message: 'Reason deleted' });
});
