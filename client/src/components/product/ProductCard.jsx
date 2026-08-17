import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useCartActions from '../../hooks/useCartActions';
import { formatPrice, optimisedImage, primaryImageOf } from '../../utils/format';
import { hasPriceRange } from '../../utils/variants';
import Icon from '../common/Icon';
import Rating from '../common/Rating';
import WishlistButton from './WishlistButton';

/**
 * The single product tile used by the homepage rails, listing grid, related
 * products and wishlist. Memoised because grids re-render on every filter change.
 */
function ProductCard({ product, className = '' }) {
  const { t } = useTranslation();
  const { handleAddToCart } = useCartActions();

  const image = primaryImageOf(product);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= (product.lowStockThreshold ?? 5);
  const hasDiscount = product.discountPercent > 0;

  // A varied product advertises its cheapest SKU and how many options there are, then
  // sends the shopper to the details page to pick — a grid tile is the wrong place to
  // choose a size, and Add to Cart there would have to guess one.
  const showsRange = hasPriceRange(product) && !product.savedVariantSku;
  const detailUrl = product.savedVariantSku
    ? `/product/${product.slug}?v=${product.savedVariantSku}`
    : `/product/${product.slug}`;

  return (
    <article
      className={`group card relative flex flex-col overflow-hidden transition-all duration-300
                  hover:-translate-y-1 hover:shadow-card-hover ${className}`}
    >
      <Link to={detailUrl} className="block" aria-label={product.name}>
        <div className="relative aspect-square overflow-hidden bg-ink-50">
          {image ? (
            <img
              src={optimisedImage(image, { width: 500 })}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full place-items-center text-ink-300">
              <Icon name="emptyBox" size={40} />
            </div>
          )}

          {hasDiscount && (
            <span className="absolute left-2.5 top-2.5 rounded-md bg-danger px-2 py-1 text-[11px] font-bold text-white shadow-sm">
              {t('product.discountOff', { percent: Math.round(product.discountPercent) })}
            </span>
          )}

          {outOfStock && (
            <div className="absolute inset-0 grid place-items-center bg-white/75 backdrop-blur-[1px]">
              <span className="rounded-md bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                {t('product.outOfStock')}
              </span>
            </div>
          )}
        </div>
      </Link>

      <WishlistButton product={product} className="absolute right-2.5 top-2.5 h-9 w-9" />

      <div className="flex flex-1 flex-col p-3.5">
        <Link to={detailUrl} className="mb-2 block">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink-800 transition group-hover:text-brand-600">
            {product.name}
          </h3>
          {/* Set on wishlist tiles: the option that was saved, not the product's default. */}
          {product.savedVariantLabel && (
            <p className="mt-0.5 text-[11px] font-medium text-ink-500">{product.savedVariantLabel}</p>
          )}
        </Link>

        {product.ratings?.count > 0 && (
          <Rating value={product.ratings.average} count={product.ratings.count} className="mb-2" />
        )}

        <div className="mt-auto">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            {showsRange && (
              <span className="text-xs font-medium text-ink-500">{t('product.from')}</span>
            )}
            <span className="text-lg font-bold text-ink-900">
              {formatPrice(showsRange ? product.variantSummary.minPrice : product.finalPrice)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-ink-400 line-through">{formatPrice(product.price)}</span>
            )}
            {lowStock && (
              <span className="text-[11px] font-semibold text-accent-dark">
                {t('product.onlyLeft', { count: product.stock })}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleAddToCart(product)}
            disabled={outOfStock}
            className="btn-primary w-full !py-2 text-xs"
          >
            <Icon name="cart" size={15} />
            {outOfStock
              ? t('product.outOfStock')
              : product.hasVariants
                ? t('product.selectOptions')
                : t('product.addToCart')}
          </button>
        </div>
      </div>
    </article>
  );
}

export default memo(ProductCard);
