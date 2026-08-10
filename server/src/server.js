const http = require('http');

const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');
const realtime = require('./realtime');
const sessionService = require('./services/session.service');

let server;
let sessionSweeper;

/**
 * Marks login sessions that have gone idle past the policy as expired.
 *
 * Purely housekeeping: every read already ignores an idle session, so nothing
 * depends on this having run. It keeps the stored status honest for anyone reading
 * the collection directly, and Mongo's TTL index removes the rows afterwards.
 */
function startSessionSweeper() {
  const run = () =>
    sessionService
      .expireInactive()
      .then((count) => count && logger.info(`Expired ${count} inactive session(s)`))
      .catch((err) => logger.warn(`Session sweep failed: ${err.message}`));

  /**
   * The first sweep waits a minute rather than running at boot. It enforces a
   * policy measured in days, so nothing about it is urgent — and a collection
   * scan competing with the first requests after a cold start is the one moment
   * its cost is actually felt.
   */
  setTimeout(run, 60 * 1000).unref();
  // Hourly is far finer than the multi-day policy it enforces, and `unref` keeps the
  // timer from holding the process open during shutdown.
  sessionSweeper = setInterval(run, 60 * 60 * 1000).unref();
}

async function start() {
  env.assertValid();
  await connectDB();

  // Socket.IO needs the raw HTTP server, so express no longer creates it itself.
  server = http.createServer(app);

  /**
   * Connection reuse, across a proxy that outlives ours.
   *
   * Node closes an idle keep-alive connection after 5s. Render's load balancer
   * holds its side open longer than that, so it will happily send a request down
   * a socket we have just decided to close — which surfaces to the browser as a
   * 502 or a hung request rather than as anything in the logs. Keeping ours open
   * the longer of the two settles it, and every reused connection is a TCP and
   * TLS handshake this instance does not have to spend a core it barely has on.
   *
   * `headersTimeout` must stay above `keepAliveTimeout`, or the header clock can
   * expire on a connection that was legitimately idle between requests.
   */
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  // Requests are answered or abandoned long before this; it exists so a stalled
  // client cannot pin a connection, and a slow upload is not counted against it.
  server.requestTimeout = 60000;

  realtime.init(server);
  startSessionSweeper();

  server.listen(env.port, () => {
    console.log(`🚀 Server running on port ${env.port}`);
  });
}

/** Finish in-flight requests before exiting, then bail out if that stalls. */
async function shutdown(signal, code = 0) {
  logger.warn(`${signal} received — shutting down`);
  const force = setTimeout(() => process.exit(1), 10000).unref();
  clearInterval(sessionSweeper);

  // Close sockets first so open connections don't hold the HTTP server open.
  await realtime.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDB();
  clearTimeout(force);
  process.exit(code);
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason?.stack || reason}`);
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (err) => {
  // The process is in an unknown state — log and exit rather than limp along.
  logger.error(`Uncaught exception: ${err.stack}`);
  process.exit(1);
});

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
