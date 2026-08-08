const xss = require('xss');

/**
 * Express 5 / recent Express 4 makes req.query a getter, so express-mongo-sanitize's
 * in-place mutation throws. This walks a copy and reassigns only what it is allowed to.
 */
const MONGO_OPERATOR = /^\$|\./;

function clean(value, { allowHtml = false } = {}) {
  if (Array.isArray(value)) return value.map((v) => clean(v, { allowHtml }));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (MONGO_OPERATOR.test(key)) continue; // drop $gt / dotted-path injection attempts
      out[key] = clean(val, { allowHtml });
    }
    return out;
  }
  if (typeof value === 'string') {
    return allowHtml
      ? xss(value, {
          whiteList: {
            p: [], br: [], b: [], strong: [], i: [], em: [], u: [], s: [],
            ul: [], ol: [], li: [], h1: [], h2: [], h3: [], h4: [],
            blockquote: [], span: ['style'], a: ['href', 'target', 'rel'],
            table: [], thead: [], tbody: [], tr: [], th: [], td: [],
          },
        })
      : xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] });
  }
  return value;
}

/** Fields whose content is authored rich text and must keep its markup. */
const RICH_TEXT_FIELDS = new Set(['description', 'answer', 'comment']);

function cleanBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return clean(body);
  const out = {};
  for (const [key, val] of Object.entries(body)) {
    if (MONGO_OPERATOR.test(key)) continue;
    out[key] = clean(val, { allowHtml: RICH_TEXT_FIELDS.has(key) });
  }
  return out;
}

/**
 * Re-runs body sanitising after a multipart parser has populated req.body.
 *
 * The global middleware runs before multer, so a multipart form's fields would
 * otherwise reach a controller untouched. Mount this directly after the upload
 * middleware on any route that accepts form-data.
 */
function sanitizeMultipartBody(req, _res, next) {
  if (req.body) req.body = cleanBody(req.body);
  next();
}

module.exports = function sanitizeRequest(req, _res, next) {
  if (req.body) req.body = cleanBody(req.body);
  if (req.params) Object.assign(req.params, clean({ ...req.params }));

  if (req.query && Object.keys(req.query).length) {
    const cleaned = clean({ ...req.query });
    try {
      req.query = cleaned;
    } catch {
      // Getter-only in newer Express — mutate the existing object instead.
      Object.keys(req.query).forEach((k) => delete req.query[k]);
      Object.assign(req.query, cleaned);
    }
  }
  next();
};

module.exports.sanitizeMultipartBody = sanitizeMultipartBody;
