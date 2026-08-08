import { io } from 'socket.io-client';
import { EVENTS } from './events';

/**
 * One socket for the whole tab.
 *
 * Deliberately framework-free so it can be imported by the axios client (which must
 * not depend on React) as well as by the provider. The token is pushed in from the
 * auth layer rather than read from it, which keeps the import graph one-directional.
 */

/** VITE_API_URL points at the REST prefix (…/api/v1); the socket lives at the origin. */
function socketOrigin() {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
  try {
    return new URL(raw, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

let socket = null;
let currentToken = null;

/** Rooms this tab wants to be in, re-joined after every reconnect. */
const desiredRooms = new Set();

function joinAll() {
  if (!socket?.connected) return;
  desiredRooms.forEach((room) => socket.emit(EVENTS.SUBSCRIBE, room));
}

export function getSocket() {
  if (socket) return socket;

  socket = io(socketOrigin(), {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: currentToken }),
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    // Let the app decide when to connect, so an anonymous visitor doesn't open a
    // socket before the session has had a chance to restore.
    autoConnect: false,
  });

  // A reconnect lands in a fresh set of rooms, so the subscriptions are replayed.
  socket.on('connect', joinAll);

  return socket;
}

export function connectSocket(token = null) {
  const s = getSocket();
  const tokenChanged = token !== currentToken;
  currentToken = token;

  // The handshake carries the token, so a changed identity needs a new handshake —
  // otherwise the server would keep the old user's rooms.
  if (tokenChanged && s.connected) {
    s.disconnect();
    s.connect();
    return s;
  }

  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  currentToken = null;
  desiredRooms.clear();
  if (socket?.connected) socket.disconnect();
}

export function joinRoom(room) {
  if (!room) return;
  desiredRooms.add(room);
  if (socket?.connected) socket.emit(EVENTS.SUBSCRIBE, room);
}

export function leaveRoom(room) {
  if (!room) return;
  desiredRooms.delete(room);
  if (socket?.connected) socket.emit(EVENTS.UNSUBSCRIBE, room);
}

/**
 * Identifies this tab on REST writes (sent as X-Socket-Id) so the server can tag the
 * echo it broadcasts back and this tab can ignore its own change.
 */
export const getSocketId = () => (socket?.connected ? socket.id : null);
