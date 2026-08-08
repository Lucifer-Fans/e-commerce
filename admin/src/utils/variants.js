/**
 * Variant helpers for the product wizard.
 *
 * The admin builds and prices combinations *before* the product exists, so the generator
 * has to run here as well as on the server. This is a deliberate mirror of
 * server/src/services/variant.service.js — the server still regenerates keys and SKUs on
 * save, so nothing here is trusted; it exists so the grid can be filled in without a round
 * trip per keystroke.
 */

export const MAX_COMBINATIONS = 500;

/** Same rules as the server's slugify({ lower: true, strict: true }). */
export const toSlug = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents so "Rosé" and "Rose" don't collide
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Sorted fingerprint of a combination — reordering attributes must not mint duplicates. */
export const attributeKeyOf = (attributes = []) =>
  attributes
    .map((a) => `${toSlug(a.slug || a.name)}:${toSlug(a.valueSlug || a.value)}`)
    .sort()
    .join('|');

export const variantLabel = (attributes = []) => attributes.map((a) => a.value).join(' · ');

/** Drops blank rows and duplicate labels so the generator can't emit two identical SKUs. */
export function normaliseAttributes(raw = []) {
  const seen = new Set();

  return raw
    .map((attribute, index) => {
      const name = String(attribute?.name || '').trim();
      const slug = toSlug(name);
      if (!name || !slug || seen.has(slug)) return null;
      seen.add(slug);

      const seenValue = new Set();
      const values = (attribute.values || [])
        .map((value) => {
          const label = String(value?.label ?? '').trim();
          const valueSlug = toSlug(label);
          if (!label || !valueSlug || seenValue.has(valueSlug)) return null;
          seenValue.add(valueSlug);
          return {
            label,
            slug: valueSlug,
            hex: value.hex || undefined,
            image: value.image?.url ? value.image : undefined,
          };
        })
        .filter(Boolean);

      return {
        name,
        slug,
        inputType: attribute.inputType || 'auto',
        helpText: attribute.helpText?.trim() || undefined,
        values,
        displayOrder: index,
      };
    })
    .filter((attribute) => attribute && attribute.values.length > 0);
}

/** Cartesian product, first attribute varying slowest — the order the grid reads in. */
export function generateCombinations(attributes = []) {
  const defs = normaliseAttributes(attributes);
  if (!defs.length) return [];

  return defs.reduce(
    (rows, attribute) =>
      rows.flatMap((row) =>
        attribute.values.map((value) => [
          ...row,
          {
            name: attribute.name,
            slug: attribute.slug,
            value: value.label,
            valueSlug: value.slug,
            displayOrder: attribute.displayOrder,
          },
        ])
      ),
    [[]]
  );
}

export const combinationCount = (attributes = []) =>
  normaliseAttributes(attributes).reduce((total, a) => total * a.values.length, 1) || 0;

/** `SHIRT-BLACK-M` — readable and stable. The server enforces global uniqueness. */
export function buildSku(base, attributes) {
  const prefix = (toSlug(base).replace(/-/g, '').toUpperCase() || 'SKU').slice(0, 16);
  const tail = attributes
    .map((a) => toSlug(a.valueSlug || a.value).replace(/-/g, '').slice(0, 8))
    .join('-')
    .toUpperCase();
  return `${prefix}-${tail}`.slice(0, 64);
}

/**
 * Merges freshly generated combinations with what the admin already priced.
 *
 * Adding one new colour to a product that already has twenty SKUs must not reset the stock
 * on the other twenty — so an existing row is matched by fingerprint and kept whole.
 */
export function mergeCombinations(existing = [], attributes = [], defaults = {}, skuBase = '') {
  const byKey = new Map(existing.map((row) => [attributeKeyOf(row.attributes), row]));

  return generateCombinations(attributes).map((attrs, index) => {
    const found = byKey.get(attributeKeyOf(attrs));
    if (found) return { ...found, attributes: attrs, displayOrder: index };

    return {
      attributes: attrs,
      sku: buildSku(skuBase, attrs),
      price: defaults.price ?? '',
      discountPercent: defaults.discountPercent ?? 0,
      stock: defaults.stock ?? 0,
      lowStockThreshold: defaults.lowStockThreshold ?? 5,
      images: [],
      weight: { value: '', unit: 'g' },
      dimensions: { length: '', width: '', height: '', unit: 'cm' },
      isActive: true,
      displayOrder: index,
    };
  });
}

