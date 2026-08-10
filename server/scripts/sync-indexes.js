/**
 * Applies every schema's indexes to the database, once, on purpose.
 *
 * In production Mongoose's own `autoIndex` is off (see src/config/db.js): left
 * on, each of the twenty-odd models fires a `createIndexes` the first time it is
 * touched, which puts a burst of round trips — and, for a collection with data
 * in it, a real build — in the same seconds as the first requests after a
 * deploy. On a small instance that is exactly the window that already feels
 * slow. This moves the work to a step of its own that finishes before, or
 * alongside, traffic rather than underneath it.
 *
 *   npm run db:indexes
 *
 * Safe to run repeatedly: an index that already matches is left alone.
 * `syncIndexes` also drops indexes the schemas no longer declare, so a removed
 * index does not linger costing writes forever.
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const models = require('../src/models');

async function run() {
  await connectDB();

  for (const [name, model] of Object.entries(models)) {
    const started = Date.now();
    try {
      // Serially rather than in parallel: index builds are the database's work,
      // and twenty at once on a shared-tier cluster is how one gets throttled.
      const dropped = await model.syncIndexes();
      const note = dropped?.length ? ` (dropped ${dropped.join(', ')})` : '';
      console.log(`✓ ${name}${note} — ${Date.now() - started}ms`);
    } catch (err) {
      // One model's bad index must not hide the state of the other twenty.
      console.error(`✗ ${name}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  await disconnectDB();
}

run().catch(async (err) => {
  console.error(`Index sync failed: ${err.message}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
