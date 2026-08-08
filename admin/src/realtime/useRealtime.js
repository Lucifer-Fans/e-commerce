import { useEffect, useRef, useContext, createContext } from 'react';
import { getSocket, joinRoom, leaveRoom } from './socket';

export const RealtimeContext = createContext({ connected: false, ready: false, admins: 0 });

/** `{ connected, admins }` — used by the topbar's live indicator. */
export const useRealtimeStatus = () => useContext(RealtimeContext);

/**
 * Runs `handler` whenever one of `events` arrives.
 *
 * The handler is held in a ref, so an inline arrow doesn't re-subscribe on every
 * render — only a change to the event list rebinds.
 */
export function useRealtimeEvent(events, handler, { enabled = true } = {}) {
  const saved = useRef(handler);
  saved.current = handler;

  const list = Array.isArray(events) ? events : [events];
  const key = list.join('|');

  useEffect(() => {
    if (!enabled || !key) return undefined;

    const socket = getSocket();
    const names = key.split('|');
    const listener = (...args) => saved.current?.(...args);

    names.forEach((name) => socket.on(name, listener));
    return () => names.forEach((name) => socket.off(name, listener));
  }, [key, enabled]);
}

/** Subscribes to a server room (e.g. `order:<id>`) for as long as the component lives. */
export function useRealtimeRoom(room, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled || !room) return undefined;
    joinRoom(room);
    return () => leaveRoom(room);
  }, [room, enabled]);
}

/**
 * Re-runs a `useFetch` refetch when any of `events` fires.
 *
 * Bursts collapse into one refetch — a multi-line order emits a stock change per
 * item, and a table has no reason to reload once per line. `filter` narrows the
 * trigger further, e.g. a detail page that only cares about its own record.
 */
export function useLiveRefetch(refetch, events, { enabled = true, delay = 300, filter } = {}) {
  const timer = useRef(null);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const filterRef = useRef(filter);
  filterRef.current = filter;

  useRealtimeEvent(
    events,
    (payload) => {
      if (filterRef.current && !filterRef.current(payload)) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => refetchRef.current?.(), delay);
    },
    { enabled }
  );

  useEffect(() => () => clearTimeout(timer.current), []);
}
