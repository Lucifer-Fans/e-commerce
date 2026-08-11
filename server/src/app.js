const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const hpp = require('hpp');

const env = require('./config/env');
const routes = require('./routes');
const healthRoutes = require('./routes/health.routes');
const sanitizeRequest = require('./middleware/sanitize');
const resolveLanguage = require('./middleware/language');
const requestTimeout = require('./middleware/requestTimeout');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const paymentController = require('./controllers/payment.controller');

const app = express();

// Behind nginx/Heroku/Render the client IP arrives in X-Forwarded-For; rate limiting
// and secure cookies both depend on this being correct.
app.set('trust proxy', 1);

/* ---------------- Security ---------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Cloudinary images
    contentSecurityPolicy: env.isProd ? undefined : false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/server-to-server requests arrive without an Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    /**
     * How long a browser may reuse one preflight instead of re-asking.
     *
     * Without this the answer is cached for the browser's default — 5 seconds in
     * Chrome — so a burst of calls on a single page load pays for the same OPTIONS
     * over and over. The storefront's reads no longer preflight at all (see
     * client/src/api/client.js), which leaves writes and authenticated calls; those
     * are what this keeps off the wire. 24h is the Chromium ceiling.
     */
    maxAge: 86400,
  })
);

/**
 * The Razorpay webhook signature is computed over the exact raw bytes, so it must be
 * mounted before express.json() replaces the body with a parsed object.
 */
app.post(
  `${env.apiPrefix}/payments/webhook`,
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  paymentController.webhook
);

/* ---------------- Parsing ---------------- */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(compression());
app.use(hpp({ whitelist: ['tags', 'brand', 'category', 'subCategory'] }));
app.use(sanitizeRequest);
// Decides which language the catalogue is served in; every controller reads
// `req.language` rather than sniffing headers for itself.
app.use(resolveLanguage);

if (!env.isProd) app.use(morgan('dev'));

/* ---------------- Static assets ---------------- */
/**
 * Email artwork. Mail clients fetch these over plain HTTP from an inbox we do
 * not control, so the folder is public, cached hard (the files are content-
 * stable — a new mark ships under a new name) and mounted ahead of the API
 * rate limiter: a mailing's worth of image fetches must not exhaust a
 * recipient's request budget.
 */
app.use(
  '/assets/email',
  express.static(path.join(__dirname, 'assets/email'), {
    maxAge: '30d',
    immutable: true,
    fallthrough: false,
  })
);

/* ---------------- Routes ---------------- */
/**
 * robots.txt and the sitemaps sit at the site root because that is the only place
 * a crawler looks for them, and ahead of the API limiter because a crawl burst
 * must not spend a real visitor's request budget.
 */
app.use('/', require('./routes/seo.routes'));

// Only a bare API deployment answers here; with the storefront mounted (below)
// "/" is the storefront's own home page.
if (!env.clientDistPath) {
  app.get('/', (req, res) => {
    res.send('Server is Working');
  });
}

/**
 * Mounted ahead of the API rate limiter: an uptime monitor polling every few
 * seconds shares an IP bucket with real traffic, and a probe that 429s reads as
 * an outage.
 */
app.use(`${env.apiPrefix}/health`, healthRoutes);

/**
 * `requestTimeout` guards the API only. The static mounts above it stream files
 * of whatever size, and the SPA catch-all below is a page load rather than an
 * XHR the client is timing — neither has a browser-side deadline to beat.
 */
app.use(env.apiPrefix, apiLimiter, requestTimeout(), routes);

/* ---------------- Storefront (optional) ---------------- */
/**
 * Serving the built SPA from here is what buys per-page link previews: the
 * catch-all hands every navigable URL an index.html whose meta tags were rewritten
 * for that URL, so the crawler behind a WhatsApp or Facebook unfurl — which never
 * executes the bundle — reads the right product's title, description and photo.
 *
 * Mounted last so it can never shadow the API, and only when CLIENT_DIST_PATH
 * points somewhere: an API-only deployment behaves exactly as before.
 */
if (env.clientDistPath) {
  const clientDist = path.resolve(env.clientDistPath);
  const htmlMeta = require('./middleware/htmlMeta')(clientDist);

  app.use(
    express.static(clientDist, {
      // index.html must go through htmlMeta, never straight off disk — served
      // directly it would carry the build's site-wide defaults on every route.
      index: false,
      // Vite fingerprints everything under /assets; the rest may change in place.
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  app.get('*', htmlMeta);
}

/* ---------------- Errors ---------------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
