import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addToCart } from '../store/cartSlice';
import { toggleWishlist } from '../store/wishlistSlice';

/**
 * Cart/wishlist actions with the auth gate and toasts applied once, so every
 * product card, details page and wishlist row behaves identically.
 */
export default function useCartActions() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  // Toasts fired from here belong to the shell, not to any one route, so they read
  // from the always-loaded `common` namespace.
  const { t } = useTranslation();
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
  const wishlistIds = useSelector((s) => s.wishlist.ids);

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
      const wasWishlisted = wishlistIds.includes(product._id);
      try {
        await dispatch(
          toggleWishlist({ productId: product._id, variantId: variant?._id || undefined })
        ).unwrap();
        toast.success(t(wasWishlisted ? 'toast.removedFromWishlist' : 'toast.addedToWishlist'));
      } catch (err) {
        toast.error(err?.message || t('toast.wishlistFailed'));
      }
    },
    [dispatch, requireAuth, wishlistIds, t]
  );

  return {
    handleAddToCart,
    handleBuyNow,
    handleToggleWishlist,
    isWishlisted: (id) => wishlistIds.includes(id),
  };
}
