/**
 * Keeps a `displayOrder` column dense, sequential and duplicate-free.
 *
 * Admins think of the order column as "position 3", not "some number that sorts
 * before position 4" — so two rows sharing a number, or a gap left behind by a
 * delete, both read as a bug. Every write therefore ends by renumbering the whole
 * list 0..n-1: an incoming position is *inserted* at that index and everything
 * from there down shifts by one, rather than colliding.
 *
 * Scope is whatever `filter` selects — all categories, or the sub-categories of a
 * single parent — so sibling lists renumber independently.
 */

/** Ties are broken by age so a freshly inserted row never displaces a sibling by accident. */
const SORT = { displayOrder: 1, createdAt: 1 };

/**
 * The position a brand-new row should take when the admin didn't name one:
 * the end of its list.
 */
async function nextDisplayOrder(Model, filter = {}) {
  return Model.countDocuments(filter);
}

/**
 * Reads the requested position off a request body. Blank, absent or non-numeric
 * all mean "you decide" — the caller appends in that case.
 */
function parseRequestedOrder(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

/**
 * Renumbers the rows matched by `filter` to 0..n-1.
 *
 * With `movedId`/`targetOrder` the named row is first lifted out and re-inserted
 * at that index, which is what turns "save order 5" into "you are 5 now, and the
 * old 5 and everyone after it move down one". Without them it simply closes the
 * gaps a delete left behind.
 *
 * Returns the final positions so a caller can report the row's real order back to
 * the client without re-reading it.
 */
async function resequence(Model, filter = {}, { movedId = null, targetOrder = null } = {}) {
  const docs = await Model.find(filter).select('_id displayOrder').sort(SORT).lean();

  let ordered = docs;
  if (movedId) {
    const id = String(movedId);
    const moved = docs.find((doc) => String(doc._id) === id);
    if (moved) {
      ordered = docs.filter((doc) => String(doc._id) !== id);
      const index =
        targetOrder === null ? ordered.length : Math.min(Math.max(targetOrder, 0), ordered.length);
      ordered.splice(index, 0, moved);
    }
  }

  const ops = [];
  ordered.forEach((doc, index) => {
    if (doc.displayOrder !== index) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { displayOrder: index } } } });
    }
  });
  if (ops.length) await Model.bulkWrite(ops);

  return new Map(ordered.map((doc, index) => [String(doc._id), index]));
}

/**
 * Mirrors the renumbering onto the in-memory document the controller is about to
 * serialise, so the response never contradicts what the next list read will say.
 */
function applyResequenced(doc, positions) {
  const position = positions.get(String(doc._id));
  if (position !== undefined) doc.displayOrder = position;
  return doc;
}

/**
 * The one call a controller needs after a create or an edit: renumber the list,
 * splicing the saved row into the position the admin typed, and report the number
 * it actually landed on back onto the document.
 *
 * A payload that never mentioned the order is not a move — the row keeps its place
 * and the pass only closes any gaps.
 */
async function placeAndResequence(Model, filter, doc, requestedOrder) {
  const positions = await resequence(Model, filter, {
    movedId: requestedOrder === null ? null : doc._id,
    targetOrder: requestedOrder,
  });

  return applyResequenced(doc, positions);
}

module.exports = {
  nextDisplayOrder,
  parseRequestedOrder,
  resequence,
  applyResequenced,
  placeAndResequence,
};
