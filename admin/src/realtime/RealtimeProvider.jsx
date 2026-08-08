import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSnackbar } from 'notistack';

import { getAccessToken } from '../api/client';
import { sessionExpired } from '../store/authSlice';

import { EVENTS } from './events';
import { connectSocket, disconnectSocket, getSocket } from './socket';
import { RealtimeContext, useRealtimeEvent } from './useRealtime';

/**
 * Opens the socket for the admin panel and handles what belongs to the whole app
 * rather than to one screen: the incoming-order alert, connection state and the
 * count of other admins online.
 *
 * Individual screens subscribe for themselves with `useLiveRefetch`, so no page data
 * is held here.
 */
export default function RealtimeProvider({ children }) {
  const dispatch = useDispatch();
  const { enqueueSnackbar } = useSnackbar();
  const { isAuthenticated, initialising, user } = useSelector((s) => s.auth);

  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [admins, setAdmins] = useState(0);

  useEffect(() => {
    if (initialising) return undefined;
    if (isAuthenticated) connectSocket(getAccessToken());
    else disconnectSocket();
    return undefined;
  }, [isAuthenticated, initialising, user?._id]);

  useEffect(() => () => disconnectSocket(), []);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setReady(false);
    };
    const onReady = () => setReady(true);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVENTS.READY, onReady);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVENTS.READY, onReady);
    };
  }, []);

  // The order alert is the one thing worth interrupting an admin mid-task for.
  useRealtimeEvent(
    EVENTS.ADMIN_NOTIFICATION,
    (payload) => {
      if (!payload?.title) return;
      enqueueSnackbar(`${payload.title} — ${payload.message || ''}`.trim(), {
        variant: payload.severity || 'info',
      });
    },
    { enabled: isAuthenticated }
  );

  useRealtimeEvent(EVENTS.PRESENCE_UPDATED, (payload) => setAdmins(payload?.admins || 0), {
    enabled: isAuthenticated,
  });

  // Another admin revoking this account shouldn't leave the panel usable.
  useRealtimeEvent(
    EVENTS.ACCOUNT_STATUS_CHANGED,
    (payload) => {
      if (payload?.status === 'blocked' || payload?.role !== 'admin') {
        dispatch(sessionExpired());
        enqueueSnackbar('Your admin access has been revoked.', { variant: 'error' });
      }
    },
    { enabled: isAuthenticated }
  );

  const value = useMemo(() => ({ connected, ready, admins }), [connected, ready, admins]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
