const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const logger = require('../utils/logger');
const User = require('../models/User');
const EVENTS = require('./events');

/**
 * Realtime transport.
 *
 * Rooms
 *   public          every connection, authenticated or not — catalogue, banners, settings
 *   user:<id>       one shopper across all their tabs/devices — cart, wishlist, their orders
 *   admins          every signed-in admin — orders feed, dashboard, moderation
 *   product:<id>    whoever currently has that product page open — stock, price, reviews
 *   order:<id>      the buyer plus admins watching that order detail page
 *
 * Auth is optional: an anonymous visitor still gets `public` so the storefront stays
 * live before login. A token that is present but bad is treated as anonymous rather
 * than refused, so an expired access token degrades to "public updates only" instead
 * of leaving the page permanently disconnected.
 */

const ROOMS = {
  PUBLIC: 'public',
  ADMINS: 'admins',
  user: (id) => `user:${id}`,
  product: (id) => `product:${id}`,
  order: (id) => `order:${id}`,
};

let io = null;

/* ------------------------------------------------------------------ *
 * Handshake
 * ------------------------------------------------------------------ */

function readToken(socket) {
  const { token } = socket.handshake.auth || {};
  if (token) return String(token).replace(/^Bearer\s+/i, '');

  const header = socket.handshake.headers?.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  return null;
}

/** Resolves the connection's identity. Never throws — failure means "anonymous". */
async function identify(socket) {
  const token = readToken(socket);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret);
    const user = await User.findById(decoded.sub).select('name email role status');
    if (!user || user.status !== 'active') return null;

    // A device that has been signed out must not keep a live socket in this
    // account's room — it would go on receiving carts and orders after the fact.
    if (decoded.sid) {
      const sessionService = require('../services/session.service');
      if (!(await sessionService.touch(decoded.sid))) return null;
    }

    return user;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Room subscription requests from the browser
 * ------------------------------------------------------------------ */

/**
 * A client may only ever ask for rooms that carry no private data. Everything
 * personal (`user:`, `admins`) is joined by the server from the verified identity,
 * never on request — otherwise any visitor could subscribe to someone else's cart.
 */
async function canJoin(room, socket) {
  if (typeof room !== 'string' || room.length > 80) return false;

  // Product rooms carry catalogue data that is already public.
  if (/^product:[a-f\d]{24}$/i.test(room)) return true;

  // Order rooms carry a customer's name, email and totals, so membership is checked
  // against the order itself — being signed in is not enough to watch someone
  // else's order.
  const orderMatch = room.match(/^order:([a-f\d]{24})$/i);
  if (orderMatch) {
    const user = socket.data.user;
    if (!user) return false;
    if (user.role === 'admin') return true;

    const Order = require('../models/Order');
    return Boolean(await Order.exists({ _id: orderMatch[1], user: user._id }));
  }

  return false;
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

function init(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    },
    // Long-poll fallback keeps the app working behind proxies that block upgrades.
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
    connectionStateRecovery: {
      /**
       * A brief network blip replays what was missed instead of dropping updates.
       *
       * The replay buffer is held in this process's memory, per disconnected
       * session, so the window is also a memory budget: two minutes of every
       * dropped connection's missed packets is a real figure on a 512MB
       * instance where phones are backgrounding tabs all day. Thirty seconds
       * still covers what this is for — a tunnel, a lift, a wifi handover —
       * and anything longer was going to be a refetch on reconnect anyway.
       */
      maxDisconnectionDuration: 30 * 1000,
      skipMiddlewares: false,
    },
    /**
     * Per-message deflate is off by default in Socket.IO for good reason and is
     * named here only so nobody switches it on: it allocates a zlib context per
     * connection — hundreds of KB apiece, and they are slow to be reclaimed —
     * to compress payloads that are already small JSON. Both resources it
     * spends are the two this instance has least of.
     */
    perMessageDeflate: false,
    // A realtime payload here is a few KB of JSON at most. The 1MB default is
    // simply a larger buffer than anything legitimate needs.
    maxHttpBufferSize: 1e5,
  });

  io.use(async (socket, next) => {
    socket.data.user = await identify(socket);
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    socket.join(ROOMS.PUBLIC);
    if (user) {
      socket.join(ROOMS.user(user._id));
      if (user.role === 'admin') socket.join(ROOMS.ADMINS);
    }

    socket.emit(EVENTS.READY, {
      authenticated: Boolean(user),
      role: user?.role || 'guest',
      userId: user ? String(user._id) : null,
      serverTime: new Date().toISOString(),
    });

    if (user?.role === 'admin') broadcastPresence();

    socket.on(EVENTS.SUBSCRIBE, async (room, ack) => {
      let allowed = false;
      try {
        allowed = await canJoin(room, socket);
      } catch {
        allowed = false; // a lookup failure must deny, never grant
      }

      if (!allowed) {
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      socket.join(room);
      if (typeof ack === 'function') ack({ ok: true, room });
    });

    socket.on(EVENTS.UNSUBSCRIBE, (room) => {
      if (typeof room === 'string') socket.leave(room);
    });

    socket.on('disconnect', () => {
      if (user?.role === 'admin') broadcastPresence();
    });
  });

  logger.info('Realtime gateway ready on /socket.io');
  return io;
}

