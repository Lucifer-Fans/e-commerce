/**
 * SMTP transport and the one function that puts a composed message on it.
 *
 * Everything above this layer builds strings; this is the only part that talks to
 * a relay, which is why it is the piece worth being able to read on its own.
 */

const nodemailer = require('nodemailer');

const env = require('../../config/env');
const logger = require('../../utils/logger');
const { inlineAttachments } = require('./assets');

let transporter = null;
if (env.mailEnabled) {
  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.pass },
    // See env.mail for why these are stated rather than left to nodemailer: its
    // defaults (2min connect / 30s greeting / 10min socket) all outlast the
    // browser, so an unreachable relay reads to the shopper as a broken sign-up
    // rather than as a mail problem.
    connectionTimeout: env.mail.connectionTimeoutMs,
    greetingTimeout: env.mail.greetingTimeoutMs,
    socketTimeout: env.mail.socketTimeoutMs,
  });
}

/**
 * Everything a mail failure needs to be diagnosed from a log line alone. SMTP
 * errors carry the interesting part outside `message` — `code` says whether the
 * relay was unreachable (ESOCKET/ETIMEDOUT) or refused us (EAUTH/EENVELOPE),
 * `command` says how far the conversation got, and `response` is the relay's own
 * words. Logging only `err.message` is what made a dead relay indistinguishable
 * from a rejected recipient.
 */
const mailErrorDetail = (err) =>
  [
    err.code && `code=${err.code}`,
    err.command && `command=${err.command}`,
    err.responseCode && `responseCode=${err.responseCode}`,
    err.response && `response=${String(err.response).replace(/\s+/g, ' ').trim()}`,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * Resolves to `onTimeout` if `promise` has not settled in `ms`.
 *
 * The work itself is not cancellable — an SMTP socket carries on in the
 * background until its own timeouts fire — but the *caller* stops waiting, which
 * is the part that matters: the request this mail belongs to answers on time
 * either way. The late rejection is swallowed so a socket that gives up after we
 * have moved on cannot surface as an unhandled rejection.
 */
function withDeadline(promise, ms, onTimeout) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    deadline,
  ]);
}

/**
 * Never throws, and never waits longer than `env.mail.sendTimeoutMs` — a mail
 * outage must neither fail nor stall the request that triggered it.
 * Returns false when the message could not be sent so callers can adjust copy.
 */
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    logger.warn(`SMTP not configured — skipped "${subject}" to ${to}`);
    if (!env.isProd) logger.debug(text || html);
    return false;
  }

  const startedAt = Date.now();

  const attempt = transporter
    .sendMail({
      from: env.mail.from,
      to,
      subject,
      html,
      text,
      attachments: inlineAttachments(html),
    })
    .then(() => {
      logger.debug(`Mail sent (${subject} → ${to}) in ${Date.now() - startedAt}ms`);
      return true;
    })
    .catch((err) => {
      logger.error(
        `Mail send failed (${subject} → ${to}) after ${Date.now() - startedAt}ms: ` +
          `${err.message}${mailErrorDetail(err) ? ` [${mailErrorDetail(err)}]` : ''}`
      );
      return false;
    });

  return withDeadline(attempt, env.mail.sendTimeoutMs, () => {
    logger.error(
      `Mail send timed out after ${env.mail.sendTimeoutMs}ms (${subject} → ${to}) — ` +
        `SMTP host ${env.mail.host}:${env.mail.port} is not answering in time. ` +
        `The request continues without waiting; check that outbound SMTP is not blocked.`
    );
    return false;
  });
}

module.exports = { sendMail, withDeadline, mailErrorDetail };
