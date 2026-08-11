import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useCartActions, { useIsWishlisted } from '../../hooks/useCartActions';
import Icon from '../common/Icon';

/**
 * One heart per product, as always — `variant` only records which option the shopper was
 * looking at, so moving the item to the cart later restores that exact SKU.
 *
 * Subscribes to its own membership as a boolean, so toggling one product in a grid
 * re-renders that heart and no others.
 */
function WishlistButton({ product, variant = null, className = '', size = 18 }) {
  const { t } = useTranslation();
  const { handleToggleWishlist } = useCartActions();
  const active = useIsWishlisted(product._id);

  return (
    <button
      type="button"
      onClick={(e) => {
        // The button often sits inside a card-wide <Link>.
        e.preventDefault();
        e.stopPropagation();
        handleToggleWishlist(product, variant);
      }}
      aria-label={t(active ? 'product.removeFromWishlist' : 'product.addToWishlist')}
      aria-pressed={active}
      className={`grid place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-ink-200 transition
                  hover:scale-110 hover:ring-ink-300 ${active ? 'text-danger' : 'text-ink-400 hover:text-danger'} ${className}`}
    >
      <Icon name="heart" size={size} filled={active} />
    </button>
  );
}

export default memo(WishlistButton);
