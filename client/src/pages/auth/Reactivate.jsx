import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { reactivationApi } from '../../api/endpoints';
import Seo from '../../components/common/Seo';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import PhoneInput from '../../components/common/PhoneInput';
import AuthShell from '../../components/auth/AuthShell';
import OtpInput from '../../components/auth/OtpInput';

const DEFAULT_LENGTH = 6;

/**
 * Where the "Activate My Account" button in the reactivation email lands.
 *
 * It deliberately does not reactivate anything. The link proves someone can read
 * the registered inbox, which is necessary and nowhere near sufficient — an email
 * forwarded, a shared machine or a mailbox someone else has since taken over all
 * satisfy it. So the link only opens the door to two more questions: details only
 * the account holder knows, and a code that proves the inbox is theirs *now*.
 * Passing all three submits a request; a person still decides it.
 *
 * Four states, in order: `opening` (checking the token), `details`, `code`, and
 * `submitted`. There is no route back to a previous step from `submitted` — the
 * token is spent by then, and the only honest next screen is the one that says so.
 */
export default function Reactivate() {
  const { t } = useTranslation(['account', 'common']);
  const { token } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState('opening');
  const [account, setAccount] = useState(null);
  const [fatal, setFatal] = useState('');

  const [values, setValues] = useState({ name: '', phone: '', message: '' });
  const [errors, setErrors] = useState({});

  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  /* The token is checked before a single field is drawn: a dead link should say
     so immediately rather than after someone has filled in a form. */
  useEffect(() => {
    let cancelled = false;

    reactivationApi
      .open(token)
      .then((res) => {
        if (cancelled) return;
        setAccount(res.data);
        setStep('details');
      })
      .catch((err) => {
        if (cancelled) return;
        // An account already active is good news badly timed — send them to sign in.
        if (err?.code === 'ALREADY_ACTIVE') {
          toast.success(err.message);
          navigate('/login', { replace: true });
          return;
        }
        setFatal(err?.message || t('reactivate.linkInvalid'));
        setStep('dead');
      });

    return () => {
      cancelled = true;
    };
  }, [token, navigate, t]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const codeLength = sent?.codeLength || account?.codeLength || DEFAULT_LENGTH;

  /**
   * Step one → two.
   *
   * The details are only shape-checked here; whether they *match* is a question
   * for the server, and one it deliberately answers only after a valid code — so
   * this form can never be used to guess the name on somebody else's account.
   */
  const requestCode = useCallback(
    async (resend = false) => {
      if (!resend) {
        const found = {};
        if (values.name.trim().length < 2) found.name = t('common:validation.nameRequired');
        if (account?.requiresPhone && !/^[6-9]\d{9}$/.test(values.phone)) {
          found.phone = t('common:validation.phoneInvalid');
        }
        if (Object.keys(found).length) {
          setErrors(found);
          return;
        }
      }

      setError('');
      setWorking(true);
      try {
        const res = await reactivationApi.sendOtp(token);
        setSent(res.data);
        setCooldown(res.data?.resendAvailableInSeconds || 60);
        setCode('');
        setStep('code');
      } catch (err) {
        if (err?.code === 'OTP_COOLDOWN') {
          const wait = Number(String(err.message).match(/\d+/)?.[0]);
          if (wait) setCooldown(wait);
          setStep('code');
        }
        setError(err?.message || t('reactivate.codeFailed'));
      } finally {
        setWorking(false);
      }
    },
    [account, token, values.name, values.phone, t]
  );

  /** Step two → done: the code, the details, and the request they add up to. */
  const submit = async () => {
    if (code.length !== codeLength) return setError(t('settings.deactivateCodeIncomplete'));

    setError('');
    setWorking(true);
    try {
      await reactivationApi.submit({
        token,
        otp: code,
        name: values.name.trim(),
        phone: account?.requiresPhone ? values.phone : undefined,
        message: values.message.trim() || undefined,
      });
      setStep('submitted');
      return undefined;
    } catch (err) {
      setError(err?.message || t('reactivate.submitFailed'));
      if (err?.code === 'OTP_EXPIRED' || err?.code === 'OTP_UNUSABLE') setCode('');
      // The details were wrong, which is a question for the previous screen —
      // and the code is spent either way, so going back means asking for a new one.
      if (err?.code === 'DETAILS_MISMATCH') {
        setCode('');
        setStep('details');
      }
      // Somebody else's submission (or a double click) got there first. There is
      // nothing left to do here, and the pending screen is the truthful one.
      if (err?.code === 'REACTIVATION_PENDING') setStep('submitted');
      return undefined;
    } finally {
      setWorking(false);
    }
  };

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const errorNote = error && (
    <div
      className="flex items-start gap-2.5 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger"
      role="alert"
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <p>{error}</p>
    </div>
  );

  /* ---------------------------- Renders ---------------------------- */

  if (step === 'opening') {
    return (
      <>
        <Seo title={t('reactivate.title')} path="/reactivate" noIndex />
        <AuthShell title={t('reactivate.title')} subtitle={t('reactivate.checking')}>
          <div className="flex justify-center py-10">
            <Spinner size={26} />
          </div>
        </AuthShell>
      </>
    );
  }

  if (step === 'dead') {
    return (
      <>
        <Seo title={t('reactivate.title')} path="/reactivate" noIndex />
        <AuthShell title={t('reactivate.linkInvalidTitle')} subtitle={fatal}>
          <p className="mb-5 text-sm text-ink-500">{t('reactivate.linkInvalidHint')}</p>
          <Link to="/login" className="btn-primary w-full !py-3">
            {t('reactivate.backToLogin')}
          </Link>
        </AuthShell>
      </>
    );
  }

  if (step === 'submitted') {
    return (
      <>
        <Seo title={t('reactivate.title')} path="/reactivate" noIndex />
        <AuthShell
          title={t('reactivate.submittedTitle')}
          subtitle={t('reactivate.submittedSubtitle')}
        >
          <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-4 text-sm text-green-800">
            <Icon name="check" size={18} className="mt-0.5 shrink-0" />
            <p>{t('reactivate.submittedMessage')}</p>
          </div>

          <p className="mt-5 text-sm text-ink-500">{t('reactivate.submittedHint')}</p>

          <Link to="/" className="btn-primary mt-6 w-full !py-3">
            {t('common:actions.goHome')}
          </Link>
        </AuthShell>
      </>
    );
  }

  if (step === 'code') {
    return (
      <>
        <Seo title={t('reactivate.title')} path="/reactivate" noIndex />
        <AuthShell
          title={t('reactivate.codeTitle')}
          subtitle={t('reactivate.codeSubtitle', { email: account?.email })}
        >
          <div className="space-y-5">
            {errorNote}

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

            <button
              type="button"
              onClick={submit}
              disabled={working || code.length !== codeLength}
              className="btn-primary w-full !py-3"
            >
              {working && <Spinner size={16} />}
              {t('reactivate.submitAction')}
            </button>

            <div className="text-center text-sm text-ink-500">
              {t('auth.noCode')}{' '}
              <button
                type="button"
                onClick={() => requestCode(true)}
                disabled={working || cooldown > 0}
                className="font-semibold text-brand-600 hover:underline disabled:text-ink-400 disabled:no-underline"
              >
                {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
              </button>
            </div>
          </div>
        </AuthShell>
      </>
    );
  }

  /* step === 'details' */
  return (
    <>
      <Seo title={t('reactivate.title')} path="/reactivate" noIndex />
      <AuthShell
        title={t('reactivate.detailsTitle')}
        subtitle={t('reactivate.detailsSubtitle', { email: account?.email })}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestCode();
          }}
          className="space-y-4"
          noValidate
        >
          {errorNote}

          <div className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
            <p>{t('reactivate.detailsHint')}</p>
          </div>

          <div>
            <label htmlFor="name" className="label">
              {t('reactivate.nameLabel')}
            </label>
            <input
              id="name"
              value={values.name}
              onChange={set('name')}
              autoComplete="name"
              placeholder={t('auth.namePlaceholder')}
              className={`input ${errors.name ? 'input-error' : ''}`}
            />
            {errors.name && <p className="error-text">{errors.name}</p>}
          </div>

          {account?.requiresPhone && (
            <div>
              <label htmlFor="phone" className="label">
                {t('reactivate.phoneLabel')}
              </label>
              <PhoneInput
                id="phone"
                value={values.phone}
                onChange={set('phone')}
                error={errors.phone}
                placeholder={t('auth.phonePlaceholder')}
              />
              {errors.phone ? (
                <p className="error-text">{errors.phone}</p>
              ) : (
                account.phoneHint && (
                  <p className="mt-1 text-xs text-ink-400">
                    {t('reactivate.phoneHint', { hint: account.phoneHint })}
                  </p>
                )
              )}
            </div>
          )}

          <div>
            <label htmlFor="message" className="label">
              {t('reactivate.messageLabel')}{' '}
              <span className="font-normal text-ink-400">{t('auth.optional')}</span>
            </label>
            <textarea
              id="message"
              value={values.message}
              onChange={set('message')}
              rows={3}
              maxLength={500}
              placeholder={t('reactivate.messagePlaceholder')}
              className="input resize-none"
            />
          </div>

          <button type="submit" disabled={working} className="btn-primary w-full !py-3">
            {working && <Spinner size={16} />}
            {t('reactivate.detailsAction')}
          </button>
        </form>
      </AuthShell>
    </>
  );
}
