import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  login,
  googleLogin,
  clearAuthError,
  setPendingVerification,
} from '../../store/authSlice';
import { fetchCart } from '../../store/cartSlice';
import { fetchWishlistIds } from '../../store/wishlistSlice';
import Seo from '../../components/common/Seo';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import AuthShell from '../../components/auth/AuthShell';
import PasswordInput from '../../components/auth/PasswordInput';
import GoogleButton from '../../components/auth/GoogleButton';

export default function Login() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, errorCode, isAuthenticated } = useSelector((s) => s.auth);

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});

  // Return the shopper to whatever they were doing before the auth gate.
  const redirectTo = location.state?.from || '/';

  // A wrong password is red and final-sounding; the countdown before a lockout is
  // amber, because it is still a warning and there is something the shopper can do.
  const isLocked = errorCode === 'ACCOUNT_LOCKED';
  const isWarning = errorCode === 'INVALID_CREDENTIALS_WARNING';
  // Nothing was mistyped when the address simply is not registered, so this one
  // reads as a signpost — amber, and carrying the link that actually fixes it.
  const isNoAccount = errorCode === 'NO_ACCOUNT';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  useEffect(() => () => dispatch(clearAuthError()), [dispatch]);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onGoogleCredential = useCallback(
    async (credential) => {
      try {
        await dispatch(googleLogin(credential)).unwrap();
        dispatch(fetchCart());
        dispatch(fetchWishlistIds());
        toast.success(t('auth.welcomeBackToast'));
      } catch {
        /* the slice already stored the message */
      }
    },
    [dispatch, t]
  );

  const submit = async (e) => {
    e.preventDefault();

    const found = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
      found.email = t('common:validation.emailInvalid');
    }
    if (!values.password) found.password = t('common:validation.passwordRequired');
    if (Object.keys(found).length) return setErrors(found);

    try {
      await dispatch(login(values)).unwrap();
      // Personalised data is only meaningful once a session exists.
      dispatch(fetchCart());
      dispatch(fetchWishlistIds());
      toast.success('Welcome back!');
    } catch (err) {
      // The password was right; the address has simply never answered its code.
      // The API has already sent a fresh one, so go straight to where it is typed.
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        dispatch(setPendingVerification(values.email));
        navigate('/verify-email', { state: { email: values.email, from: redirectTo } });
      }
      /* otherwise the slice already stored the message */
    }
  };

  return (
    <>
      <Seo title={t('auth.loginTitle')} description={t('auth.loginSeo')} path="/login" />

      <AuthShell
        title={t('auth.welcomeBack')}
        subtitle={t('auth.loginSubtitle')}
        footer={
          <>
            {t('auth.newHere')}{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              {t('auth.createAccount')}
            </Link>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <div
              className={`flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm ${
                isWarning || isNoAccount ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-danger'
              }`}
              role="alert"
            >
              {(isLocked || isWarning || isNoAccount) && (
                <Icon name={isLocked ? 'lock' : 'alert'} size={16} className="mt-0.5 shrink-0" />
              )}
              <p>
                {error}
                {isNoAccount && (
                  <>
                    {' '}
                    <Link
                      to="/register"
                      state={{ from: redirectTo, email: values.email }}
                      className="font-semibold underline"
                    >
                      {t('auth.createAccount')}
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}

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
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          <PasswordInput
            id="password"
            label={t('auth.passwordLabel')}
            value={values.password}
            onChange={set('password')}
            error={errors.password}
          />

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
            {loading && <Spinner size={16} />}
            {t('common:nav.login')}
          </button>
        </form>

        <GoogleButton onCredential={onGoogleCredential} disabled={loading} />
      </AuthShell>
    </>
  );
}
