import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import DeactivateAccountDialog from '../../components/account/DeactivateAccountDialog';
import PendingOrdersDialog from '../../components/account/PendingOrdersDialog';

export default function Settings() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);

  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  /**
   * Closing an account is three dialogs, not one: are you sure, why, and prove
   * it is you. `confirmOpen` is the first — the only one that can be dismissed
   * without anything having happened — and `flowOpen` is the other two, which
   * manage their own step between them.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  /**
   * The orders standing in the way, when there are any. Set by the eligibility
   * check the Danger Zone button runs before it opens anything — so the rule is
   * met on the click that starts the flow rather than three screens into it.
   */
  const [blockingOrders, setBlockingOrders] = useState(null);
  const [checking, setChecking] = useState(false);

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

  /**
   * Runs once the account is actually closed — the dialog has already had the
   * code accepted, so there is nothing left here that can fail in a way the
   * shopper needs to hear about.
   *
   * `logout` is dispatched rather than `sessionExpired`: the server has revoked
   * every session including this one, so the request it makes is expected to be
   * refused, and the thunk clears the token either way. What matters is that the
   * store, the cart and the wishlist are all emptied before the redirect, so the
   * home page this lands on is a signed-out one.
   */
  /**
   * The Danger Zone button.
   *
   * A failed check does not open the flow and does not block it either: if the
   * eligibility call itself errors we let the shopper through, because both steps
   * of the flow re-run the same check server-side and refusing here on a network
   * blip would be a dead end with nothing to retry.
   */
  const startDeactivation = async () => {
    setChecking(true);
    try {
      const res = await userApi.deactivate.eligibility();
      if (res.data?.eligible) setConfirmOpen(true);
      else setBlockingOrders(res.data?.openOrders || []);
    } catch {
      setConfirmOpen(true);
    } finally {
      setChecking(false);
    }
  };

  const finishDeactivation = async () => {
    setFlowOpen(false);
    await dispatch(logout());
    dispatch(resetCart());
    dispatch(resetWishlist());
    toast.success(t('settings.deactivated'));
    navigate('/');
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
        <p className="mb-2 text-sm text-ink-500">{t('settings.dangerHint')}</p>

        {/*
         * The two clauses that actually govern this button, linked to the section
         * rather than the page. Someone about to close an account is the one reader
         * who genuinely wants the policy, and making them hunt for it in a
         * twenty-clause document is how a considered decision becomes a support
         * ticket a week later.
         */}
        <p className="mb-4 text-xs text-ink-500">
          <Link to="/terms#deactivation" className="font-medium text-brand-600 hover:underline">
            {t('settings.dangerTerms')}
          </Link>
          {' · '}
          <Link to="/privacy#account-closure" className="font-medium text-brand-600 hover:underline">
            {t('settings.dangerPrivacy')}
          </Link>
        </p>
        <button
          type="button"
          onClick={startDeactivation}
          disabled={checking}
          className="btn-danger"
        >
          {checking && <Spinner size={14} />}
          {t('settings.deactivateAction')}
        </button>
      </section>

      {/* Confirming here opens the reason dialog; nothing is written until the
          code at the end of it is accepted. */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => setFlowOpen(true)}
        title={t('settings.deactivateTitle')}
        message={t('settings.deactivateMessage')}
        confirmLabel={t('settings.deactivateStart')}
      />

      <DeactivateAccountDialog
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        onDeactivated={finishDeactivation}
        // The flow re-checks server-side at both steps; if an order lands while a
        // dialog is open, this is where that refusal surfaces.
        onBlocked={(orders) => {
          setFlowOpen(false);
          setBlockingOrders(orders || []);
        }}
      />

      <PendingOrdersDialog
        open={Boolean(blockingOrders)}
        onClose={() => setBlockingOrders(null)}
        orders={blockingOrders || []}
      />
    </div>
  );
}
