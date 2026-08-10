const express = require('express');
const mongoose = require('mongoose');
const env = require('../config/env');

const router = express.Router();

// mongoose.connection.readyState is numeric; these are the only two states in which
// a query would actually be served rather than buffered or rejected.
const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * GET /health — readiness probe for Render and uptime monitors.
 *
 * Mounted ahead of the API rate limiter (see app.js): a monitor polling every
 * few seconds must not eat into the request budget shared with real traffic.
 * Returns 503 when Mongo is not connected so a database outage actually fails
 * the check instead of reporting a healthy process in front of a dead store.
 */
router.get('/', (_req, res) => {
  const readyState = mongoose.connection.readyState;
  const dbConnected = readyState === 1;

  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'API is healthy' : 'API is degraded: database unavailable',
    data: {
      uptime: Math.round(process.uptime()),
      environment: env.nodeEnv,
      database: {
        connected: dbConnected,
        status: READY_STATES[readyState] || 'unknown',
      },
      integrations: {
        cloudinary: env.cloudinaryEnabled,
        razorpay: env.razorpayEnabled,
        mail: env.mailEnabled,
      },
    },
  });
});

module.exports = router;
