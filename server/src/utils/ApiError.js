/**
 * Operational (expected) error. Anything thrown that is NOT an ApiError is treated
 * as a programmer bug by the error middleware and hidden from clients in production.
 */
class ApiError extends Error {
  constructor(statusCode, message, { details = null, code = null } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', details) {
    return new ApiError(400, msg, { details });
  }
  static unauthorized(msg = 'Authentication required', code) {
    return new ApiError(401, msg, { code });
  }
  static forbidden(msg = 'You do not have permission to perform this action', code) {
    return new ApiError(403, msg, { code });
  }
  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg);
  }
  static conflict(msg = 'Resource already exists') {
    return new ApiError(409, msg);
  }
  /** The credentials may well be right — the account itself is closed for now. */
  static locked(msg = 'This account is temporarily locked', code) {
    return new ApiError(423, msg, { code });
  }
  static unprocessable(msg = 'Validation failed', details) {
    return new ApiError(422, msg, { details });
  }
  static tooMany(msg = 'Too many requests') {
    return new ApiError(429, msg);
  }
  static serviceUnavailable(msg = 'Service temporarily unavailable') {
    return new ApiError(503, msg);
  }
}

module.exports = ApiError;
