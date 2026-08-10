const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { CancellationReason, Setting } = require('../models');
const { DEFAULT_REASONS } = require('../models/CancellationReason');

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
  const reasons = await CancellationReason.find(isAdminView ? {} : { isActive: true })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean();

  return sendSuccess(res, { message: 'Cancellation reasons fetched', data: { reasons } });
});

/** POST /cancellation-reasons (admin) */
exports.createReason = asyncHandler(async (req, res) => {
  const { label, description, displayOrder, isActive } = req.body;
  const reason = await CancellationReason.create({ label, description, displayOrder, isActive });

  return sendSuccess(res, { statusCode: 201, message: 'Reason added', data: { reason } });
});

/** PATCH /cancellation-reasons/:id (admin) */
exports.updateReason = asyncHandler(async (req, res) => {
  const reason = await CancellationReason.findById(req.params.id);
  if (!reason) throw ApiError.notFound('Reason not found');

  const { label, description, displayOrder, isActive } = req.body;
  if (label !== undefined) reason.label = label;
  if (description !== undefined) reason.description = description;
  if (displayOrder !== undefined) reason.displayOrder = displayOrder;
  if (isActive !== undefined) reason.isActive = isActive;
  await reason.save();

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

  return sendSuccess(res, { message: 'Reason deleted' });
});
