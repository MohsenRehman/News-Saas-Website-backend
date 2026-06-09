const express = require('express');
const mongoose = require('mongoose');
const config = require('../../config/config');

const router = express.Router();

router.get('/', (req, res) => {
  const connectionStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const dbStatus = connectionStates[mongoose.connection.readyState] || 'unknown';

  // Standard response formatting via res.success
  return res.success({
    server: 'running',
    database: dbStatus,
    environment: config.env,
    tenant: req.client ? {
      id: req.clientId,
      name: req.client.name,
      subdomain: req.client.subdomain
    } : null
  }, 'Health check completed successfully');
});

// Endpoint to verify the global error handler middleware
router.get('/error-test', (req, res, next) => {
  throw new Error('Test error for validating the global error boundary.');
});

module.exports = router;
