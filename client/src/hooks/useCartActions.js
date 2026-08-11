import { useCallback } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addToCart } from '../store/cartSlice';
import { toggleWishlist } from '../store/wishlistSlice';

/**
 * Reactive membership test for one product, subscribed to as a boolean.
 *
 * Kept out of `useCartActions` on purpose. That hook is called by every product
 * tile in a grid, and if it subscribed to the wishlist *array* then adding a single
 * item would re-render every card on the page — `ProductCard`'s `memo()` cannot
 * prevent a re-render that a store subscription inside the component triggers.
 * Selecting a boolean means a card only re-renders when its own heart changes.
 */
export function useIsWishlisted(productId) {
  return useSelector((s) => s.wishlist.ids.includes(productId));
}

/**
 * Cart/wishlist actions with the auth gate and toasts applied once, so every
 * product card, details page and wishlist row behaves identically.
 *
 * Subscribes to as little as possible: the returned callbacks are used in event
 * handlers, and a grid of cards all calling this must not turn one store write into
 * a full-grid re-render. Anything needed only at click time is read off the store
 * directly rather than selected during render.
 */
export default function useCartActions() {
  const dispatch = useDispatch();
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  // Toasts fired from here belong to the shell, not to any one route, so they read
  // from the always-loaded `common` namespace.
  const { t } = useTranslation();
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);

  const requireAuth = useCallback(() => {
    if (isAuthenticated) return true;
    toast(t('toast.loginToContinue'), { icon: '🔒' });
    // Bounce back to wherever they were once they're signed in.
    navigate('/login', { state: { from: location.pathname + location.search } });
    return false;
  }, [isAuthenticated, navigate, location, t]);

  /**
   * `variant` is the SKU the shopper picked. A product that has variants cannot be added
   * without one — a card that has no selector sends the shopper to the details page to
   * choose, rather than guessing a size on their behalf.
   */
  const handleAddToCart = useCallback(
    async (product, quantity = 1, variant = null) => {
      if (product.hasVariants && !variant) {
        navigate(`/product/${product.slug}`);
        toast(t('toast.chooseOption'), { icon: '👉' });
        return false;
      }
      if (!requireAuth()) return false;

      const stock = variant ? variant.stock : product.stock;
      if (stock <= 0) {
        toast.error(
          variant
            ? t('toast.variantOutOfStock', { label: variant.label })
            : t('toast.productOutOfStock')
        );
        return false;
      }

      try {
        await dispatch(
          addToCart({ productId: product._id, variantId: variant?._id || undefined, quantity })
        ).unwrap();
        toast.success(t('toast.addedToCart'));
        return true;
      } catch (err) {
        toast.error(err?.message || t('toast.addToCartFailed'));
        return false;
      }
    },
    [dispatch, requireAuth, navigate, t]
  );

  const handleBuyNow = useCallback(
    async (product, quantity = 1, variant = null) => {
      const added = await handleAddToCart(product, quantity, variant);
      if (added) navigate('/checkout');
    },
    [handleAddToCart, navigate]
  );

  const handleToggleWishlist = useCallback(
    async (product, variant = null) => {
      if (!requireAuth()) return;
      // Read at click time rather than selected during render — the toast only needs
      // to know which way the toggle went, and subscribing here would re-render the
      // whole grid on every wishlist change.
      const wasWishlisted = store.getState().wishlist.ids.includes(product._id);
      try {
        await dispatch(
          toggleWishlist({ productId: product._id, variantId: variant?._id || undefined })
        ).unwrap();
        toast.success(t(wasWishlisted ? 'toast.removedFromWishlist' : 'toast.addedToWishlist'));
      } catch (err) {
        toast.error(err?.message || t('toast.wishlistFailed'));
      }
    },
    [dispatch, requireAuth, store, t]
  );

  return { handleAddToCart, handleBuyNow, handleToggleWishlist };
}
