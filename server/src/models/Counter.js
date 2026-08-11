const mongoose = require('mongoose');

/**
 * A named, monotonically increasing sequence.
 *
 * `_id` is the sequence key. Order numbers use one bucket per calendar month
 * ("order:2608"), so the running number restarts at 1 when the month rolls over.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: String,
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

/**
 * Claim the next value of `key`. A single `$inc` on a single document, so two
 * shoppers checking out at the same instant can never be handed the same number.
 *
 * The increment joins the caller's transaction when there is one: an order that
 * fails to place hands its number back, and the run stays gapless.
 */
counterSchema.statics.next = async function next(key, session) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    // No setDefaultsOnInsert — it would $setOnInsert `seq` and collide with $inc.
    // An upsert with $inc on a missing document starts the sequence at 1 anyway.
    { new: true, upsert: true, session }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
