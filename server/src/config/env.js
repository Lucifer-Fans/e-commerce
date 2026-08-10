const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  // Fallback brand name for emails — the admin's Organization settings win when present.
  appName: process.env.APP_NAME || 'Premium Store',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  /**
   * Public origin of this API. Email artwork is served from here, so an inbox
   * on the other side of the world can fetch it — a relative path or a
   * localhost default would render as a broken image in every real client.
   */
  serverUrl: (process.env.SERVER_URL || `http://localhost:${num(process.env.PORT, 5000)}`).replace(
    /\/+$/,
    ''
  ),

  mongoUri: process.env.MONGO_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d',
  },
  /**
   * Work factor for password hashing.
   *
   * Ten rather than twelve, because this runs on bcryptjs — a pure-JS
   * implementation roughly six times slower than the native binding — on a
   * fraction of a shared core. Each round doubles the work, so 12 costs four
   * times what 10 does: on a 0.1-CPU container that is the difference between a
   * sign-up that answers and one the browser times out on, and the cost is paid
   * twice more on every login (the compare, and the dummy compare that hides
   * whether an address exists).
   *
   * Nothing needs re-hashing: the cost is stored inside each hash, so accounts
   * created at 12 keep verifying at 12 and only new passwords use this value.
   * Raise it with BCRYPT_ROUNDS the moment this runs anywhere with a real core.
   */
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),

  /**
   * Connection pool, sized for the container this runs in rather than for what
   * the database would allow. See config/db.js for why each value is what it is.
   */
  mongo: {
    maxPoolSize: num(process.env.MONGO_MAX_POOL_SIZE, 8),
    minPoolSize: num(process.env.MONGO_MIN_POOL_SIZE, 2),
  },

  /**
   * Per-account lockout, the companion to the per-IP login limiter: the limiter
   * slows one attacker down, this one caps how many guesses a single account can
   * absorb no matter how many addresses they come from.
   *
   * The lock is a fixed window from the moment it trips and further attempts do
   * not extend it, so waiting it out actually works for the real account holder.
   *
   * `warnAfter` is the attempt from which the sign-in form starts counting down
   * out loud ("3 attempts left"). Someone who has mistyped their password five
   * times is nearly always its owner, and telling them what is about to happen is
   * what turns a silent lockout into one they can avoid.
   */
  login: {
    maxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 8),
    lockMinutes: num(process.env.LOGIN_LOCK_MINUTES, 15),
    warnAfter: num(process.env.LOGIN_WARN_AFTER, 5),
  },

  /**
   * The one-time code a new sign-up has to type back before the account is usable.
   *
   * Short-lived and few attempts on purpose: a six-digit code is only 10^6 wide, so
   * what keeps it safe is not its length but how briefly it is valid and how few
   * guesses it will answer. `maxResends` caps how many codes one sign-up can pull
   * out of us, so a pending registration cannot be turned into a mail cannon aimed
   * at someone else's inbox.
   */
  otp: {
    length: num(process.env.OTP_LENGTH, 6),
    expiryMinutes: num(process.env.OTP_EXPIRY_MINUTES, 10),
    maxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: num(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    maxResends: num(process.env.OTP_MAX_RESENDS, 5),
  },

  /**
   * Login-session policy, shared by the devices screen and the token layer.
   *
   * `inactivityDays` is the idle cut-off: a device that has not made a request in
   * that long is expired even though its refresh token has not run out. The absolute
   * ceiling is the refresh token's own lifetime — a session can never outlive the
   * credential that renews it.
   */
  session: {
    inactivityDays: num(process.env.SESSION_INACTIVITY_DAYS, 30),
    // How stale `lastActiveAt` may get before an authenticated request writes it
    // back. Every request would otherwise cost a write for a value nobody reads to
    // the second.
    touchIntervalSeconds: num(process.env.SESSION_TOUCH_INTERVAL_SECONDS, 60),
    // Cap on concurrent devices per account, oldest signed out first.
    maxPerUser: num(process.env.SESSION_MAX_PER_USER, 20),
  },

  /**
   * Approximate login location. Optional by design: without it the devices screen
   * simply shows no place, and nothing else changes.
   */
  geoip: {
    enabled: bool(process.env.GEOIP_ENABLED, true),
    url: process.env.GEOIP_URL || 'http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city',
    timeoutMs: num(process.env.GEOIP_TIMEOUT_MS, 2000),
  },

  corsOrigins: [process.env.CLIENT_URL, process.env.ADMIN_URL].filter(Boolean),

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'premium-ecommerce',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },

  mail: {
    host: process.env.SMTP_HOST,
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'Premium Store <no-reply@premiumstore.com>',

    /**
     * One connection, held open and reused. Every message otherwise pays for a
     * fresh TCP connect, a TLS handshake and an AUTH exchange before a byte of
     * the mail moves — seconds of it on a throttled container, since the
     * handshake is CPU work on the same core the request is waiting on.
     */
    pool: bool(process.env.SMTP_POOL, true),
    maxConnections: num(process.env.SMTP_MAX_CONNECTIONS, 2),

    /**
     * Ceilings on each stage of a send. Without them a provider that accepts the
     * connection and then stops talking holds the socket — and, where a request
     * is waiting on the send, the request — until the client gives up.
     */
    connectionTimeoutMs: num(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000),
    greetingTimeoutMs: num(process.env.SMTP_GREETING_TIMEOUT_MS, 10000),
    socketTimeoutMs: num(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000),

    /**
     * How long a request that triggered a mail will wait for it before answering
     * anyway. The send is not cancelled — it carries on in the background and
     * the message still arrives — this only decides when the *shopper* stops
     * waiting. Well under the client's own 30s timeout, so a slow SMTP provider
     * costs a few seconds rather than the whole request.
     */
    requestDeadlineMs: num(process.env.MAIL_REQUEST_DEADLINE_MS, 4000),
  },

  commerce: {
    freeShippingThreshold: num(process.env.FREE_SHIPPING_THRESHOLD, 499),
    shippingFlatRate: num(process.env.SHIPPING_FLAT_RATE, 49),
  },
};

/** Fail fast on boot rather than at the first request that needs the value. */
const REQUIRED = [
  ['MONGO_URI', env.mongoUri],
  ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
  ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
];

env.assertValid = () => {
  const missing = REQUIRED.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

/** Optional integrations degrade gracefully instead of crashing the whole API. */
env.cloudinaryEnabled = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret
);
env.razorpayEnabled = Boolean(env.razorpay.keyId && env.razorpay.keySecret);
env.mailEnabled = Boolean(env.mail.host && env.mail.user && env.mail.pass);
env.googleAuthEnabled = Boolean(env.google.clientId);

module.exports = env;
