import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authApi } from '../../api/endpoints';
import { setAccessToken } from '../../api/client';
import { loadSession } from '../../store/authSlice';
import Seo from '../../components/common/Seo';
import Spinner from '../../components/common/Spinner';
import AuthShell from '../../components/auth/AuthShell';
import PasswordInput from '../../components/auth/PasswordInput';

export default function ResetPassword() {
  const { t } = useTranslation(['account', 'common']);
  const { token } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();

    const found = {};
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
    if (Object.keys(found).length) return setErrors(found);

    setLoading(true);
    try {
      const res = await authApi.resetPassword(token, { password: values.password });
      // The API returns a fresh session, so the user lands logged in.
      setAccessToken(res.data.accessToken);
      await dispatch(loadSession());
      toast.success(t('auth.resetSuccess'));
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message || t('auth.resetInvalid'));
      setErrors({ password: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo title={t('auth.resetTitle')} noIndex />

      <AuthShell
        title={t('auth.resetHeading')}
        subtitle={t('auth.resetSubtitle')}
        footer={
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <PasswordInput
            id="password"
            label={t('settings.newPassword')}
            value={values.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="new-password"
            showRules
          />

          <PasswordInput
            id="confirmPassword"
            label={t('settings.confirmNewPassword')}
            value={values.confirmPassword}
            onChange={set('confirmPassword')}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />

          <button type="submit" disabled={loading} className="btn-primary w-full !py-3">
            {loading && <Spinner size={16} />}
            {t('auth.resetAction')}
          </button>
        </form>
      </AuthShell>
    </>
  );
}
