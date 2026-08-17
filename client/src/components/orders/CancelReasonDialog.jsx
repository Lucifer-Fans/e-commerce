import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orderApi } from '../../api/endpoints';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import Icon from '../common/Icon';

/** The escape hatch is not a stored reason — it is always the last radio. */
const OTHER = 'other';

/**
 * Second step of the cancel flow: *why*.
 *
 * The confirmation dialog has already asked whether to go ahead, so this one only
 * collects the reason and then does the cancelling. The list is whatever an admin
 * has published, fetched each time the dialog opens so a reason retired this
 * morning is not still on offer in a tab left open since yesterday — and the
 * server re-checks the chosen id for exactly the same reason.
 *
 * `onConfirm` receives the payload the API takes: `{ reasonId }` for a published
 * reason, `{ reason }` for the shopper's own words.
 */
export default function CancelReasonDialog({ open, onClose, onConfirm }) {
  const { t } = useTranslation(['account', 'common']);

  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    // Reopening after a failed attempt starts clean rather than re-submitting a
    // choice the shopper can no longer see.
    setSelected('');
    setCustom('');
    setError('');

    let cancelled = false;
    setLoading(true);
    orderApi
      .cancellationReasons()
      .then((res) => {
        if (!cancelled) setReasons(res?.data?.reasons || []);
      })
      .catch(() => {
        // "Other" alone still lets the shopper cancel, so a failed list is a
        // degraded dialog rather than a dead end.
        if (!cancelled) setReasons([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const isOther = selected === OTHER;

  const submit = async () => {
    if (!selected) return setError(t('detail.reasonRequired'));
    const typed = custom.trim();
    if (isOther && typed.length < 5) return setError(t('detail.reasonCustomRequired'));

    setError('');
    setWorking(true);
    try {
      await onConfirm(isOther ? { reason: typed } : { reasonId: selected });
      onClose?.();
    } catch (err) {
      setError(err?.message || t('detail.cancelFailed'));
    } finally {
      setWorking(false);
    }
  };

  const options = [
    ...reasons.map((reason) => ({ value: reason._id, label: reason.label })),
    { value: OTHER, label: t('detail.reasonOther') },
  ];

  return (
    <Modal
      open={open}
      onClose={working ? () => {} : onClose}
      title={t('detail.reasonTitle')}
      // Slides up from the bottom edge on phones, like the product image viewer.
      sheet
      footer={
        <>
          <button type="button" onClick={onClose} disabled={working} className="btn-outline">
            {t('detail.cancelDismiss')}
          </button>
          <button type="button" onClick={submit} disabled={working || loading} className="btn-danger">
            {working && <Spinner size={14} />}
            {t('detail.reasonSubmit')}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={22} />
        </div>
      ) : (
        <div className="space-y-1">
          {options.map((option) => {
            const active = selected === option.value;

            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg px-2 py-3 transition
                            hover:bg-ink-50 ${active ? 'bg-ink-50' : ''}`}
              >
                <input
                  type="radio"
                  name="cancellation-reason"
                  value={option.value}
                  checked={active}
                  onChange={() => {
                    setSelected(option.value);
                    setError('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                />
                <span className="min-w-0 text-sm text-ink-800">{option.label}</span>
              </label>
            );
          })}

          {isOther && (
            <div className="pt-2">
              <label htmlFor="cancel-reason-other" className="label">
                {t('detail.reasonOtherLabel')}
              </label>
              <textarea
                id="cancel-reason-other"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setError('');
                }}
                rows={3}
                maxLength={300}
                autoFocus
                placeholder={t('detail.reasonOtherPlaceholder')}
                className="input resize-none"
              />
              <p className="mt-1 text-right text-xs text-ink-400">{custom.length}/300</p>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-danger">
              <Icon name="alert" size={14} />
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
