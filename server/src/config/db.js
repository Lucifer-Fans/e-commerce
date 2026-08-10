const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connectDB() {
  const conn = await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    /**
     * Sized for the container, not for the database. A 0.1-CPU instance cannot
     * service twenty concurrent cursors anyway — every extra socket is one more
     * TLS session to keep alive in a 512MB heap, and the parsing of whatever
     * comes back still queues behind the single event loop. Eight is well past
     * what this box can drive; `minPoolSize` keeps a couple warm so the first
     * request after an idle spell does not pay for a fresh TLS handshake.
     */
    maxPoolSize: env.mongo.maxPoolSize,
    minPoolSize: env.mongo.minPoolSize,
    // Reap sockets an idle dyno is holding open for nothing.
    maxIdleTimeMS: 60000,
    // A query that has been waiting this long is one the client gave up on
    // several timeouts ago; failing it frees the connection for live traffic.
    socketTimeoutMS: 45000,
    /**
     * Index builds are a deploy-time job, not a boot-time one. Left on, Mongoose
     * issues a `createIndexes` for every schema in the app on first use of each
     * model — dozens of round trips, all of them landing in the same seconds as
     * the first real request after a cold start. `npm run db:indexes` applies
     * them explicitly instead.
     */
    autoIndex: !env.isProd,
  });
  console.log(`✅ MongoDB Connected`);

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));

  return conn;
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };
