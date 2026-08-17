/**
 * One-off migration: rewrites the zeros that coupons used to store for
 * "unlimited" / "no cap" as the null the schema now means by it.
 *
 * Three fields are optional-by-absence — `maxDiscountAmount`, `usageLimit` and
 * `perUserLimit` — and a blank admin field used to reach the database as 0. Read
 * back, each 0 was a real limit of zero:
 *
 *   maxDiscountAmount: 0  →  every flat coupon capped at ₹0, so FLAT500 took ₹0 off
 *   usageLimit: 0         →  "used 3 / 0", and the coupon rejected as exhausted
 *   perUserLimit: 0       →  no customer could ever use it
 *
 * The runtime already reads a stored 0 as "unlimited", so this changes no
 * behaviour — it makes the stored documents say what they mean, which is what
 * the admin table reads. Flat coupons additionally lose their cap entirely: a
 * maximum discount is a percentage-coupon device.
 *
 *   node scripts/normalise-coupon-limits.js            # dry run, writes nothing
 *   node scripts/normalise-coupon-limits.js --commit   # backs up, then writes
 *
 * To undo, feed the backup back in:
 *
 *   node scripts/normalise-coupon-limits.js --restore backups/<file>.json
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const env = require('../src/config/env');

const BACKUP_DIR = path.join(__dirname, '../backups');

/** The fields this migration owns, and what each looks like once corrected. */
const show = (v) => (v === null || v === undefined ? '∞' : String(v));

function corrections(coupon) {
  const next = {};

  // A cap belongs to percentage coupons; anything <= 0 was never a cap at all.
  const cap = coupon.discountType === 'flat' ? null : coupon.maxDiscountAmount;
  if (cap === undefined || Number(cap) <= 0) next.maxDiscountAmount = null;

  for (const field of ['usageLimit', 'perUserLimit']) {
    const value = coupon[field];
    if (value === undefined || (value !== null && Number(value) <= 0)) next[field] = null;
  }

  // Only report a field when the stored value actually differs.
  return Object.fromEntries(
    Object.entries(next).filter(([field, value]) => (coupon[field] ?? null) !== value)
  );
}

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const coupons = mongoose.connection.collection('coupons');

  for (const row of rows) {
    await coupons.updateOne(
      { _id: new mongoose.Types.ObjectId(row._id) },
      { $set: row.fields }
    );
  }
  console.log(`restored limits on ${rows.length} coupons from ${path.basename(file)}`);
}

async function main() {
  const commit = process.argv.includes('--commit');
  const restoreAt = process.argv.indexOf('--restore');

  await mongoose.connect(env.mongoUri);

  if (restoreAt !== -1) {
    await restore(process.argv[restoreAt + 1]);
    await mongoose.disconnect();
    return;
  }

  // Raw driver, not the model: the setters would silently correct these values
  // on the way out and the migration would find nothing to do.
  const coupons = mongoose.connection.collection('coupons');
  const all = await coupons.find({}).sort({ code: 1 }).toArray();

  const changes = all
    .map((c) => ({ _id: String(c._id), code: c.code, before: c, fix: corrections(c) }))
    .filter((c) => Object.keys(c.fix).length);

  if (!changes.length) {
    console.log(`${all.length} coupons checked — every limit already stores null for unlimited`);
    await mongoose.disconnect();
    return;
  }

  console.log(`${changes.length} of ${all.length} coupons store 0 where they mean unlimited:\n`);
  for (const c of changes) {
    const fields = Object.keys(c.fix)
      .map((f) => `${f} ${show(c.before[f])} → ${show(c.fix[f])}`)
      .join(', ');
    console.log(`  ${String(c.code).padEnd(12)} ${fields}`);
  }

  if (!commit) {
    console.log('\ndry run — nothing written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `coupon-limits-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      changes.map((c) => ({
        _id: c._id,
        code: c.code,
        fields: Object.fromEntries(Object.keys(c.fix).map((f) => [f, c.before[f] ?? null])),
      })),
      null,
      2
    )
  );
  console.log(`\nbacked up ${changes.length} coupons → ${path.relative(process.cwd(), backup)}`);

  for (const c of changes) {
    await coupons.updateOne({ _id: new mongoose.Types.ObjectId(c._id) }, { $set: c.fix });
  }
  console.log(`updated ${changes.length} coupons`);

  const left = (await coupons.find({}).toArray()).filter((c) => Object.keys(corrections(c)).length);
  console.log(`verification: ${left.length} coupons still store a zero limit`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
