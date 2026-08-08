/**
 * One-off migration: takes GST back out of the orders that were priced with it.
 *
 * Orders written before tax was dropped from the pricing rules carry a
 * `pricing.tax` (with its `taxPercent`) and a `pricing.total` that includes it.
 * Nothing prices that way any more — `pricing.service.js` charges no tax and the
 * invoice prints no tax line — so those totals cannot be reconciled from the
 * rows a bill shows. This rewrites them to the rule in force:
 *
 *     total = subtotal − couponDiscount + shipping
 *
 * and removes the two orphaned fields.
 *
 * It rewrites financial records, so it does nothing unless told to. Run it once
 * to see the change, then again with --commit to make it:
 *
 *   node scripts/strip-order-tax.js            # dry run, writes nothing
 *   node scripts/strip-order-tax.js --commit   # backs up, then writes
 *
 * `--commit` writes every affected order's `pricing` to backups/ first. To undo,
 * feed that file back in:
 *
 *   node scripts/strip-order-tax.js --restore backups/<file>.json
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const env = require('../src/config/env');

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => `Rs. ${Number(n).toFixed(2)}`;

const BACKUP_DIR = path.join(__dirname, '../backups');

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const orders = mongoose.connection.collection('orders');

  for (const row of rows) {
    await orders.updateOne({ _id: new mongoose.Types.ObjectId(row._id) }, { $set: { pricing: row.pricing } });
  }
  console.log(`restored pricing on ${rows.length} orders from ${path.basename(file)}`);
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

  const orders = mongoose.connection.collection('orders');
  // Raw driver, not the model: `tax` is no longer in the schema, and a hydrated
  // document would drop the very field this migration exists to read.
  const taxed = await orders.find({ 'pricing.tax': { $gt: 0 } }).sort({ createdAt: 1 }).toArray();

  if (!taxed.length) {
    console.log('no orders carry a tax — nothing to do');
    await mongoose.disconnect();
    return;
  }

  const changes = taxed.map((o) => {
    const p = o.pricing;
    return {
      _id: String(o._id),
      orderNumber: o.orderNumber,
      paymentStatus: o.paymentStatus,
      pricing: p,
      total: round(p.subtotal - (p.couponDiscount || 0) + (p.shipping || 0)),
    };
  });

  console.log(`${changes.length} orders carry a tax:\n`);
  for (const c of changes) {
    console.log(
      `  ${c.orderNumber}  ${c.paymentStatus.padEnd(7)}  ` +
        `${money(c.pricing.total).padStart(14)} → ${money(c.total).padStart(14)}  ` +
        `(tax ${money(c.pricing.tax)} removed)`
    );
  }

  const paid = changes.filter((c) => c.paymentStatus === 'paid');
  if (paid.length) {
    console.log(
      `\n  NOTE: ${paid.length} of these are already paid. Their Payment documents keep the` +
        `\n  amount the gateway actually charged, so order and payment will disagree by the tax.`
    );
  }

  if (!commit) {
    console.log('\ndry run — nothing written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `orders-pricing-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      changes.map((c) => ({ _id: c._id, orderNumber: c.orderNumber, pricing: c.pricing })),
      null,
      2
    )
  );
  console.log(`\nbacked up ${changes.length} orders → ${path.relative(process.cwd(), backup)}`);

  for (const c of changes) {
    await orders.updateOne(
      { _id: new mongoose.Types.ObjectId(c._id) },
      { $set: { 'pricing.total': c.total }, $unset: { 'pricing.tax': '', 'pricing.taxPercent': '' } }
    );
  }
  console.log(`updated ${changes.length} orders`);

  const left = await orders.countDocuments({ 'pricing.tax': { $exists: true } });
  const all = await orders.find({}).toArray();
  const broken = all.filter((o) => {
    const p = o.pricing;
    return Math.abs(p.subtotal - (p.couponDiscount || 0) + (p.shipping || 0) - p.total) > 0.02;
  });
  console.log(`verification: ${left} orders still carry a tax field, ${broken.length} totals do not reconcile`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
