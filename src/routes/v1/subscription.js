const express                    = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkSubscription }       = require('../../middleware/subscription');
const validate                   = require('../../middleware/validate');
const subscriptionValidator      = require('../../validators/subscription.validator');
const subscriptionController     = require('../../controllers/subscription.controller');

const router = express.Router();

// All subscription routes require authentication
router.use(authenticate);

// ─── Tenant Admin Routes ─────────────────────────────────────────────────────

/**
 * GET /api/v1/subscription
 * Get current subscription details + plan limits (tenant admin or super_admin)
 */
router.get(
  '/',
  authorize('admin', 'super_admin'),
  subscriptionController.getMySubscription
);

/**
 * GET /api/v1/subscription/usage
 * Get detailed per-resource usage with percentages vs. plan caps
 */
router.get(
  '/usage',
  authorize('admin', 'super_admin'),
  subscriptionController.getUsageSummary
);

/**
 * PUT /api/v1/subscription/upgrade
 * Upgrade or renew the tenant's plan (atomic, transaction-safe)
 * In production this would be gated behind payment verification.
 */
router.put(
  '/upgrade',
  authorize('admin', 'super_admin'),
  validate(subscriptionValidator.upgradeOrRenewPlan),
  subscriptionController.upgradeOrRenewPlan
);

/**
 * PATCH /api/v1/subscription/cancel
 * Suspend (soft-cancel) the current subscription
 */
router.patch(
  '/cancel',
  authorize('admin', 'super_admin'),
  subscriptionController.cancelSubscription
);

// ─── Super-Admin (Platform) Routes ───────────────────────────────────────────

/**
 * POST /api/v1/subscription/usage/reset
 * Reset a specific usage counter for any tenant (billing cycle rollover)
 */
router.post(
  '/usage/reset',
  authorize('super_admin'),
  validate(subscriptionValidator.resetUsageStats),
  subscriptionController.resetUsageStats
);

module.exports = router;
