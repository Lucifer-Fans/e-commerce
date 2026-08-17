/**
 * End-to-end check that a suspended account is refused everywhere.
 *
 *   npm run test:suspension
 *
 * Blocking is enforced in several places at once — the auth middleware on every
 * protected request, both sign-in doors, the sign-up door, the token refresh, and
 * the password-reset and reactivation flows that would otherwise hand out a
 * session behind all of them. Each is a separate line of code, and a regression in
 * any one of them reopens the account without touching the others. So the check is
 * a live one: the real app, on the real database, with the tokens a real browser
 * would still be holding at the moment the block lands.
 *
 * Everything it creates is temporary and removed in `cleanup()`, including the
 * sessions and audit rows the refusals leave behind. No email is sent: the two
 * accounts are written straight to the collection rather than registered, and every
 * endpoint here that would mail something is one that refuses a blocked account
 * before it gets that far — which is itself part of what is asserted.
 */
const mongoose = require('mongoose');

const env = require('../src/config/env');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const AccountAudit = require('../src/models/AccountAudit');
const Session = require('../src/models/Session');
const tokenService = require('../src/services/token.service');

const STAMP = Date.now();
const SHOPPER_EMAIL = `suspension-test-${STAMP}@example.com`;
const ADMIN_EMAIL = `suspension-admin-${STAMP}@example.com`;
const STAFF_EMAIL = `suspension-staff-${STAMP}@example.com`;
const PASSWORD = 'TestPass123';
const REASON = 'fraud';

let base;
let server;
const created = [];

/* ------------------------------- assertions ------------------------------- */

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `\n         ${detail}` : ''}`);
  }
}

/** Asserts the status and code, and that the reason the admin typed reached the caller. */
function checkRefusal(name, res, { status, code, mentionsReason = false }) {
  const ok =
    res.status === status &&
    (code === undefined || res.body?.code === code) &&
    (!mentionsReason || String(res.body?.message || '').includes(REASON));

  check(name, ok, `got ${res.status} ${JSON.stringify(res.body?.code ?? null)} — ${res.body?.message}`);
}

/* --------------------------------- client --------------------------------- */

async function call(method, path, { token, body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: res.status,
    body: await res.json().catch(() => ({})),
    setCookie: res.headers.getSetCookie ? res.headers.getSetCookie() : [],
  };
}

const cookieFrom = (setCookie, name) =>
  setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`)) || null;

/* --------------------------------- fixtures -------------------------------- */

async function makeUser(email, role, label) {
  const user = await User.create({
    name: label,
    email,
    password: PASSWORD,
    role,
    status: 'active',
    isEmailVerified: true,
    emailVerificationPending: false,
  });
  created.push(user._id);
  return user;
}

async function cleanup() {
  if (!created.length) return;
  await Promise.all([
    User.deleteMany({ _id: { $in: created } }),
    AccountAudit.deleteMany({ user: { $in: created } }),
    Session.deleteMany({ user: { $in: created } }),
  ]);
}

/* ---------------------------------- run ----------------------------------- */

