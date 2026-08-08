import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { sessionApi } from '../../api/endpoints';
import { setAccessToken } from '../../api/client';
import { sessionExpired } from '../../store/authSlice';
import { resetCart } from '../../store/cartSlice';
import { resetWishlist } from '../../store/wishlistSlice';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { EVENTS } from '../../realtime/events';
import { formatDateTime, timeAgo } from '../../utils/format';
import Icon from '../../components/common/Icon';
import Spinner from '../../components/common/Spinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorState from '../../components/common/ErrorState';
import { Skeleton } from '../../components/common/Skeleton';

/** One glyph per device type the API reports, with a sane fallback. */
const DEVICE_ICON = {
  mobile: 'smartphone',
  tablet: 'tablet',
  desktop: 'monitor',
  bot: 'browser',
  unknown: 'browser',
};

/** A session used within the last five minutes is, for the reader, active now. */
const ACTIVE_NOW_MS = 5 * 60 * 1000;

function DeviceCardSkeleton() {
  return (
    <div className="card flex gap-4 p-4">
      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/**
 * One signed-in device.
 *
 * Everything the owner needs to answer "was that me?" is on the face of the card —
 * device, browser, place, and when it was last used — with the sign-out action
 * beside it. That is the shape Google, GitHub and Microsoft all settled on, and it
 * is the reason none of this hides behind a "details" toggle.
 */
function DeviceCard({ session, onSignOut, busy }) {
  const { t } = useTranslation(['account', 'common']);

  const lastActive = new Date(session.lastActiveAt);
  const activeNow = Date.now() - lastActive.getTime() < ACTIVE_NOW_MS;

  const place = session.location
    ? [session.location.city, session.location.region, session.location.country]
        .filter(Boolean)
        .join(', ')
    : t('devices.unknownLocation');

  const browserLine = [
    session.browser?.name
      ? `${session.browser.name}${session.browser.version ? ` ${session.browser.version}` : ''}`
      : t('devices.unknownBrowser'),
    session.os?.name
      ? `${session.os.name}${session.os.version ? ` ${session.os.version}` : ''}`
      : t('devices.unknownOs'),
  ].join(' · ');

  const rows = [
    { icon: 'browser', label: t('devices.browserOs'), value: browserLine },
    { icon: 'location', label: t('devices.location'), value: place },
    { icon: 'logout', label: t('devices.signedInOn'), value: formatDateTime(session.loginAt) },
    {
      icon: 'clock',
      label: t('devices.lastActive'),
      value: activeNow ? t('devices.activeNow') : timeAgo(session.lastActiveAt),
      title: formatDateTime(session.lastActiveAt),
      highlight: activeNow,
    },
  ];

  return (
    <article
      className={`card p-4 transition sm:p-5 ${
        session.isCurrent ? 'border-brand-200 ring-1 ring-brand-100' : 'hover:shadow-card-hover'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
            session.isCurrent ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-500'
          }`}
        >
          <Icon name={DEVICE_ICON[session.device?.type] || 'browser'} size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink-900">{session.device?.name}</h3>
            {session.isCurrent && (
              <span className="badge bg-emerald-50 text-success ring-emerald-200">
                {t('devices.currentDevice')}
              </span>
            )}
            {session.client === 'admin' && (
              <span className="badge bg-ink-100 text-ink-600 ring-ink-200">
                {t('devices.adminConsole')}
              </span>
            )}
            {session.signInMethod === 'google' && (
              <span className="badge bg-ink-100 text-ink-600 ring-ink-200">
                {t('devices.viaGoogle')}
              </span>
            )}
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-start gap-2">
                <Icon name={row.icon} size={14} className="mt-0.5 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                    {row.label}
                  </dt>
                  <dd
                    title={row.title}
                    className={`truncate text-sm ${
                      row.highlight ? 'font-semibold text-success' : 'text-ink-700'
                    }`}
                  >
                    {row.value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <button
          type="button"
          onClick={() => onSignOut(session)}
          disabled={busy}
          className="shrink-0 self-start rounded-lg px-3 py-2 text-sm font-semibold text-danger transition hover:bg-red-50 disabled:opacity-60 sm:ml-2"
        >
          {t(session.isCurrent ? 'devices.signOutThis' : 'devices.signOut')}
        </button>
      </div>
    </article>
  );
}

export default function Devices() {
  const { t } = useTranslation(['account', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentSessionId = useSelector((s) => s.auth.sessionId);

  const { data, loading, error, refetch } = useFetch(useCallback(() => sessionApi.list(), []), []);
  const sessions = data?.data?.sessions || [];

  // A sign-in or sign-out on any other device changes this list under our feet.
  useLiveRefetch(refetch, EVENTS.SESSIONS_CHANGED);

  const [signingOut, setSigningOut] = useState(null);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // `isCurrent` comes from the server, which matches on the token this request
  // carried. The store's copy is the fallback for a cached response.
  const current = sessions.find((s) => s.isCurrent || s.id === currentSessionId);
  const others = sessions.filter((s) => s !== current);

  /** Signing this device out is a logout, so it has to leave the app like one. */
  const endLocalSession = () => {
    setAccessToken(null);
    dispatch(sessionExpired());
    dispatch(resetCart());
    dispatch(resetWishlist());
    navigate('/login', { replace: true });
  };

  const signOut = async () => {
    const target = signingOut;
    setBusy(true);
    try {
      const res = await sessionApi.revoke(target.id);
      if (res.data?.wasCurrent) {
        toast.success(t('devices.signedOutThis'));
        endLocalSession();
      } else {
        toast.success(t('devices.signedOut', { device: target.device?.name }));
        refetch();
      }
    } catch (err) {
      toast.error(err.message || t('devices.signOutFailed'));
    } finally {
      setBusy(false);
      setSigningOut(null);
    }
  };

  const signOutAll = async () => {
    setBusy(true);
    try {
      await sessionApi.revokeAll();
      toast.success(t('devices.signedOutAll'));
      endLocalSession();
    } catch (err) {
      toast.error(err.message || t('devices.signOutFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">{t('devices.title')}</h1>
        <p className="mt-1 text-sm text-ink-500">{t('devices.subtitle')}</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <DeviceCardSkeleton />
          <DeviceCardSkeleton />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : (
        <>
          {current && (
            <section>
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                {t('devices.thisDevice')}
              </h2>
              <DeviceCard session={current} onSignOut={setSigningOut} busy={busy} />
            </section>
          )}

          <section>
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              {t('devices.otherDevices', { count: others.length })}
            </h2>

            {others.length ? (
              <div className="space-y-4">
                {others.map((session) => (
                  <DeviceCard
                    key={session.id}
                    session={session}
                    onSignOut={setSigningOut}
                    busy={busy}
                  />
                ))}
              </div>
            ) : (
              // Not an empty state with a call to action — "nowhere else" is the
              // reassuring answer here, not a gap to be filled.
              <div className="card flex items-center gap-3 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-success">
                  <Icon name="shield" size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{t('devices.onlyThisTitle')}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{t('devices.onlyThisMessage')}</p>
                </div>
              </div>
            )}
          </section>

          <section className="card border-red-200 p-5">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-danger">
              <Icon name="alert" size={18} />
              {t('devices.signOutAllTitle')}
            </h2>
            <p className="mb-4 text-sm text-ink-500">{t('devices.signOutAllHint')}</p>
            <button
              type="button"
              onClick={() => setSignOutAllOpen(true)}
              disabled={busy || !sessions.length}
              className="btn-danger"
            >
              {busy && <Spinner size={14} />}
              {t('devices.signOutAllAction')}
            </button>
          </section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(signingOut)}
        onClose={() => setSigningOut(null)}
        onConfirm={signOut}
        title={t('devices.confirmSignOutTitle')}
        message={
          signingOut?.isCurrent
            ? t('devices.confirmSignOutCurrent')
            : t('devices.confirmSignOutMessage', { device: signingOut?.device?.name })
        }
        confirmLabel={t('devices.signOut')}
      />

      <ConfirmDialog
        open={signOutAllOpen}
        onClose={() => setSignOutAllOpen(false)}
        onConfirm={signOutAll}
        title={t('devices.confirmSignOutAllTitle')}
        message={t('devices.confirmSignOutAllMessage')}
        confirmLabel={t('devices.signOutAllAction')}
      />
    </div>
  );
}