async function close() {
  if (!io) return;
  await new Promise((resolve) => io.close(resolve));
  io = null;
}

/* ------------------------------------------------------------------ *
 * Emit helpers
 *
 * Every helper is a no-op when the gateway is not running (seed scripts, tests),
 * so controllers can call them unconditionally.
 * ------------------------------------------------------------------ */

const emit = (room, event, payload) => {
  if (!io) return;
  io.to(room).emit(event, payload);
};

const toPublic = (event, payload) => emit(ROOMS.PUBLIC, event, payload);
const toAdmins = (event, payload) => emit(ROOMS.ADMINS, event, payload);
const toUser = (userId, event, payload) => userId && emit(ROOMS.user(userId), event, payload);
const toProduct = (productId, event, payload) =>
  productId && emit(ROOMS.product(productId), event, payload);
const toOrder = (orderId, event, payload) => orderId && emit(ROOMS.order(orderId), event, payload);

/**
 * Fan-out for order changes: the buyer, every admin, and anyone on that order page.
 *
 * The rooms overlap — a buyer viewing their own order is in both `user:` and
 * `order:` — so the three targets are chained into ONE emit. Socket.IO delivers a
 * chained emit to each socket once, which is what stops the buyer seeing two toasts
 * for a single status change.
 */
function toOrderAudience(order, event, payload) {
  if (!io || !order) return;

  const userId = String(order.user?._id || order.user || '');

  let channel = io.to(ROOMS.ADMINS).to(ROOMS.order(order._id));
  if (userId) channel = channel.to(ROOMS.user(userId));

  channel.emit(event, payload);
}

/** Tells admin dashboards their aggregates are stale. */
const invalidateDashboard = (reason) =>
  toAdmins(EVENTS.DASHBOARD_INVALIDATED, { reason, at: new Date().toISOString() });

/** Live count of connected admins, shown in the admin topbar. */
async function broadcastPresence() {
  if (!io) return;
  try {
    const sockets = await io.in(ROOMS.ADMINS).fetchSockets();
    const admins = new Set(sockets.map((s) => String(s.data.user?._id)).filter(Boolean));
    toAdmins(EVENTS.PRESENCE_UPDATED, { admins: admins.size });
  } catch {
    /* presence is cosmetic — never let it break a connection */
  }
}

module.exports = {
  init,
  close,
  getIO: () => io,
  EVENTS,
  ROOMS,
  toPublic,
  toAdmins,
  toUser,
  toProduct,
  toOrder,
  toOrderAudience,
  invalidateDashboard,
};
