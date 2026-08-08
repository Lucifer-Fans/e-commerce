import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/endpoints';
import Seo from '../../components/common/Seo';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import AuthShell from '../../components/auth/AuthShell';

export default function ForgotPassword() {
  const { t } = useTranslation(['account', 'common']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return setError(t('common:validation.emailInvalid'));
    }

    setLoading(true);
    setError('');
    try {
      const res = await authApi.forgotPassword({ email });
      // In development the API returns the link directly when SMTP isn't configured.
      setDevLink(res.data?.devResetUrl || null);
      setSent(true);
    } catch (err) {
      setError(err.message || t('auth.resetSendFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title={t('auth.checkInbox')} subtitle={t('auth.checkInboxSubtitle', { email })}>
        <div className="rounded-lg bg-emerald-50 p-5 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-success text-white">
            <Icon name="check" size={26} />
          </span>
          <p className="text-sm text-emerald-800">{t('auth.linkValidity')}</p>
        </div>

        {devLink && (
          <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs">
            <p className="mb-1 font-semibold text-amber-800">{t('auth.devMode')}</p>
            <a href={devLink} className="break-all text-brand-600 underline">
              {devLink}
            </a>
          </div>
        )}

        <div className="mt-5 space-y-3 text-center">
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setDevLink(null);
            }}
            className="btn-outline w-full"
          >
            {t('auth.differentEmail')}
          </button>
          <Link to="/login" className="block text-sm font-medium text-brand-600 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <>
      <Seo title={t('auth.forgotTitle')} path="/forgot-password" noIndex />

      <AuthShell
        title={t('auth.forgotHeading')}
        subtitle={t('auth.forgotSubtitle')}
        footer={
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label">
              {t('auth.emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              autoComplete="email"
              placeholder="you@example.com"
              className={`input ${error ? 'input-error' : ''}`}
              aria-invalid={Boolean(error)}
            />
            {error && <p className="error-text">{error}</p>}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
            {loading && <Spinner size={16} />}
            {t('auth.sendResetLink')}
          </button>
        </form>
      </AuthShell>
    </>
  );
}
