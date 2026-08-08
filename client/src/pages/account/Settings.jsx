import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authApi, userApi } from '../../api/endpoints';
import { setAccessToken } from '../../api/client';
import { logout, setUser } from '../../store/authSlice';
import { resetCart } from '../../store/cartSlice';
import { resetWishlist } from '../../store/wishlistSlice';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PasswordInput from '../../components/auth/PasswordInput';

export default function Settings() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);

  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  // Accounts created through Google have no password to prove, so they create one
  // instead of changing one. Google sign-in keeps working either way.
  const hasPassword = user?.hasPassword ?? true;

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const changePassword = async (e) => {
    e.preventDefault();

    const found = {};
    if (hasPassword && !values.currentPassword) {
      found.currentPassword = t('settings.enterCurrentPassword');
    }
    if (
      values.newPassword.length < 8 ||
      !/[a-z]/.test(values.newPassword) ||
      !/[A-Z]/.test(values.newPassword) ||
      !/\d/.test(values.newPassword)
    ) {
      found.newPassword = t('common:validation.passwordRules');
    }
    if (values.newPassword !== values.confirmPassword) {
      found.confirmPassword = t('common:validation.passwordMismatch');
    }
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const res = hasPassword
        ? await authApi.changePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
          })
        : await authApi.setPassword({ password: values.newPassword });

      // Both routes revoke old sessions, so adopt the fresh token.
      setAccessToken(res.data.accessToken);
      // The user now has both providers — refresh the cached copy so this form
      // switches to change-password mode without a reload.
      dispatch(setUser(res.data.user));
      toast.success(t(hasPassword ? 'settings.passwordChanged' : 'settings.passwordCreated'));
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.message || t('settings.passwordFailed'));
      setErrors({ [hasPassword ? 'currentPassword' : 'newPassword']: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    try {
      await userApi.deactivate();
      await dispatch(logout());
      dispatch(resetCart());
      dispatch(resetWishlist());
      toast.success(t('settings.deactivated'));
      navigate('/');
    } catch (err) {
      toast.error(err.message || t('settings.deactivateFailed'));
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-ink-900">{t('settings.title')}</h1>

      <section className="card p-5">
        <h2 className="mb-1 text-base font-bold text-ink-900">
          {t(hasPassword ? 'settings.changePassword' : 'settings.createPassword')}
        </h2>
        <p className="mb-4 text-sm text-ink-500">
          {t(hasPassword ? 'settings.changePasswordHint' : 'settings.createPasswordHint')}
        </p>

        <form onSubmit={changePassword} className="max-w-md space-y-4" noValidate>
          {hasPassword && (
            <PasswordInput
              id="currentPassword"
              label={t('settings.currentPassword')}
              value={values.currentPassword}
              onChange={set('currentPassword')}
              error={errors.currentPassword}
            />
          )}
          <PasswordInput
            id="newPassword"
            label={t(hasPassword ? 'settings.newPassword' : 'settings.password')}
            value={values.newPassword}
            onChange={set('newPassword')}
            error={errors.newPassword}
            autoComplete="new-password"
            showRules
          />
          <PasswordInput
            id="confirmPassword"
            label={t(hasPassword ? 'settings.confirmNewPassword' : 'settings.confirmPassword')}
            value={values.confirmPassword}
            onChange={set('confirmPassword')}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />

          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Spinner size={14} />}
            {t(hasPassword ? 'settings.updatePassword' : 'settings.createPasswordAction')}
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-base font-bold text-ink-900">{t('settings.accountInfo')}</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ['emailAddress', user?.email],
            ['accountStatus', t(user?.status === 'active' ? 'settings.active' : 'settings.suspended')],
            ['emailVerified', t(user?.isEmailVerified ? 'settings.yes' : 'settings.notVerified')],
            ['phoneVerified', t(user?.isPhoneVerified ? 'settings.yes' : 'settings.notVerified')],
            [
              'signInMethods',
              (user?.authProviders || [])
                .map((p) => t(p === 'google' ? 'settings.google' : 'settings.emailPassword'))
                .join(' · ') || '—',
            ],
          ].map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                {t(`settings.${key}`)}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card border-red-200 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-danger">
          <Icon name="alert" size={18} />
          {t('settings.dangerZone')}
        </h2>
        <p className="mb-4 text-sm text-ink-500">{t('settings.dangerHint')}</p>
        <button type="button" onClick={() => setDeactivateOpen(true)} className="btn-danger">
          {t('settings.deactivateAction')}
        </button>
      </section>

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={deactivate}
        title={t('settings.deactivateTitle')}
        message={t('settings.deactivateMessage')}
        confirmLabel={t('settings.deactivateConfirm')}
      />
    </div>
  );
}
