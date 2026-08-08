import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  attributesOf,
  defaultSelection,
  findVariant,
  galleryFor,
  pricingFor,
  resolveSelection,
  selectionOf,
} from '../utils/variants';

/**
 * Owns which combination the shopper is looking at.
 *
 * Choosing a colour re-derives which sizes are possible (and vice versa) through
 * `resolveSelection`, so the two selectors stay consistent without either of them knowing
 * the other exists. Everything the buy box needs — gallery, price, stock, SKU — falls out
 * of the resolved variant, which is why switching is instant and never reloads the page.
 *
 * @param product the detail payload, including its `variants` array
 * @param {{ initialSku?: string }} [options] preselect from a `?v=SKU` deep link
 */
export default function useVariantSelection(product, { initialSku } = {}) {
  const variants = useMemo(() => product?.variants || [], [product]);
  const attributes = useMemo(() => attributesOf(product), [product]);
  const hasVariants = Boolean(product?.hasVariants && variants.length);

  const [selection, setSelection] = useState({});

  // Re-seed whenever the product changes, or when a live update reshapes the matrix
  // (an admin restocked a size, another shopper took the last one).
  useEffect(() => {
    if (!hasVariants) {
      setSelection({});
      return;
    }

    setSelection((current) => {
      const deepLinked = initialSku && variants.find((v) => v.sku === initialSku);
      const seed = Object.keys(current).length
        ? current
        : deepLinked
          ? selectionOf(deepLinked)
          : defaultSelection(product);

      // Repair rather than reset: a selection that is still valid must survive a refetch,
      // otherwise a background stock update would yank the shopper back to the default.
      return resolveSelection(variants, attributes, seed, null);
    });
    // `product` is the whole payload — depending on it is what makes a refetch re-validate.
  }, [product, variants, attributes, hasVariants, initialSku]);

  const select = useCallback(
    (attributeSlug, valueSlug) => {
      setSelection((current) =>
        resolveSelection(variants, attributes, { ...current, [attributeSlug]: valueSlug }, attributeSlug)
      );
    },
    [variants, attributes]
  );

  const variant = useMemo(
    () => (hasVariants ? findVariant(variants, selection, attributes) : null),
    [hasVariants, variants, selection, attributes]
  );

  const images = useMemo(() => galleryFor(product, variant), [product, variant]);
  const pricing = useMemo(() => pricingFor(product, variant), [product, variant]);

  return {
    hasVariants,
    attributes,
    variants,
    selection,
    select,
    variant,
    images,
    pricing,
    /** True while the shopper still owes us a choice — the buy buttons stay disabled. */
    incomplete: hasVariants && !variant,
  };
}