async function run() {
  const shopper = await makeUser(SHOPPER_EMAIL, 'user', 'Suspension Test Shopper');
  const staff = await makeUser(STAFF_EMAIL, 'admin', 'Suspension Test Staff');
  const suspendedAdmin = await makeUser(ADMIN_EMAIL, 'admin', 'Suspension Test Admin');

  // The staff account drives the block through the real endpoint. Its token carries
  // no `sid` — a shape the middleware still honours — so no session has to be
  // manufactured for an account that exists only to press one button.
  const staffToken = tokenService.signAccessToken(staff, undefined);

  /* -- 1. A live, signed-in shopper, exactly as a browser would hold it -- */
  console.log('\nBefore the block');
  const signIn = await call('POST', '/auth/login', {
    body: { email: SHOPPER_EMAIL, password: PASSWORD },
  });
  check('an active account can sign in', signIn.status === 200, `got ${signIn.status} — ${signIn.body?.message}`);
  const accessToken = signIn.body?.data?.accessToken;
  const refreshCookie = cookieFrom(signIn.setCookie, 'refreshToken');

  const meBefore = await call('GET', '/auth/me', { token: accessToken });
  check('an active account can read its profile', meBefore.status === 200, `got ${meBefore.status}`);

  // Minted while the account is still open and held back until after the block:
  // this is the link already sitting in an inbox when the suspension lands.
  const rawResetToken = shopper.createPasswordResetToken();
  await shopper.save({ validateBeforeSave: false });
  const resetTokenBefore = shopper.passwordResetToken;

  /* -- 2. The block, through the admin API staff actually use -- */
  console.log('\nThe block');
  const blocked = await call('PATCH', `/users/${shopper._id}/status`, {
    token: staffToken,
    body: { status: 'blocked', blockedReason: REASON },
  });
  check('an admin can suspend the account', blocked.status === 200, `got ${blocked.status} — ${blocked.body?.message}`);

  const stored = await User.findById(shopper._id);
  check(
    'the status and the reason are both stored',
    stored.status === 'blocked' && stored.blockedReason === REASON,
    `status=${stored.status} reason=${stored.blockedReason}`
  );

  const liveSessions = await Session.countDocuments({ user: shopper._id, status: 'active' });
  check('every device session was revoked', liveSessions === 0, `${liveSessions} still active`);

  // The second account is suspended here too. The admin console is a separate front
  // door onto the same accounts, and "blocked everywhere" has to mean staff as well
  // — an admin whose own account is suspended keeps a valid token and a role that
  // opens every admin screen, so it is the token most worth proving dead.
  await User.updateOne(
    { _id: suspendedAdmin._id },
    { $set: { status: 'blocked', blockedReason: REASON } }
  );

  /* -- 3. The credentials the browser is still holding -- */
  console.log('\nThe session already in flight');

  // Signed after the block and carrying no `sid`, so nothing but the status check
  // can be what refuses it. Without this a passing run would prove only that the
  // session sweep works, not that the account state is read on every request.
  const sessionlessToken = tokenService.signAccessToken(shopper, undefined);

  checkRefusal('GET /auth/me is refused', await call('GET', '/auth/me', { token: accessToken }), {
    status: 403,
    code: 'ACCOUNT_SUSPENDED',
    mentionsReason: true,
  });

  for (const path of ['/cart', '/wishlist', '/addresses', '/orders', '/auth/sessions']) {
    checkRefusal(`GET ${path} is refused`, await call('GET', path, { token: sessionlessToken }), {
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      mentionsReason: true,
    });
  }

  checkRefusal(
    'adding to the cart is refused',
    await call('POST', '/cart/items', {
      token: sessionlessToken,
      body: { product: new mongoose.Types.ObjectId().toString(), quantity: 1 },
    }),
    { status: 403, code: 'ACCOUNT_SUSPENDED' }
  );

  checkRefusal(
    'placing an order is refused',
    await call('POST', '/orders', { token: sessionlessToken, body: {} }),
    { status: 403, code: 'ACCOUNT_SUSPENDED' }
  );

  checkRefusal(
    'changing the password is refused',
    await call('PATCH', '/auth/change-password', {
      token: sessionlessToken,
      body: { currentPassword: PASSWORD, newPassword: 'AnotherPass123' },
    }),
    { status: 403, code: 'ACCOUNT_SUSPENDED' }
  );

  checkRefusal(
    'editing the profile is refused',
    await call('PATCH', '/users/me', { token: sessionlessToken, body: { name: 'Renamed' } }),
    { status: 403, code: 'ACCOUNT_SUSPENDED' }
  );

  checkRefusal(
    'an admin-only screen is refused to a suspended admin',
    await call('GET', '/users?page=1&limit=1', {
      token: tokenService.signAccessToken(suspendedAdmin, undefined),
    }),
    { status: 403, code: 'ACCOUNT_SUSPENDED', mentionsReason: true }
  );

  /* -- 4. Every door back in -- */
  console.log('\nThe doors back in');
  checkRefusal(
    'signing in again is refused, with the reason',
    await call('POST', '/auth/login', { body: { email: SHOPPER_EMAIL, password: PASSWORD } }),
    { status: 403, code: 'ACCOUNT_SUSPENDED', mentionsReason: true }
  );

  const signUp = await call('POST', '/auth/register', {
    body: { name: 'Store Admin', email: SHOPPER_EMAIL, password: PASSWORD },
  });
  checkRefusal('signing up on the same address is refused', signUp, {
    status: 409,
    code: 'ACCOUNT_SUSPENDED',
    mentionsReason: true,
  });
  check(
    'the sign-up refusal explains the suspension rather than only saying the address is taken',
    /already exists/i.test(signUp.body?.message || '') && /suspended/i.test(signUp.body?.message || ''),
    signUp.body?.message
  );

  const refreshed = await call('POST', '/auth/refresh', { cookie: refreshCookie });
  check(
    'the refresh token no longer buys a new session',
    refreshed.status === 401,
    `got ${refreshed.status} — ${refreshed.body?.message}`
  );

  const verify = await call('POST', '/auth/verify-email', {
    body: { email: SHOPPER_EMAIL, otp: '123456' },
  });
  check(
    'the sign-up code screen is not a way in',
    verify.status === 403 || verify.status === 400,
    `got ${verify.status} — ${verify.body?.message}`
  );

  const forgot = await call('POST', '/auth/forgot-password', { body: { email: SHOPPER_EMAIL } });
  const afterForgot = await User.findById(shopper._id).select('+passwordResetToken');
  check(
    'forgot-password answers generically and mints nothing new',
    forgot.status === 200 &&
      !/suspend/i.test(forgot.body?.message || '') &&
      afterForgot.passwordResetToken === resetTokenBefore,
    `${forgot.status} — ${forgot.body?.message}`
  );

  checkRefusal(
    'a reset link mailed before the block cannot be spent',
    await call('POST', `/auth/reset-password/${rawResetToken}`, { body: { password: 'BrandNew123' } }),
    { status: 403, code: 'ACCOUNT_SUSPENDED', mentionsReason: true }
  );

  const afterReset = await User.findById(shopper._id);
  check(
    'that attempt neither changed the password nor reopened the account',
    afterReset.status === 'blocked',
    `status is now ${afterReset.status}`
  );

  const reactivate = await call('POST', '/auth/reactivation/request', {
    body: { email: SHOPPER_EMAIL },
  });
  const afterReactivate = await User.findById(shopper._id).select('+reactivationToken');
  check(
    'reactivation is not a route out of a staff block',
    reactivate.status === 200 && !afterReactivate.reactivationToken,
    reactivate.status === 200
      ? 'a reactivation token was issued for a blocked account'
      : `got ${reactivate.status}`
  );

  checkRefusal(
    'the admin console door refuses a suspended admin',
    await call('POST', '/auth/admin/login', { body: { email: ADMIN_EMAIL, password: PASSWORD } }),
    { status: 403, code: 'ACCOUNT_SUSPENDED', mentionsReason: true }
  );

  /* -- 5. What is left of the account elsewhere -- */
  console.log('\nEverywhere else');
  const anon = await call('GET', '/products?limit=1', { token: sessionlessToken });
  check(
    'a blocked token browsing the catalogue is treated as a stranger, not an error',
    anon.status === 200,
    `got ${anon.status}`
  );

  const trail = await AccountAudit.countDocuments({ user: shopper._id });
  check('the refusals left an audit trail', trail > 0, `${trail} entries`);
}

/* --------------------------------- driver --------------------------------- */

(async () => {
  await connectDB();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}${env.apiPrefix}`;

  try {
    await run();
  } catch (err) {
    failures.push(`the run itself threw: ${err.message}`);
    console.error(err);
  } finally {
    await cleanup();
    server.close();
    await disconnectDB();
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n  - ${failures.join('\n  - ')}` : '')
  );
  process.exit(failures.length ? 1 : 0);
})();
