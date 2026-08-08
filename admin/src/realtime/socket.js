import { io } from 'socket.io-client';
import { EVENTS } from './events';

/**
 * One socket for the whole panel.
 *
 * Same contract as the storefront's: framework-free so the axios client can read the
 * socket id without depending on React, and the token is pushed in from the auth
 * layer rather than pulled out of it.
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
    autoConnect: false,
  });

  socket.on('connect', joinAll);

  return socket;
}

export function connectSocket(token = null) {
  const s = getSocket();
  const tokenChanged = token !== currentToken;
  currentToken = token;

  // The admin room is assigned during the handshake, so a new token needs a new one.
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

export const getSocketId = () => (socket?.connected ? socket.id : null);
