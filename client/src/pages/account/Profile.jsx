import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { updateProfile, uploadAvatar, removeAvatar } from '../../store/authSlice';
import { orderApi, addressApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { formatDate, formatPrice } from '../../utils/format';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import StatusBadge from '../../components/common/StatusBadge';
import UserAvatar from '../../components/common/UserAvatar';
import LanguageSelector from '../../components/language/LanguageSelector';

const AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // mirrors the server's multer limit

export default function Profile() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const wishlistCount = useSelector((s) => s.wishlist.ids.length);

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const fileRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file still fires a change event.
    e.target.value = '';
    if (!file) return;

    if (!AVATAR_TYPES.includes(file.type)) {
      return toast.error(t('photo.badType'));
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return toast.error(t('photo.tooLarge'));
    }

    setPhotoBusy(true);
    setProgress(0);
    try {
      await dispatch(uploadAvatar({ file, onProgress: setProgress })).unwrap();
      toast.success(t('photo.updated'));
    } catch (err) {
      toast.error(err?.message || t('photo.uploadFailed'));
    } finally {
      setPhotoBusy(false);
      setProgress(0);
    }
  };

  const deletePhoto = async () => {
    setPhotoBusy(true);
    try {
      await dispatch(removeAvatar()).unwrap();
      toast.success(t('photo.removed'));
    } catch (err) {
      toast.error(err?.message || t('photo.removeFailed'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const orders = useFetch(useCallback(() => orderApi.list({ limit: 3 }), []), []);
  const addresses = useFetch(useCallback(() => addressApi.list(), []), []);

  const recentOrders = orders.data?.data?.orders || [];
  const orderCount = orders.data?.meta?.total ?? 0;
  const addressCount = addresses.data?.data?.addresses?.length ?? 0;

  const save = async (e) => {
    e.preventDefault();

    const found = {};
    if (values.name.trim().length < 2) found.name = t('common:validation.nameRequired');
    if (values.phone && !/^[6-9]\d{9}$/.test(values.phone)) {
      found.phone = t('common:validation.phoneInvalid');
    }
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      await dispatch(updateProfile(values)).unwrap();
      toast.success(t('profile.updated'));
      setEditing(false);
    } catch (err) {
      toast.error(err?.message || t('profile.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const stats = [
    { key: 'orders', value: orderCount, icon: 'package', to: '/account/orders' },
    { key: 'addresses', value: addressCount, icon: 'location', to: '/account/addresses' },
    { key: 'wishlist', value: wishlistCount, icon: 'heart', to: '/wishlist' },
  ];

  const hasPhoto = Boolean(user?.avatar?.url);
  const fromGoogle = user?.avatar?.source === 'google';

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div className="relative">
            <UserAvatar user={user} size={88} />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-brand-600 text-white shadow transition hover:bg-brand-700 disabled:opacity-60"
              aria-label={t(hasPhoto ? 'photo.changeAria' : 'photo.addAria')}
            >
              {photoBusy ? <Spinner size={15} /> : <Icon name="camera" size={16} />}
            </button>

            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_TYPES.join(',')}
              onChange={pickPhoto}
              className="hidden"
            />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-base font-bold text-ink-900">{t('photo.title')}</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              {photoBusy && progress > 0
                ? t('photo.uploading', { percent: progress })
                : fromGoogle
                  ? t('photo.fromGoogle')
                  : t('photo.hint')}
            </p>

            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="btn-outline !py-2 text-sm"
              >
                {t(hasPhoto ? 'photo.change' : 'photo.upload')}
              </button>
              {hasPhoto && (
                <button
                  type="button"
                  onClick={deletePhoto}
                  disabled={photoBusy}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-danger transition hover:bg-red-50 disabled:opacity-60"
                >
                  {t('common:actions.remove')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.key} to={stat.to} className="card p-4 transition hover:shadow-card-hover">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Icon name={stat.icon} size={20} />
              </span>
              <div>
                <p className="text-xl font-extrabold text-ink-900">{stat.value}</p>
                <p className="text-xs text-ink-500">{t(`profile.stats.${stat.key}`)}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">{t('profile.personalInfo')}</h2>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-semibold text-brand-600 hover:underline"
            >
              {t('common:actions.edit')}
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="label">
                {t('profile.fullName')}
              </label>
              <input
                id="name"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className={`input ${errors.name ? 'input-error' : ''}`}
              />
              {errors.name && <p className="error-text">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="phone" className="label">
                {t('profile.mobile')}
              </label>
              <input
                id="phone"
                value={values.phone}
                onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                inputMode="numeric"
                maxLength={10}
                className={`input ${errors.phone ? 'input-error' : ''}`}
              />
              {errors.phone && <p className="error-text">{errors.phone}</p>}
            </div>

            <div className="sm:col-span-2">
              <span className="label">{t('profile.email')}</span>
              {/* Email is the account identity — changing it needs re-verification. */}
              <input value={user?.email || ''} disabled className="input" />
              <p className="mt-1 text-xs text-ink-400">{t('profile.emailHint')}</p>
            </div>

            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Spinner size={14} />}
                {t('common:actions.saveChanges')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setValues({ name: user.name, phone: user.phone || '' });
                  setErrors({});
                }}
                className="btn-outline"
              >
                {t('common:actions.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ['fullName', user?.name],
              ['email', user?.email],
              ['mobile', user?.phone || t('profile.notAdded')],
              ['memberSince', user?.createdAt ? formatDate(user.createdAt) : '—'],
            ].map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  {t(`profile.${key}`)}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-ink-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-ink-900">
          <Icon name="globe" size={18} className="text-brand-600" />
          {t('common:language.sectionTitle')}
        </h2>
        <p className="mb-4 text-sm text-ink-500">{t('common:language.sectionHint')}</p>
        <LanguageSelector className="max-w-md" />
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900">{t('profile.recentOrders')}</h2>
          <Link to="/account/orders" className="text-sm font-semibold text-brand-600 hover:underline">
            {t('common:actions.viewAll')}
          </Link>
        </div>

        {orders.loading ? (
          <p className="py-6 text-center text-sm text-ink-400">{t('orders.loading')}</p>
        ) : !recentOrders.length ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-ink-500">{t('orders.noneYet')}</p>
            <Link to="/products" className="btn-primary">
              {t('orders.startShopping')}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {recentOrders.map((order) => (
              <Link
                key={order._id}
                to={`/account/orders/${order._id}`}
                className="flex items-center justify-between gap-4 py-3 transition hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{order.orderNumber}</p>
                  <p className="text-xs text-ink-500">
                    {formatDate(order.createdAt)} ·{' '}
                    {t('orders.itemCount', { count: order.items.length })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={order.orderStatus} />
                  <span className="text-sm font-bold text-ink-900">
                    {formatPrice(order.pricing.total)}
                  </span>
                  <Icon name="chevronRight" size={16} className="text-ink-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
