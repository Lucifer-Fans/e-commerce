/**
 * Single response envelope used by every controller so the two React apps can
 * share one axios interceptor.
 *   { success, message, data, meta? }
 */
function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/** Pagination meta helper — keeps page math in one place. */
function paginationMeta({ total, page, limit }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

module.exports = { sendSuccess, paginationMeta };
