const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Terminates an express-validator chain; collects every failure, not just the first. */
module.exports = (req, _res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({ field: e.path || e.param, message: e.msg }));
  return next(ApiError.unprocessable('Please correct the highlighted fields', details));
};
