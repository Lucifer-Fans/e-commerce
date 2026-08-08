const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Address } = require('../models');
const broadcast = require('../realtime/broadcast');

/** GET /addresses */
exports.listAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.find({ user: req.user._id }).sort({ isDefault: -1, updatedAt: -1 });
  return sendSuccess(res, { message: 'Addresses fetched', data: { addresses } });
});

/** POST /addresses */
exports.createAddress = asyncHandler(async (req, res) => {
  const count = await Address.countDocuments({ user: req.user._id });
  if (count >= 10) throw ApiError.badRequest('You can save at most 10 addresses');

  const address = await Address.create({
    ...req.body,
    user: req.user._id,
    // The very first address is always the default.
    isDefault: count === 0 ? true : Boolean(req.body.isDefault),
  });

  broadcast.addressChanged(req.user._id, 'created', address);

  return sendSuccess(res, { statusCode: 201, message: 'Address added', data: { address } });
});

/** PATCH /addresses/:id */
exports.updateAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
  if (!address) throw ApiError.notFound('Address not found');

  Object.assign(address, req.body, { user: req.user._id });
  await address.save();

  broadcast.addressChanged(req.user._id, 'updated', address);

  return sendSuccess(res, { message: 'Address updated', data: { address } });
});

/** DELETE /addresses/:id */
exports.deleteAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
  if (!address) throw ApiError.notFound('Address not found');

  // The default address can only go once another one has taken its place, so the
  // shopper — not us — decides where future orders ship. This holds even when it is
  // the only address saved: add another, make it the default, then delete this one.
  if (address.isDefault) {
    throw ApiError.badRequest('Set another address as default before deleting this one');
  }

  await address.deleteOne();

  broadcast.addressChanged(req.user._id, 'deleted', address);

  return sendSuccess(res, { message: 'Address deleted' });
});

/** PATCH /addresses/:id/default */
exports.setDefaultAddress = asyncHandler(async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user._id });
  if (!address) throw ApiError.notFound('Address not found');

  address.isDefault = true;
  await address.save(); // pre-save hook clears the flag on the others

  broadcast.addressChanged(req.user._id, 'default', address);

  return sendSuccess(res, { message: 'Default address updated', data: { address } });
});
