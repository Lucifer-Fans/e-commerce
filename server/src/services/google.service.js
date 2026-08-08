const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const client = env.googleAuthEnabled ? new OAuth2Client(env.google.clientId) : null;

/**
 * Verifies a Google Identity Services ID token (the `credential` the browser
 * receives) and returns the trusted profile claims. Throws an ApiError on any
 * signature, audience, issuer or expiry problem — the library checks all four.
 */
exports.verifyIdToken = async function verifyIdToken(credential) {
  if (!client) throw ApiError.serviceUnavailable('Google sign-in is not configured');

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.google.clientId,
    });
    payload = ticket.getPayload();
  } catch (err) {
    logger.warn(`Google ID token verification failed: ${err.message}`);
    throw ApiError.unauthorized('Could not verify your Google account. Please try again.');
  }

  if (!payload?.email) throw ApiError.unauthorized('Your Google account did not share an email');
  // Google marks unverified addresses; accepting one would let anyone claim an email.
  if (payload.email_verified === false) {
    throw ApiError.unauthorized('Your Google email address is not verified');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || undefined,
  };
};
