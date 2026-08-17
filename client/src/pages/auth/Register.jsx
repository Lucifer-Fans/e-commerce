import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Trans, useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { register, clearAuthError, setRegistrationDraft } from '../../store/authSlice';
import Seo from '../../components/common/Seo';
import Spinner from '../../components/common/Spinner';
import PhoneInput from '../../components/common/PhoneInput';
import AuthShell from '../../components/auth/AuthShell';
import PasswordInput from '../../components/auth/PasswordInput';
import ReactivationNotice from '../../components/auth/ReactivationNotice';
import SuspendedNotice from '../../components/auth/SuspendedNotice';

const EMPTY = { name: '', email: '', phone: '', password: '', confirmPassword: '' };

export default function Register() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, errorCode, errorDetails, isAuthenticated, registrationDraft } =
    useSelector((s) => s.auth);

  /**
   * The address belongs to an account its owner closed, so no new account is
   * being made on it. That is a signpost rather than a validation failure — the
   * person almost certainly *is* the account holder, having forgotten they had
   * one — so it gets the notice and its button instead of the red error strip.
   */
  const isDeactivated = errorCode === 'ACCOUNT_DEACTIVATED';
  const isReactivationPending = errorCode === 'REACTIVATION_PENDING';

  /**
   * The address is taken by an account staff suspended. Answering that with the
   * bare "already exists" strip would send the person back to the sign-in form to
   * be told something different, so the server's own sentence — reason and all —
   * is shown here with the same way out the sign-in form offers.
   */
  const isSuspended = errorCode === 'ACCOUNT_SUSPENDED';

  /**
   * Two ways of arriving with something already known:
   *
   * - "Start over" from the code screen, which is a sign-up in progress coming back
   *   to change one detail. Everything they typed is still in the store, so the form
   *   is handed back whole and they edit the one field that was wrong.
   * - A login that found no such account, which carries only the address it was
   *   refused for — already typed and known-unregistered, so not asked for twice.
   */
  const [values, setValues] = useState(() => ({
    ...EMPTY,
    ...registrationDraft?.values,
    // An address handed over in router state is the more recent statement of intent
    // — it was typed after the draft was saved — so it wins where both exist.
    ...(location.state?.email ? { email: location.state.email } : {}),
  }));
  const [errors, setErrors] = useState({});
  // Consent already given on the way to the code screen stands; coming back to fix
  // a typo in the phone number is not a reason to ask for it again.
  const [agreed, setAgreed] = useState(Boolean(registrationDraft?.agreed));

  // Where to go once verified. Read once, because the address is about to be
  // stripped out of the router state below and this has to outlive that.
  const from = useRef(location.state?.from);

  /**
   * The seeding above has happened by now, so the address has done its job. It is
   * dropped from the history entry immediately, because router state — unlike the
   * draft in the store — survives a reload: leave it and a refresh reopens a blank
   * form with one field mysteriously filled in. A reload is a fresh start, and the
   * form it lands on should look like one.
   */
  useEffect(() => {
    if (!location.state?.email) return;
    navigate(location.pathname + location.search, {
      replace: true,
      state: from.current ? { from: from.current } : null,
    });
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => () => dispatch(clearAuthError()), [dispatch]);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const found = {};
    if (values.name.trim().length < 2) found.name = t('common:validation.nameRequired');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
      found.email = t('common:validation.emailInvalid');
    }
    if (values.phone && !/^[6-9]\d{9}$/.test(values.phone)) {
      found.phone = t('common:validation.phoneInvalid');
    }
    if (
      values.password.length < 8 ||
      !/[a-z]/.test(values.password) ||
      !/[A-Z]/.test(values.password) ||
      !/\d/.test(values.password)
    ) {
      found.password = t('common:validation.passwordRules');
    }
    if (values.password !== values.confirmPassword) {
      found.confirmPassword = t('common:validation.passwordMismatch');
    }
    return found;
  };

  const submit = async (e) => {
    e.preventDefault();

    const found = validate();
    if (Object.keys(found).length) return setErrors(found);
    if (!agreed) return toast.error(t('auth.acceptTerms'));

    try {
      const { confirmPassword, ...payload } = values;
      // Registering no longer signs anyone in — it mails a code. Everything the
      // verify screen needs comes back in that response, so it is handed straight
      // over in the router state rather than re-derived there.
      const pending = await dispatch(register(payload)).unwrap();
      // Kept for "Start over": the code screen sends people back here, and back
      // here should mean the form they just filled in, not a blank one. Dropped
      // by the slice as soon as the code is accepted.
      dispatch(setRegistrationDraft({ values, agreed }));
      toast.success(t('auth.codeSent'));
      navigate('/verify-email', {
        state: { ...pending, from: from.current },
        replace: true,
      });
    } catch (err) {
      if (err?.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e2) => [e2.field, e2.message])));
      }
    }
  };

  return (
    <>
      <Seo title={t('auth.registerTitle')} description={t('auth.registerSeo')} path="/register" />

      <AuthShell
        title={t('auth.createYourAccount')}
        subtitle={t('auth.registerSubtitle')}
        footer={
          <>
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              {t('common:nav.login')}
            </Link>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {isSuspended && <SuspendedNotice message={error} />}

          {(isDeactivated || isReactivationPending) && (
            <ReactivationNotice
              email={errorDetails?.email || values.email}
              message={
                isReactivationPending
                  ? error
                  : t('reactivate.registerBlocked')
              }
              pending={isReactivationPending}
            />
          )}

          {error && !isDeactivated && !isReactivationPending && !isSuspended && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="label">
              {t('auth.nameLabel')}
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

          <div>
            <label htmlFor="email" className="label">
              {t('auth.emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              value={values.email}
              onChange={set('email')}
              autoComplete="email"
              placeholder="you@example.com"
              className={`input ${errors.email ? 'input-error' : ''}`}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="phone" className="label">
              {t('auth.phoneLabel')}{' '}
              <span className="font-normal text-ink-400">{t('auth.optional')}</span>
            </label>
            <PhoneInput
              id="phone"
              value={values.phone}
              onChange={set('phone')}
              error={errors.phone}
              placeholder={t('auth.phonePlaceholder')}
            />
            {errors.phone && <p className="error-text">{errors.phone}</p>}
          </div>

          <PasswordInput
            id="password"
            label={t('auth.passwordLabel')}
            value={values.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="new-password"
            showRules
          />

          <PasswordInput
            id="confirmPassword"
            label={t('auth.confirmPasswordLabel')}
            value={values.confirmPassword}
            onChange={set('confirmPassword')}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <Trans
                i18nKey="account:auth.agreeTerms"
                components={[
                  <span key="0" />,
                  <Link key="1" to="/terms" className="font-medium text-brand-600 hover:underline" />,
                  <Link key="2" to="/privacy" className="font-medium text-brand-600 hover:underline" />,
                ]}
              />
            </span>
          </label>

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
            {loading && <Spinner size={16} />}
            {t('auth.createAccount')}
          </button>
        </form>
      </AuthShell>
    </>
  );
}
