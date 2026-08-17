const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { CancellationReason, Setting } = require('../models');
const broadcast = require('../realtime/broadcast');
const { DEFAULT_REASONS } = require('../models/CancellationReason');
const {
  nextDisplayOrder,
  parseRequestedOrder,
  resequence,
  placeAndResequence,
} = require('../utils/displayOrder');

/**
 * Plants the starter list the very first time anybody asks for it, so the cancel
 * dialog is usable before an admin has opened the screen.
 *
 * The flag lives on the settings singleton rather than being inferred from "the
 * collection is empty" — otherwise an admin who deliberately cleared the list
 * would find it back on the next page load.
 */
let seedChecked = false;

async function seedOnce() {
  // The flag is durable; this one just saves a settings read per request once the
  // process has already established that the planting is done.
  if (seedChecked) return;

  const settings = await Setting.getSingleton();
  if (settings.seeded?.cancellationReasons) {
    seedChecked = true;
    return;
  }

  if ((await CancellationReason.estimatedDocumentCount()) === 0) {
    await CancellationReason.insertMany(
      DEFAULT_REASONS.map((label, index) => ({ label, displayOrder: index }))
    );
  }

  settings.set('seeded.cancellationReasons', true);
  await settings.save();
  seedChecked = true;
}

/**
 * GET /cancellation-reasons — the shopper's picklist.
 *
 * `?adminView=true` from an admin returns the inactive rows too, which is what
 * the management screen edits. Everyone else sees only what they may pick.
 */
exports.listReasons = asyncHandler(async (req, res) => {
  await seedOnce();

  const isAdminView = req.query.adminView === 'true' && req.user?.role === 'admin';

  // Rows written before the numbering was enforced can still carry gaps or a
  // shared number. The management screen is the only place those figures are
  // visible, so healing them as it opens costs nothing and spares the admin a
  // table that contradicts itself. It is a no-op once the run is already clean.
  if (isAdminView) await resequence(CancellationReason);

  const reasons = await CancellationReason.find(isAdminView ? {} : { isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();

  return sendSuccess(res, { message: 'Cancellation reasons fetched', data: { reasons } });
});

/**
 * POST /cancellation-reasons (admin)
 *
 * A position another reason already holds is an instruction, not a clash: the
 * newcomer takes it and the incumbent — with everything below — slides down one,
 * exactly as categories and brands behave. Sending no order lands the reason at
 * the end, which is what the panel proposes.
 */
exports.createReason = asyncHandler(async (req, res) => {
  const { label, isActive } = req.body;

  const requestedOrder = parseRequestedOrder(req.body.displayOrder);
  const reason = await CancellationReason.create({
    label,
    isActive,
    displayOrder: requestedOrder ?? (await nextDisplayOrder(CancellationReason)),
  });

  await placeAndResequence(CancellationReason, {}, reason, requestedOrder);
  broadcast.cancellationReasonChanged('created', reason);

  return sendSuccess(res, { statusCode: 201, message: 'Reason added', data: { reason } });
});

/** PATCH /cancellation-reasons/:id (admin) */
exports.updateReason = asyncHandler(async (req, res) => {
  const reason = await CancellationReason.findById(req.params.id);
  if (!reason) throw ApiError.notFound('Reason not found');

  // A patch that never mentions the order is not a move — the status chip flips
  // the switch alone, and that must not shuffle the list.
  const requestedOrder = parseRequestedOrder(req.body.displayOrder);

  const { label, isActive } = req.body;
  if (label !== undefined) reason.label = label;
  if (isActive !== undefined) reason.isActive = isActive;
  await reason.save();

  await placeAndResequence(CancellationReason, {}, reason, requestedOrder);
  broadcast.cancellationReasonChanged('updated', reason);

  return sendSuccess(res, { message: 'Reason updated', data: { reason } });
});

/**
 * DELETE /cancellation-reasons/:id (admin)
 *
 * Orders that already quoted this reason keep their own copy of the text, so
 * removing a row only changes what future shoppers are offered.
 */
exports.deleteReason = asyncHandler(async (req, res) => {
  const reason = await CancellationReason.findById(req.params.id);
  if (!reason) throw ApiError.notFound('Reason not found');

  await reason.deleteOne();
  await resequence(CancellationReason);
  broadcast.cancellationReasonChanged('deleted', reason);

  return sendSuccess(res, { message: 'Reason deleted' });
});
