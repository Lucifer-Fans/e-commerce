const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * The floor under every endpoint: an answer, always, before the browser stops
 * listening.
 *
 * The client gives a request 30 seconds (client/src/api/client.js) and then shows
 * "The request timed out. Please try again." — a message that says nothing about
 * what went wrong, and leaves nothing in the console either, because from the
 * browser's point of view nothing *did* go wrong: no response ever arrived. The
 * cause is always the same shape — a handler awaiting something with no deadline
 * of its own, an SMTP relay being the usual culprit.
 *
 * Individual deadlines are still the real fix and are set where the waiting
 * happens (see env.mail). This is the backstop for the ones nobody has thought of
 * yet: it turns a hang into a 503 with a code the client can recognise, and — far
 * more useful — a server log line naming the route that stalled.
 *
 * The handler is not aborted; Node offers no way to unwind a promise mid-flight.
 * What ends is the *waiting*: the response is sent, and anything the handler does
 * afterwards finds `res.headersSent` already true and writes nothing further.
 */
module.exports = function requestTimeout(ms = env.requestTimeoutMs) {
  return function requestTimeoutMiddleware(req, res, next) {
    // A preflight never reaches a handler, and a disabled timeout means exactly
    // that rather than "fire immediately".
    if (req.method === 'OPTIONS' || !ms) return next();

    const startedAt = Date.now();

    const timer = setTimeout(() => {
      if (res.headersSent || res.writableEnded) return;

      logger.error(
        `Request timed out after ${Date.now() - startedAt}ms: ${req.method} ${req.originalUrl} — ` +
          `the handler never responded. Something it awaited has no deadline of its own.`
      );

      res.status(503).json({
        success: false,
        // Deliberately the same voice as every other user-facing failure: the
        // shopper is told to try again, not told about a socket.
        message: 'This is taking longer than expected. Please try again in a moment.',
        code: 'REQUEST_TIMEOUT',
      });
    }, ms);

    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);

    return next();
  };
};
