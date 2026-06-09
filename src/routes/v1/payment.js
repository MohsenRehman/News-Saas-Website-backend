const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const paymentValidator = require('../../validators/payment.validator');
const paymentController = require('../../controllers/payment.controller');

const router = express.Router();

// All payment routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/payments/checkout
 * Create a Stripe Checkout session. (No checkSubscription guard).
 */
router.post(
  '/checkout',
  authorize('admin', 'super_admin'),
  validate(paymentValidator.createCheckoutSession),
  paymentController.checkout
);

/**
 * POST /api/v1/payments/portal
 * Create a Stripe Billing Portal session. (No checkSubscription guard).
 */
router.post(
  '/portal',
  authorize('admin', 'super_admin'),
  validate(paymentValidator.createPortalSession),
  paymentController.portal
);

/**
 * GET /api/v1/payments/status
 * Get the payment and subscription status. (No checkSubscription guard).
 */
router.get(
  '/status',
  authorize('admin', 'super_admin'),
  paymentController.status
);

module.exports = router;
