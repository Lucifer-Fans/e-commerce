/**
 * Memo for the admin dashboard's headline KPI block.
 *
 * `GET /dashboard/stats` fans out to fifteen counts and aggregates, four of which are
 * unfiltered `countDocuments()` over the whole of Products, Orders and Users. That is
 * the single most expensive read the API serves, and every admin tab open — plus every
 * live refetch — pays for it.
 *
 * It lives in its own module rather than inside the controller because the realtime
 * layer has to clear it, and `realtime/index` requiring a controller would close a
 * cycle (controller → broadcast → realtime → controller).
 *
 * Correctness rests on the invalidation, not the TTL: the admin panel refetches on
 * `dashboard:invalidated`, and the same call that emits that event clears this cache
 * first, so a refetch triggered by a new order always recomputes. The TTL is only a
 * backstop for changes that reach the database without going through a broadcast —
 * a seed script, a manual edit in Atlas, another instance of this process.
 */

const { createTtlCache } = require('../utils/ttlCache');

const statsCache = createTtlCache({ ttlMs: 60 * 1000, max: 4 });

const KEY = 'stats';

/** @param {() => Promise<object>} loader recomputes the KPI block on a miss. */
const resolveStats = (loader) => statsCache.resolve(KEY, loader);

const clearStats = () => statsCache.clear();

module.exports = { resolveStats, clearStats };
