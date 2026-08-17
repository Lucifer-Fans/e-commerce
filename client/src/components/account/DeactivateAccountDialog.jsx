import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { userApi } from '../../api/endpoints';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import Icon from '../common/Icon';
import OtpInput from '../auth/OtpInput';

/** The escape hatch is not a stored reason — it is always the last radio. */
const OTHER = 'other';
const DEFAULT_LENGTH = 6;

/**
 * The second and third steps of closing an account: *why*, and *is it you*.
 *
 * The confirmation dialog has already asked whether to go ahead, so this one
 * collects the reason, sends the code that reason earns, and takes the code back.
 * The two steps live in one component because they are one decision: backing out
 * of the code screen returns to the reason rather than to the beginning, and the
 * reason itself is never re-sent — the server holds it against the code it
 * issued, so the two cannot end up describing different decisions.
 *
 * The picklist is fetched each time the dialog opens, exactly as the order cancel
 * dialog fetches its own, so a reason retired this morning is not still on offer
 * in a tab left open since yesterday. The server re-checks the chosen id for the
 * same reason.
 *
 * `onDeactivated` runs only after the account is actually closed.
 */
export default function DeactivateAccountDialog({ open, onClose, onDeactivated, onBlocked }) {
  const { t } = useTranslation(['account', 'common']);

  const [step, setStep] = useState('reason');

  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');

  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    // Reopening after backing out starts clean rather than resuming a decision
    // the shopper can no longer see.
    setStep('reason');
    setSelected('');
    setCustom('');
    setCode('');
    setSent(null);
    setError('');

    let cancelled = false;
    setLoading(true);
    userApi.deactivate
      .reasons()
      .then((res) => {
        if (!cancelled) setReasons(res?.data?.reasons || []);
      })
      .catch(() => {
        // "Other" alone still lets someone say why, so a failed list is a degraded
        // dialog rather than a dead end.
        if (!cancelled) setReasons([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // One ticking second at a time, like the sign-up code screen: the number is only
  // ever read by the button beside it, and it is never more than a minute.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const isOther = selected === OTHER;
  const codeLength = sent?.codeLength || DEFAULT_LENGTH;

  /** Step one → two: name the reason, and be sent the code it earns. */
  const sendCode = async (resend = false) => {
    if (!selected) return setError(t('settings.deactivateReasonRequired'));
    const typed = custom.trim();
    if (isOther && typed.length < 5) return setError(t('settings.deactivateReasonCustomRequired'));

    setError('');
    setWorking(true);
    try {
      const res = await userApi.deactivate.start(isOther ? { reason: typed } : { reasonId: selected });
      setSent(res.data);
      setCooldown(res.data?.resendAvailableInSeconds || 60);
      setCode('');
      setStep('otp');
      return undefined;
    } catch (err) {
      // An order placed since this screen opened. The rule is not this dialog's to
      // explain, so it hands off to the one that lists what is in the way.
      if (err?.code === 'PENDING_ORDERS') {
        onBlocked?.(err?.errors?.openOrders);
        return undefined;
      }

      setError(err?.message || t('settings.deactivateFailed'));
      // A refused resend still has to stop the button offering something the
      // server has already said no to.
      if (err?.code === 'OTP_COOLDOWN') {
        const wait = Number(String(err.message).match(/\d+/)?.[0]);
        if (wait) setCooldown(wait);
        if (resend) setStep('otp');
      }
      return undefined;
    } finally {
      setWorking(false);
    }
  };

  /** Step two: the code, and the closure it performs. */
  const confirm = async (value = code) => {
    if (value.length !== codeLength) return setError(t('settings.deactivateCodeIncomplete'));

    setError('');
    setWorking(true);
    try {
      await userApi.deactivate.confirm(value);
      await onDeactivated?.();
    } catch (err) {
      // Checked again on the confirming call, because a code is good for ten
      // minutes and checking out takes less than that.
      if (err?.code === 'PENDING_ORDERS') {
        onBlocked?.(err?.errors?.openOrders);
        return undefined;
      }

      setError(err?.message || t('settings.deactivateFailed'));
      // A code that can no longer work is cleared rather than left in the boxes
      // looking like something that might still be tried.
      if (err?.code === 'OTP_EXPIRED' || err?.code === 'OTP_UNUSABLE') setCode('');
    } finally {
      setWorking(false);
    }
  };

  const options = [
    ...reasons.map((reason) => ({ value: reason._id, label: reason.label })),
    { value: OTHER, label: t('settings.deactivateReasonOther') },
  ];

  const errorNote = error && (
    <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-danger">
      <Icon name="alert" size={14} className="shrink-0" />
      {error}
    </p>
  );

  if (step === 'otp') {
    return (
      <Modal
        open={open}
        onClose={working ? () => {} : onClose}
        title={t('settings.deactivateVerifyTitle')}
        sheet
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep('reason');
              }}
              disabled={working}
              className="btn-outline"
            >
              {t('common:actions.back')}
            </button>
            <button
              type="button"
              onClick={() => confirm()}
              disabled={working || code.length !== codeLength}
              className="btn-danger"
            >
              {working && <Spinner size={14} />}
              {t('settings.deactivateVerifyAction')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            {t('settings.deactivateVerifyIntro', { email: sent?.email })}
          </p>

          <OtpInput
            label={t('auth.verifyCodeLabel')}
            value={code}
            length={codeLength}
            disabled={working}
            invalid={Boolean(error)}
            onChange={(next) => {
              setCode(next);
              if (error) setError('');
            }}
            // Deliberately no auto-submit. Typing the last digit of a sign-up code
            // means "let me in"; here it would mean "close my account", and the
            // last irreversible step should cost a deliberate click.
          />

          <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
            <Icon name="mail" size={14} className="mt-0.5 shrink-0" />
            {t('auth.verifyExpiry', { minutes: sent?.expiresInMinutes || 10 })}
          </p>

          {sent?.devOtp && (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs">
              <p className="mb-1 font-semibold text-amber-800">{t('auth.devMode')}</p>
              <p className="font-mono text-base tracking-[0.3em] text-amber-900">{sent.devOtp}</p>
            </div>
          )}

          <div className="text-center text-sm text-ink-500">
            {t('auth.noCode')}{' '}
            <button
              type="button"
              onClick={() => sendCode(true)}
              disabled={working || cooldown > 0}
              className="font-semibold text-brand-600 hover:underline disabled:text-ink-400 disabled:no-underline"
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
          </div>

          {errorNote}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={working ? () => {} : onClose}
      title={t('settings.deactivateReasonTitle')}
      // Slides up from the bottom edge on phones, like the cancel-order dialog
      // this one is deliberately built to feel like.
      sheet
      footer={
        <>
          <button type="button" onClick={onClose} disabled={working} className="btn-outline">
            {t('common:actions.cancel')}
          </button>
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={working || loading}
            className="btn-danger"
          >
            {working && <Spinner size={14} />}
            {t('settings.deactivateConfirm')}
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
          <p className="pb-2 text-sm text-ink-500">{t('settings.deactivateReasonIntro')}</p>

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
                  name="deactivation-reason"
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
              <label htmlFor="deactivate-reason-other" className="label">
                {t('settings.deactivateReasonOtherLabel')}
              </label>
              <textarea
                id="deactivate-reason-other"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setError('');
                }}
                rows={3}
                maxLength={300}
                autoFocus
                placeholder={t('settings.deactivateReasonOtherPlaceholder')}
                className="input resize-none"
              />
              <p className="mt-1 text-right text-xs text-ink-400">{custom.length}/300</p>
            </div>
          )}

          {errorNote}
        </div>
      )}
    </Modal>
  );
}
