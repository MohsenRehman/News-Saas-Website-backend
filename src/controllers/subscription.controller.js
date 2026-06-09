const subscriptionService = require('../services/subscription.service');
const httpStatus           = require('../constants/httpStatus');

/**
 * GET /api/v1/subscription
 * Returns the current tenant's subscription details + plan limits.
 */
const getMySubscription = async (req, res, next) => {
  try {
    const data = await subscriptionService.getMySubscription(req.clientId);
    return res.success(data, 'Subscription details retrieved successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscription/usage
 * Returns granular usage stats with percentages vs. plan limits.
 */
const getUsageSummary = async (req, res, next) => {
  try {
    const data = await subscriptionService.getUsageSummary(req.clientId);
    return res.success(data, 'Usage summary retrieved successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/v1/subscription/upgrade
 * Upgrades or renews the tenant's subscription plan (transaction-safe).
 * Body: { plan, billingPeriod }
 */
const upgradeOrRenewPlan = async (req, res, next) => {
  try {
    const { plan, billingPeriod } = req.body;
    const updated = await subscriptionService.upgradeOrRenewPlan(req.clientId, { plan, billingPeriod });
    return res.success(updated, 'Subscription upgraded/renewed successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/v1/subscription/cancel
 * Suspends (soft-cancels) the current tenant subscription.
 */
const cancelSubscription = async (req, res, next) => {
  try {
    const data = await subscriptionService.cancelSubscription(req.clientId);
    return res.success(data, 'Subscription cancelled (suspended) successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/subscription/usage/reset
 * Super-admin: Reset a specific usage counter for a tenant (e.g. at billing cycle).
 * Body: { clientId, field }
 */
const resetUsageStats = async (req, res, next) => {
  try {
    const { clientId, field } = req.body;
    const data = await subscriptionService.resetUsageStats(clientId, field);
    return res.success(data, `Usage counter '${field}' reset successfully.`);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getMySubscription,
  getUsageSummary,
  upgradeOrRenewPlan,
  cancelSubscription,
  resetUsageStats,
};