/** Shapes a wizard row for the API — blanks become undefined rather than NaN. */
const numberOrUndefined = (value) => {
  const n = Number(value);
  return value === '' || value === null || value === undefined || Number.isNaN(n) ? undefined : n;
};

export function toApiVariant(row, index) {
  return {
    _id: row._id,
    attributes: row.attributes.map((a) => ({
      name: a.name,
      slug: a.slug,
      value: a.value,
      valueSlug: a.valueSlug,
      displayOrder: a.displayOrder ?? 0,
    })),
    sku: row.sku?.trim() || undefined,
    price: Number(row.price) || 0,
    discountPercent: Number(row.discountPercent) || 0,
    stock: Number(row.stock) || 0,
    lowStockThreshold: Number(row.lowStockThreshold) || 5,
    images: (row.images || []).map((image, i) => ({
      url: image.url,
      publicId: image.publicId,
      alt: image.alt,
      isPrimary: i === 0,
      displayOrder: i,
    })),
    weight: numberOrUndefined(row.weight?.value)
      ? { value: numberOrUndefined(row.weight.value), unit: row.weight.unit || 'g' }
      : undefined,
    dimensions:
      numberOrUndefined(row.dimensions?.length) ||
      numberOrUndefined(row.dimensions?.width) ||
      numberOrUndefined(row.dimensions?.height)
        ? {
            length: numberOrUndefined(row.dimensions.length),
            width: numberOrUndefined(row.dimensions.width),
            height: numberOrUndefined(row.dimensions.height),
            unit: row.dimensions.unit || 'cm',
          }
        : undefined,
    barcode: row.barcode?.trim() || undefined,
    hsnCode: row.hsnCode?.trim() || undefined,
    isActive: row.isActive !== false,
    isDefault: Boolean(row.isDefault),
    displayOrder: index,
  };
}

/** Turns a saved variant back into the shape the grid edits. */
export const fromApiVariant = (variant) => ({
  _id: variant._id,
  attributes: variant.attributes || [],
  sku: variant.sku || '',
  price: variant.price ?? '',
  discountPercent: variant.discountPercent ?? 0,
  stock: variant.stock ?? 0,
  lowStockThreshold: variant.lowStockThreshold ?? 5,
  images: variant.images || [],
  weight: { value: variant.weight?.value ?? '', unit: variant.weight?.unit || 'g' },
  dimensions: {
    length: variant.dimensions?.length ?? '',
    width: variant.dimensions?.width ?? '',
    height: variant.dimensions?.height ?? '',
    unit: variant.dimensions?.unit || 'cm',
  },
  barcode: variant.barcode || '',
  hsnCode: variant.hsnCode || '',
  isActive: variant.isActive !== false,
  isDefault: Boolean(variant.isDefault),
});

/** Everything the wizard must flag before a varied product can be saved. */
export function validateVariants(attributes, variants) {
  const errors = [];
  const defs = normaliseAttributes(attributes);

  if (!defs.length) {
    errors.push('Add at least one attribute with one value, or turn variants off');
    return errors;
  }
  if (!variants.length) {
    errors.push('Generate the combinations before saving');
    return errors;
  }

  const total = combinationCount(attributes);
  if (total > MAX_COMBINATIONS) {
    errors.push(`${total} combinations exceeds the limit of ${MAX_COMBINATIONS}`);
  }
  if (variants.some((row) => row.price === '' || Number(row.price) < 0)) {
    errors.push('Every variant needs a price');
  }
  if (variants.some((row) => Number(row.discountPercent) < 0 || Number(row.discountPercent) > 95)) {
    errors.push('Variant discounts must be between 0 and 95%');
  }
  if (variants.some((row) => row.stock === '' || Number(row.stock) < 0)) {
    errors.push('Every variant needs a stock quantity');
  }

  const skus = variants.map((row) => row.sku?.trim().toUpperCase()).filter(Boolean);
  if (new Set(skus).size !== skus.length) errors.push('Two variants share the same SKU');

  if (!variants.some((row) => row.isActive !== false)) {
    errors.push('At least one variant must stay active');
  }

  return errors;
}
