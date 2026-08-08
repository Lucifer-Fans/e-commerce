const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const notFound = (req, _res, next) =>
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));

/** Translate driver/library errors into ApiError so clients get consistent shapes. */
function normalise(err) {
  if (err instanceof ApiError) return err;

  if (err.name === 'CastError') {
    return ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Validation failed', details);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`A record with this ${field} already exists`);
  }
  if (err.name === 'JsonWebTokenError') return ApiError.unauthorized('Invalid token');
  if (err.name === 'TokenExpiredError') return ApiError.unauthorized('Token expired');
  if (err.name === 'MulterError') {
    const map = {
      LIMIT_FILE_SIZE: 'File is too large (max 5MB)',
      LIMIT_FILE_COUNT: 'Too many files (max 5 images)',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
    };
    return ApiError.badRequest(map[err.code] || 'File upload failed');
  }

  return err;
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
function errorHandler(err, req, res, _next) {
  const error = normalise(err);
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;

  if (!isOperational || statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode} ${error.message}\n${err.stack}`);
  }

  res.status(statusCode).json({
    success: false,
    // Never leak internals of an unexpected failure to production clients.
    message: isOperational || !env.isProd ? error.message : 'Something went wrong',
    // A stable tag for the few failures a client renders differently from the rest
    // (the login lockout warning, for one) so nothing has to match on message text.
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { errors: error.details } : {}),
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
