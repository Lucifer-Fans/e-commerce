import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { updateCartItem, removeCartItem, toggleSaveForLater } from '../../store/cartSlice';
import { formatPrice, optimisedImage } from '../../utils/format';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import QuantitySelector from '../common/QuantitySelector';
import ConfirmDialog from '../common/ConfirmDialog';

export default function CartItemRow({ item, saved = false }) {
  const { t } = useTranslation(['checkout', 'common']);
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const product = item.product;
  // Deep-links back to the exact combination this line is for.
  const detailUrl = item.variantSku
    ? `/product/${product.slug}?v=${item.variantSku}`
    : `/product/${product.slug}`;

  const run = async (thunk, successMessage) => {
    setBusy(true);
    try {
      await dispatch(thunk).unwrap();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      toast.error(err?.message || t('cart.updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={`relative flex gap-4 border-b border-ink-100 py-4 last:border-0 ${
          busy ? 'opacity-60' : ''
        }`}
      >
        {busy && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <Spinner size={22} className="text-brand-600" />
          </div>
        )}

        {/* The row shows the SKU's own photo when it has one — a cart of three colours of
            the same shirt must not show the same picture three times. */}
        <Link to={detailUrl} className="shrink-0">
          <img
            src={optimisedImage(item.image, { width: 200, height: 200 })}
            alt={product.name}
            loading="lazy"
            className="h-24 w-24 rounded-lg border border-ink-200 object-cover sm:h-28 sm:w-28"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-4">
            <div className="min-w-0">
              {product.brand && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {product.brand}
                </p>
              )}
              <Link
                to={detailUrl}
                className="line-clamp-2 text-sm font-medium text-ink-800 hover:text-brand-600"
              >
                {product.name}
              </Link>

              {/* The chosen attributes, so a cart of four near-identical lines is readable. */}
              {item.variant?.attributes?.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.variant.attributes.map((attribute) => (
                    <span
                      key={attribute.name}
                      className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
                    >
                      {attribute.name}: <span className="font-semibold text-ink-800">{attribute.value}</span>
                    </span>
                  ))}
                </div>
              )}

              {product.category?.name && (
                <p className="mt-0.5 text-xs text-ink-400">
                  {product.category.name}
                  {item.variantSku && <span className="ml-2">· {item.variantSku}</span>}
                </p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="text-base font-bold text-ink-900">{formatPrice(item.lineTotal)}</p>
              {item.discountPercent > 0 && (
                <p className="text-xs text-ink-400 line-through">
                  {formatPrice(item.price * item.quantity)}
                </p>
              )}
            </div>
          </div>

          {!item.inStock && (
            <p className="mt-1.5 text-xs font-semibold text-danger">{t('cart.lineOutOfStock')}</p>
          )}
          {item.inStock && item.quantityExceedsStock && (
            <p className="mt-1.5 text-xs font-semibold text-accent-dark">
              {t('cart.lineExceedsStock', { count: item.stock })}
            </p>
          )}
          {item.priceChanged && item.inStock && (
            <p className="mt-1.5 text-xs text-brand-600">
              {t('cart.linePriceChanged', { was: formatPrice(item.priceAtAdd) })}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!saved && item.inStock && (
              <QuantitySelector
                size="sm"
                value={item.quantity}
                max={item.maxQuantity || 10}
                disabled={busy}
                onChange={(quantity) =>
                  run(updateCartItem({ itemId: item._id, quantity }))
                }
              />
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  toggleSaveForLater({ itemId: item._id, savedForLater: !saved }),
                  t(saved ? 'cart.movedToCart' : 'cart.savedToast')
                )
              }
              className="text-xs font-semibold text-ink-500 hover:text-brand-600"
            >
              {t(saved ? 'cart.moveToCart' : 'cart.saveForLater')}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-danger"
            >
              <Icon name="trash" size={13} />
              {t('common:actions.remove')}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => run(removeCartItem(item._id), t('cart.itemRemoved'))}
        title={t('cart.removeTitle')}
        message={t('cart.removeMessage', { name: product.name })}
        confirmLabel={t('common:actions.remove')}
      />
    </>
  );
}
