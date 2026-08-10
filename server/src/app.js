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
app.get('/', (req, res) => {
  res.send('Server is Working');
});

/**
 * Mounted ahead of the API rate limiter: an uptime monitor polling every few
 * seconds shares an IP bucket with real traffic, and a probe that 429s reads as
 * an outage.
 */
app.use(`${env.apiPrefix}/health`, healthRoutes);

app.use(env.apiPrefix, apiLimiter, routes);

/* ---------------- Errors ---------------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
