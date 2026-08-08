import { useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { applyCoupon, removeCoupon } from '../../store/cartSlice';
import { couponApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { formatPrice } from '../../utils/format';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';

/**
 * `appliedDiscount` is the coupon as the totals actually charged it — capped at
 * the subtotal, and recomputed against the billable basket. The stored
 * `discountAmount` can be the larger figure the coupon was worth when it was
 * applied, and confirming a saving the total never gave is worse than none.
 */
export default function CouponBox({ coupon, appliedDiscount }) {
  const { t } = useTranslation(['checkout', 'common']);
  const dispatch = useDispatch();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);

  const { data } = useFetch(useCallback(() => couponApi.available(), []), []);
  const available = data?.data?.coupons || [];

  const apply = async (value) => {
    const target = (value || code).trim();
    if (!target) return toast.error(t('coupon.enterCode'));

    setBusy(true);
    try {
      await dispatch(applyCoupon(target)).unwrap();
      toast.success(t('coupon.applied'));
      setCode('');
      setShowAvailable(false);
    } catch (err) {
      toast.error(err?.message || t('coupon.applyFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await dispatch(removeCoupon()).unwrap();
      toast.success(t('coupon.removed'));
    } finally {
      setBusy(false);
    }
  };

  if (coupon?.code) {
    return (
      <div className="card flex items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success text-white">
            <Icon name="check" size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">
              {t('coupon.codeApplied', { code: coupon.code })}
            </p>
            <p className="text-xs text-success">
              {t('coupon.youSaved', {
                amount: formatPrice(appliedDiscount ?? coupon.discountAmount, { precise: true }),
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-xs font-semibold text-danger hover:underline"
        >
          {t('common:actions.remove')}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="tag" size={16} className="text-brand-600" />
        <h3 className="text-sm font-bold text-ink-900">{t('coupon.applyTitle')}</h3>
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          placeholder={t('coupon.placeholder')}
          maxLength={24}
          className="input uppercase"
          aria-label={t('coupon.label')}
        />
        <button type="button" onClick={() => apply()} disabled={busy} className="btn-primary shrink-0">
          {busy && <Spinner size={14} />}
          {t('common:actions.apply')}
        </button>
      </div>

      {available.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAvailable((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            {t(showAvailable ? 'coupon.hideAvailable' : 'coupon.viewAvailable', {
              count: available.length,
            })}
            <Icon name={showAvailable ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>

          {showAvailable && (
            <ul className="mt-3 space-y-2">
              {available.map((item) => (
                <li
                  key={item._id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-ink-300 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-900">{item.code}</p>
                    <p className="text-xs text-ink-500">{item.description}</p>
                    {item.minOrderAmount > 0 && (
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {t('coupon.minOrder', { amount: formatPrice(item.minOrderAmount) })}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => apply(item.code)}
                    disabled={busy}
                    className="shrink-0 text-xs font-bold text-brand-600 hover:underline"
                  >
                    {t('common:actions.apply')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
