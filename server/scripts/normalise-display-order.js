/**
 * One-off migration: renumbers every ordered list into a gap-free, duplicate-free
 * 0, 1, 2 … run.
 *
 * The controllers now keep `displayOrder` dense on every write — a saved position
 * splices the row in and pushes the rest down — but rows written before that do
 * not, and the admin screens print these figures literally. Two categories both
 * reading "order 4" is what this clears up, along with the holes a delete used to
 * leave behind.
 *
 * Each list numbers itself independently: categories against each other, brands
 * against each other, cancellation reasons against each other, and sub-categories
 * against the other children of their own parent. Existing order is preserved —
 * rows keep the sequence they already display in, they just stop sharing numbers.
 *
 *   node scripts/normalise-display-order.js            # dry run, writes nothing
 *   node scripts/normalise-display-order.js --commit   # backs up, then writes
 *
 * To undo, feed the backup back in:
 *
 *   node scripts/normalise-display-order.js --restore backups/<file>.json
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const env = require('../src/config/env');

const BACKUP_DIR = path.join(__dirname, '../backups');

/**
 * The collections this migration owns. `groupBy` names the field that splits a
 * collection into separately-numbered lists — sub-categories are numbered per
 * parent, everything else as one flat list.
 */
const LISTS = [
  { collection: 'categories', label: 'name' },
  { collection: 'subcategories', label: 'name', groupBy: 'category' },
  { collection: 'brands', label: 'name' },
  { collection: 'cancellationreasons', label: 'label' },
];

/**
 * The order the storefront and admin already read these rows in, which is the
 * order this migration hands back — `createdAt` only ever breaks a tie between
 * two rows sharing a number.
 */
function currentOrder(a, b) {
  return (
    (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
    new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  );
}

/** The rows in one list whose number has to move, and what it becomes. */
function corrections(rows) {
  return [...rows]
    .sort(currentOrder)
    .map((row, index) => ({ row, from: row.displayOrder ?? null, to: index }))
    .filter((change) => change.from !== change.to);
}

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const row of rows) {
    await mongoose.connection
      .collection(row.collection)
      .updateOne(
        { _id: new mongoose.Types.ObjectId(row._id) },
        { $set: { displayOrder: row.displayOrder } }
      );
  }
  console.log(`restored displayOrder on ${rows.length} rows from ${path.basename(file)}`);
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

  const changes = [];
  let checked = 0;

  for (const list of LISTS) {
    const rows = await mongoose.connection.collection(list.collection).find({}).toArray();
    checked += rows.length;

    // One bucket per independently-numbered list.
    const buckets = new Map();
    for (const row of rows) {
      const key = list.groupBy ? String(row[list.groupBy]) : '*';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(row);
    }

    for (const bucket of buckets.values()) {
      for (const change of corrections(bucket)) {
        changes.push({
          collection: list.collection,
          _id: String(change.row._id),
          label: change.row[list.label],
          from: change.from,
          to: change.to,
        });
      }
    }
  }

  if (!changes.length) {
    console.log(`${checked} rows checked — every list is already numbered 0, 1, 2 …`);
    await mongoose.disconnect();
    return;
  }

  console.log(`${changes.length} of ${checked} rows are numbered out of sequence:\n`);
  for (const change of changes) {
    console.log(
      `  ${change.collection.padEnd(20)} ${String(change.label).slice(0, 34).padEnd(36)} ` +
        `order ${change.from ?? '—'} → ${change.to}`
    );
  }

  if (!commit) {
    console.log('\ndry run — nothing written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(BACKUP_DIR, `display-order-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      changes.map((c) => ({ collection: c.collection, _id: c._id, displayOrder: c.from })),
      null,
      2
    )
  );
  console.log(`\nbacked up ${changes.length} rows → ${path.relative(process.cwd(), backup)}`);

  for (const change of changes) {
    await mongoose.connection
      .collection(change.collection)
      .updateOne({ _id: new mongoose.Types.ObjectId(change._id) }, { $set: { displayOrder: change.to } });
  }
  console.log(`updated ${changes.length} rows`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
