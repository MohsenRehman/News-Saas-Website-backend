const express = require('express');
const validate = require('../../middleware/validate');
const analyticsValidator = require('../../validators/analytics.validator');
const analyticsController = require('../../controllers/analytics.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// 1. Public Ingestion Endpoint (No auth required, resolved strictly via tenant middleware)
router.post('/pageview', validate(analyticsValidator.trackPageview), analyticsController.trackPageview);

// 2. Private Dashboard Analytics Endpoint (Enforces JWT auth & editor roles)
router.get(
  '/dashboard',
  authenticate,
  authorize('super_admin', 'admin'),
  validate(analyticsValidator.getDashboard),
  analyticsController.getDashboard
);

module.exports = router;
