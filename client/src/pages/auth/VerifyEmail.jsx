import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { verifyEmail, clearAuthError } from '../../store/authSlice';
import { fetchCart } from '../../store/cartSlice';
import { fetchWishlistIds } from '../../store/wishlistSlice';
import { authApi } from '../../api/endpoints';
import { markWelcomePending } from '../../i18n/welcomePrompt';
import Seo from '../../components/common/Seo';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import AuthShell from '../../components/auth/AuthShell';
import OtpInput from '../../components/auth/OtpInput';

const DEFAULT_LENGTH = 6;

/**
 * The second half of registering: the code, and nothing else.
 *
 * The address comes from the router state rather than a form field — it is either
 * the one just registered or the one a login was refused for, and re-typing it
 * here would only be a chance to type it differently. Router state also survives
 * a reload of this route, which the store does not, so a shopper who refreshes
 * mid-code is not thrown back to the sign-up form.
 */
export default function VerifyEmail() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, errorCode, isAuthenticated, pendingVerification } = useSelector(
    (s) => s.auth
  );

  const pending = location.state?.email ? location.state : pendingVerification;
  const email = pending?.email || '';
  const codeLength = pending?.codeLength || DEFAULT_LENGTH;
  const redirectTo = location.state?.from || '/';

  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState(pending?.devOtp || null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(pending?.resendAvailableInSeconds || 0);
  // Guards the auto-submit: the last full code we already sent, so a failed
  // attempt left on screen is not re-submitted the moment the field re-renders.
  const submitted = useRef(null);

  useEffect(() => {
    // Nothing to verify — whoever landed here typed the URL.
    if (!email) navigate('/register', { replace: true });
  }, [email, navigate]);

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  useEffect(() => () => dispatch(clearAuthError()), [dispatch]);

  // One ticking second at a time rather than a timestamp diff: the number is only
  // ever read by the button label beside it, and it is never more than a minute.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // A code that is no longer accepted is a dead end until a new one is asked for,
  // so the screen says so by clearing the boxes rather than leaving digits that
  // cannot work sitting in them.
  useEffect(() => {
    if (errorCode === 'OTP_EXPIRED' || errorCode === 'OTP_UNUSABLE') {
      setCode('');
      submitted.current = null;
    }
    if (errorCode === 'ALREADY_VERIFIED') {
      toast.success(t('auth.alreadyVerified'));
      navigate('/login', { replace: true, state: { email } });
    }
  }, [errorCode, email, navigate, t]);

  const submit = useCallback(
    async (value) => {
      if (value.length !== codeLength || loading) return;
      submitted.current = value;

      try {
        await dispatch(verifyEmail({ email, otp: value })).unwrap();
        // The sign-up is complete only here — this is the one moment that earns
        // the welcome language prompt. The home page picks the flag up after the
        // redirect below; landing anywhere else simply defers it.
        markWelcomePending();
        // Personalised data is only meaningful once a session exists.
        dispatch(fetchCart());
        dispatch(fetchWishlistIds());
        toast.success(t('auth.verifySuccess'));
      } catch {
        /* the slice already stored the message */
      }
    },
    [codeLength, dispatch, email, loading, t]
  );

  const resend = async () => {
    setResending(true);
    dispatch(clearAuthError());
    try {
      const res = await authApi.resendOtp({ email });
      setDevOtp(res.data?.devOtp || null);
      setCooldown(res.data?.resendAvailableInSeconds || 60);
      setCode('');
      submitted.current = null;
      toast.success(t('auth.resendSent'));
    } catch (err) {
      toast.error(err.message || t('auth.resendFailed'));
      // The API tells us how long is left when it refuses; honour it so the
      // button stops offering something it already knows will be turned down.
      const wait = Number(String(err.message).match(/\d+/)?.[0]);
      if (err.code === 'OTP_COOLDOWN' && wait) setCooldown(wait);
    } finally {
      setResending(false);
    }
  };

  if (!email) return null;

  const busy = loading || resending;

  return (
    <>
      <Seo title={t('auth.verifyTitle')} path="/verify-email" noIndex />

      <AuthShell
        title={t('auth.verifyHeading')}
        subtitle={t('auth.verifySubtitle', { email })}
        footer={
          <>
            {t('auth.wrongEmail')}{' '}
            {/* Lands on the form they already filled in rather than a blank one —
                "start over" here means correcting the address, not retyping the
                lot. The address still travels in state for the one case with no
                draft behind it: a login refused because it was never verified. */}
            <Link
              to="/register"
              state={{ email, from: location.state?.from }}
              className="font-semibold text-brand-600 hover:underline"
            >
              {t('auth.startOver')}
            </Link>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== codeLength) return toast.error(t('auth.verifyIncomplete', { length: codeLength }));
            submit(code);
          }}
          className="space-y-5"
          noValidate
        >
          {error && (
            <div
              className="flex items-start gap-2.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger"
              role="alert"
            >
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <OtpInput
            label={t('auth.verifyCodeLabel')}
            value={code}
            length={codeLength}
            disabled={busy}
            invalid={Boolean(error)}
            onChange={(next) => {
              setCode(next);
              if (error) dispatch(clearAuthError());
            }}
            // Typing the last digit is the shopper saying "done" — asking them to
            // then reach for a button is a step that carries no decision.
            onComplete={(full) => full !== submitted.current && submit(full)}
          />

          <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
            <Icon name="mail" size={14} className="mt-0.5 shrink-0" />
            {t('auth.verifyExpiry', { minutes: pending?.expiresInMinutes || 10 })}
          </p>

          {devOtp && (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs">
              <p className="mb-1 font-semibold text-amber-800">{t('auth.devMode')}</p>
              <p className="font-mono text-base tracking-[0.3em] text-amber-900">{devOtp}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || code.length !== codeLength}
            className="btn-primary w-full !py-3"
          >
            {loading && <Spinner size={16} />}
            {t('auth.verifyAction')}
          </button>

          <div className="text-center text-sm text-ink-500">
            {t('auth.noCode')}{' '}
            <button
              type="button"
              onClick={resend}
              disabled={busy || cooldown > 0}
              className="font-semibold text-brand-600 hover:underline disabled:text-ink-400 disabled:no-underline"
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
          </div>
        </form>
      </AuthShell>
    </>
  );
}
