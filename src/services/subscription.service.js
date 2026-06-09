const mongoose    = require('mongoose');
const Subscription = require('../models/Subscription');
const UsageStats   = require('../models/UsageStats');
const AppError     = require('../utils/appError');
const httpStatus   = require('../constants/httpStatus');
const { PLAN_LIMITS, LIMIT_KEY_MAP } = require('../constants/planLimits');
const logger       = require('../config/logger');
const { emitEvent } = require('./webhook.service');
const { WEBHOOK_EVENTS } = require('../constants/webhookEvents');

/**
 * getMySubscription
 * -----------------
 * Returns the current tenant's active subscription and usage statistics.
 */
const getMySubscription = async (clientId) => {
  const [subscription, usageStats] = await Promise.all([
    Subscription.findOne({ clientId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean(),
    UsageStats.findOne({ clientId, isDeleted: false }).lean(),
  ]);

  if (!subscription) {
    throw new AppError(httpStatus.NOT_FOUND, 'No subscription found for this tenant.');
  }

  const limits = PLAN_LIMITS[subscription.plan] || {};

  return {
    subscription,
    usage: usageStats || {},
    limits,
  };
};

/**
 * upgradeOrRenewPlan
 * ------------------
 * Atomically updates the tenant's subscription inside a Mongoose session
 * (MongoDB transaction) to prevent partial state updates.
 *
 * Supports:
 *   - Upgrading plan tier (basic → professional → enterprise)
 *   - Renewing (same plan, extending endDate)
 *   - Changing billing period (monthly ↔ yearly ↔ lifetime)
 */
const upgradeOrRenewPlan = async (clientId, { plan, billingPeriod }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch existing subscription inside session
    const existing = await Subscription.findOne(
      { clientId, isDeleted: false },
      null,
      { session }
    ).sort({ createdAt: -1 });

    if (!existing) {
      throw new AppError(httpStatus.NOT_FOUND, 'No subscription record found for this tenant to upgrade/renew.');
    }

    // 2. Calculate new endDate based on billing period
    const startDate = new Date();
    let endDate = null;

    if (billingPeriod === 'monthly') {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (billingPeriod === 'yearly') {
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    // lifetime → endDate remains null

    // 3. Update the subscription record
    existing.plan          = plan;
    existing.billingPeriod = billingPeriod;
    existing.status        = 'active';
    existing.startDate     = startDate;
    existing.endDate       = endDate;

    await existing.save({ session });

    await session.commitTransaction();
    session.endSession();

    logger.info(`Subscription updated for tenant ${clientId}: plan=${plan}, period=${billingPeriod}`);
    emitEvent(clientId.toString(), WEBHOOK_EVENTS.SUBSCRIPTION_UPGRADED, { plan, billingPeriod, startDate, endDate });

    return existing.toObject();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

/**
 * cancelSubscription
 * ------------------
 * Suspends the tenant's subscription (does not hard-delete).
 */
const cancelSubscription = async (clientId) => {
  const subscription = await Subscription.findOne({ clientId, isDeleted: false })
    .sort({ createdAt: -1 });

  if (!subscription) {
    throw new AppError(httpStatus.NOT_FOUND, 'No active subscription found to cancel.');
  }

  if (subscription.status === 'suspended') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Subscription is already suspended.');
  }

  subscription.status = 'suspended';
  await subscription.save();

  emitEvent(clientId.toString(), WEBHOOK_EVENTS.SUBSCRIPTION_CANCELLED, { plan: subscription.plan, suspendedAt: new Date() });

  return subscription.toObject();
};

/**
 * getUsageSummary
 * ---------------
 * Returns current usage stats and the percentage used per resource for a tenant.
 */
const getUsageSummary = async (clientId) => {
  const [subscription, usageStats] = await Promise.all([
    Subscription.findOne({ clientId, status: 'active', isDeleted: false }).lean(),
    UsageStats.findOne({ clientId, isDeleted: false }).lean(),
  ]);

  if (!subscription) {
    throw new AppError(httpStatus.NOT_FOUND, 'No active subscription for this tenant.');
  }

  const plan   = subscription.plan;
  const limits = PLAN_LIMITS[plan] || {};
  const usage  = usageStats || {};

  const summary = {};
  for (const [limitKey, statsField] of Object.entries(LIMIT_KEY_MAP)) {
    const cap     = limits[statsField] ?? 0;
    const current = usage[statsField]  ?? 0;
    summary[limitKey] = {
      current,
      limit:      cap === 0 ? 'unlimited' : cap,
      percentage: cap === 0 ? null : Math.min(100, Math.round((current / cap) * 100)),
    };
  }

  return { plan, billingPeriod: subscription.billingPeriod, status: subscription.status, usage: summary };
};

/**
 * resetUsageStats (super_admin only)
 * ------------------------------------
 * Resets a specific usage field for a tenant (e.g. at billing cycle rollover).
 */
const resetUsageStats = async (clientId, field) => {
  const statsField = LIMIT_KEY_MAP[field];
  if (!statsField) {
    throw new AppError(httpStatus.BAD_REQUEST, `Unknown usage field: '${field}'. Valid options: ${Object.keys(LIMIT_KEY_MAP).join(', ')}`);
  }

  const updated = await UsageStats.findOneAndUpdate(
    { clientId },
    { $set: { [statsField]: 0 } },
    { new: true }
  );

  if (!updated) {
    throw new AppError(httpStatus.NOT_FOUND, 'No usage stats found for this tenant.');
  }

  return updated.toObject();
};

module.exports = {
  getMySubscription,
  upgradeOrRenewPlan,
  cancelSubscription,
  getUsageSummary,
  resetUsageStats,
};
