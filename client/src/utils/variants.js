/**
 * The variant matrix — pure functions, no React.
 *
 * The product page is handed every combination up front (including the sold-out and
 * inactive ones, which stay visible and disabled rather than hidden), so switching a colour
 * or a size is instant and never costs a request. Everything below works off that array and
 * knows nothing about which attributes exist: Color, Size, Storage, RAM, Waist, Shoe Size
 * or anything a future catalogue adds all flow through the same code.
 */

/** `{ color: 'black', size: 'm' }` — the shape a selection always takes. */
export const selectionOf = (variant) =>
  Object.fromEntries((variant?.attributes || []).map((a) => [a.slug, a.valueSlug]));

export const variantLabel = (variant) =>
  variant?.label || (variant?.attributes || []).map((a) => a.value).join(' · ');

/**
 * The attribute definition to render. Prefers the admin's authored order and swatch
 * metadata, and falls back to deriving it from the variants themselves so a product whose
 * definition is missing still renders a working selector instead of nothing.
 */
export function attributesOf(product) {
  const variants = product?.variants || [];
  const authored = product?.variantAttributes || [];

  if (authored.length) {
    // Only values that at least one variant actually uses — an attribute value the admin
    // defined but never generated a SKU for would be a dead chip.
    const used = new Set(variants.flatMap((v) => v.attributes.map((a) => `${a.slug}:${a.valueSlug}`)));

    const kept = authored
      .map((attribute) => ({
        ...attribute,
        values: (attribute.values || []).filter((value) => used.has(`${attribute.slug}:${value.slug}`)),
      }))
      .filter((attribute) => attribute.values.length > 0);

    if (kept.length) return kept;
  }

  const bySlug = new Map();
  variants.forEach((variant) => {
    variant.attributes.forEach((a) => {
      if (!bySlug.has(a.slug)) bySlug.set(a.slug, { name: a.name, slug: a.slug, inputType: 'auto', values: [] });
      const entry = bySlug.get(a.slug);
      if (!entry.values.some((v) => v.slug === a.valueSlug)) {
        entry.values.push({ label: a.value, slug: a.valueSlug });
      }
    });
  });
  return [...bySlug.values()];
}

/**
 * How a value should be painted. `auto` looks at the data: a thumbnail if the value has an
 * image, a colour dot if it has a hex, a text chip otherwise — so adding a new attribute
 * needs no code change.
 */
export function inputTypeOf(attribute) {
  if (attribute.inputType && attribute.inputType !== 'auto') return attribute.inputType;
  if (attribute.values?.some((v) => v.image?.url)) return 'image';
  if (attribute.values?.some((v) => v.hex)) return 'swatch';
  return 'chip';
}

const matchesSelection = (variant, selection) =>
  Object.entries(selection).every(([slug, value]) =>
    variant.attributes.some((a) => a.slug === slug && a.valueSlug === value)
  );

/** The one variant that satisfies every attribute — null while the choice is incomplete. */
export function findVariant(variants = [], selection = {}, attributes = []) {
  if (attributes.length && Object.keys(selection).length < attributes.length) return null;
  return variants.find((v) => matchesSelection(v, selection)) || null;
}

/**
 * Whether a chip should be clickable, and whether it should read as sold out.
 *
 * `exists` — some SKU pairs this value with the *other* choices currently made. When false
 * the chip is disabled: Flipkart keeps it on screen so the shopper can see the option is
 * part of the range, it just isn't stocked in this combination.
 * `inStock` — that pairing is actually buyable right now.
 */
export function optionState(variants, attributeSlug, valueSlug, selection) {
  const others = Object.fromEntries(Object.entries(selection).filter(([slug]) => slug !== attributeSlug));

  const candidates = variants.filter(
    (v) => v.attributes.some((a) => a.slug === attributeSlug && a.valueSlug === valueSlug) &&
      matchesSelection(v, others)
  );

  return {
    exists: candidates.some((v) => v.isActive !== false),
    inStock: candidates.some((v) => v.inStock),
    // Shown under a colour swatch as "from ₹1,299" when sizes are priced differently.
    minPrice: candidates.length ? Math.min(...candidates.map((v) => v.finalPrice)) : null,
  };
}

/**
 * Repairs a selection after one attribute changed.
 *
 * Picking "Blue" when the current size is only made in Black must not leave the shopper on
 * an impossible pair. The attribute they just touched is held fixed; every other one keeps
 * its value when the combination still exists, and otherwise moves to the first value that
 * does — preferring one that is in stock. This is the behaviour that makes sizes appear to
 * "update dynamically" when a colour is chosen, and vice versa.
 */
export function resolveSelection(variants, attributes, selection, changedSlug) {
  const next = changedSlug ? { [changedSlug]: selection[changedSlug] } : {};

  for (const attribute of attributes) {
    if (attribute.slug === changedSlug) continue;

    const current = selection[attribute.slug];
    const usable = (valueSlug) =>
      valueSlug !== undefined &&
      variants.some(
        (v) =>
          v.attributes.some((a) => a.slug === attribute.slug && a.valueSlug === valueSlug) &&
          matchesSelection(v, next)
      );

    if (usable(current)) {
      next[attribute.slug] = current;
      continue;
    }

    const fallback =
      attribute.values.find((value) => {
        const state = optionState(variants, attribute.slug, value.slug, next);
        return state.exists && state.inStock;
      }) || attribute.values.find((value) => optionState(variants, attribute.slug, value.slug, next).exists);

    if (fallback) next[attribute.slug] = fallback.slug;
  }

  return next;
}

/**
 * What the page shows before the shopper touches anything: the admin's default SKU when it
 * is buyable, otherwise the cheapest one that is — never a sold-out combination.
 */
export function defaultSelection(product) {
  const variants = product?.variants || [];
  if (!variants.length) return {};

  const preferred =
    variants.find((v) => v.isDefault && v.inStock) ||
    [...variants].filter((v) => v.inStock).sort((a, b) => a.finalPrice - b.finalPrice)[0] ||
    variants.find((v) => v.isDefault) ||
    variants[0];

  return selectionOf(preferred);
}

/**
 * The gallery for the current choice. A variant with its own photography replaces the
 * product's; one without it inherits, so an admin only has to shoot the colours that differ.
 */
export const galleryFor = (product, variant) =>
  (variant?.images?.length ? variant.images : product?.images) || [];

/** Price/stock/SKU facts of the current choice, falling back to the parent product. */
export function pricingFor(product, variant) {
  const source = variant || product || {};
  const stock = source.stock ?? 0;
  const lowStockThreshold = source.lowStockThreshold ?? product?.lowStockThreshold ?? 5;

  return {
    price: source.price ?? 0,
    finalPrice: source.finalPrice ?? 0,
    discountPercent: source.discountPercent ?? 0,
    savings: Math.max(0, (source.price ?? 0) - (source.finalPrice ?? 0)),
    stock,
    sku: variant?.sku || product?.sku || null,
    outOfStock: stock <= 0,
    lowStock: stock > 0 && stock <= lowStockThreshold,
  };
}

/** "From ₹1,299" on cards: true when the SKUs of one product aren't all the same price. */
export const hasPriceRange = (product) => {
  const { minPrice = 0, maxPrice = 0 } = product?.variantSummary || {};
  return Boolean(product?.hasVariants) && maxPrice - minPrice > 0.009;
};
