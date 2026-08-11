const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const notFound = (req, _res, next) =>
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));

/** Translate driver/library errors into ApiError so clients get consistent shapes. */
function normalise(err, req = {}) {
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
  /**
   * The database is unreachable, or a query sat in mongoose's buffer until it
   * gave up. Left alone these arrive as an anonymous 500 ("Something went wrong")
   * that reads identically to a bug in a controller — and on a sign-up, where the
   * shopper is about to press the button again, "try again in a moment" is both
   * truer and more useful. The full driver message still reaches the log below;
   * only what the client is told is rewritten.
   */
  if (
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoNotConnectedError' ||
    err.name === 'MongooseServerSelectionError' ||
    (err.name === 'MongooseError' && /buffering timed out/i.test(err.message))
  ) {
    const dbError = ApiError.serviceUnavailable(
      'We could not reach our database just now. Please try again in a moment.'
    );
    dbError.code = 'DB_UNAVAILABLE';
    // Keep the driver's own words for the log line — `normalise` returns the
    // replacement, so without this the cause would be lost at the boundary.
    dbError.cause = err;
    return dbError;
  }

  if (err.name === 'JsonWebTokenError') return ApiError.unauthorized('Invalid token');
  if (err.name === 'TokenExpiredError') return ApiError.unauthorized('Token expired');
  if (err.name === 'MulterError') {
    const map = {
      // Routes that accept more than images set their own ceiling on the request.
      LIMIT_FILE_SIZE: `File is too large (max ${req.uploadMaxLabel || '5MB'})`,
      LIMIT_FILE_COUNT: 'Too many files (max 5 images)',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
    };
    return ApiError.badRequest(map[err.code] || 'File upload failed');
  }

  return err;
}

function errorHandler(err, req, res, next) {
  const error = normalise(err, req);
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;

  if (!isOperational || statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode} ${error.message}\n${err.stack}`);
  }

  /**
   * Something already answered this request — in practice the request-timeout
   * backstop, with the slow handler now arriving to find the shopper long since
   * told to try again. There is no second response to send, and attempting one
   * only turns a handled timeout into a stack trace; Express's own final handler
   * closes the socket from here.
   */
  if (res.headersSent) return next(err);

  return res.status(statusCode).json({
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
