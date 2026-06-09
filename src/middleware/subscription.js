const Subscription = require('../models/Subscription');
const UsageStats   = require('../models/UsageStats');
const ActivityLog  = require('../models/ActivityLog');
const AppError     = require('../utils/appError');
const httpStatus   = require('../constants/httpStatus');
const { PLAN_LIMITS, LIMIT_KEY_MAP } = require('../constants/planLimits');

/**
 * checkSubscription
 * -----------------
 * Middleware that verifies the tenant (clientId) has an active, non-expired
 * subscription. Attaches `req.subscription` for downstream use.
 *
 * Skip check if no clientId is present (master-platform super_admin requests).
 */
const checkSubscription = async (req, res, next) => {
  try {
    const clientId = req.clientId;

    // Master-platform requests (super_admin, system jobs) are not tenant-bound
    if (!clientId) return next();

    const subscription = await Subscription.findOne({
      clientId,
      isDeleted: false,
    }).lean();

    if (!subscription) {
      return next(new AppError(httpStatus.PAYMENT_REQUIRED, 'No active subscription found for this tenant.'));
    }

    if (subscription.status === 'suspended') {
      return next(new AppError(httpStatus.PAYMENT_REQUIRED, 'Your subscription has been suspended. Please contact support.'));
    }

    if (subscription.status === 'expired') {
      return next(new AppError(httpStatus.PAYMENT_REQUIRED, 'Your subscription has expired. Please renew to continue.'));
    }

    // For non-lifetime plans, additionally verify endDate hasn't lapsed
    if (subscription.billingPeriod !== 'lifetime' && subscription.endDate) {
      if (new Date() > new Date(subscription.endDate)) {
        // Mark as expired in background (non-blocking, best-effort)
        Subscription.findByIdAndUpdate(subscription._id, { status: 'expired' }).catch(() => {});
        return next(new AppError(httpStatus.PAYMENT_REQUIRED, 'Your subscription period has ended. Please renew to continue.'));
      }
    }

    req.subscription = subscription;
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * checkPlanLimit
 * --------------
 * Middleware factory.  Performs an **atomic** read of the current usage counter
 * and the plan cap to decide if the request would exceed the tenant's plan limits.
 *
 * "Atomic" here means: we use findOneAndUpdate with $inc and rollback if the
 * resulting value exceeds the cap – this prevents two concurrent requests from
 * both reading "under-limit" and both being allowed through (TOCTOU race).
 *
 * @param {string} limitKey - Key from LIMIT_KEY_MAP (e.g. 'maxUsers', 'maxStorage')
 * @param {Function} [amountFn] - Optional fn(req) → Number returning the delta amount
 *                                 Defaults to 1 for count-based resources.
 */
const checkPlanLimit = (limitKey, amountFn) => {
  return async (req, res, next) => {
    try {
      const clientId = req.clientId;

      // No tenant context → skip (super_admin / system)
      if (!clientId) return next();

      const statsField = LIMIT_KEY_MAP[limitKey];
      if (!statsField) {
        return next(new AppError(httpStatus.INTERNAL_SERVER_ERROR, `Unknown plan limit key: ${limitKey}`));
      }

      // Resolve subscription (may already be attached by checkSubscription)
      const subscription = req.subscription
        || await Subscription.findOne({ clientId, status: 'active', isDeleted: false }).lean();

      if (!subscription) {
        return next(new AppError(httpStatus.PAYMENT_REQUIRED, 'No active subscription found.'));
      }

      const plan    = subscription.plan;
      const limits  = PLAN_LIMITS[plan];
      const cap     = limits ? limits[statsField] : undefined;

      // 0 means unlimited for enterprise-style plans
      if (cap === 0) return next();

      if (cap === undefined) {
        return next(new AppError(httpStatus.INTERNAL_SERVER_ERROR, `Plan limit for '${statsField}' is not defined.`));
      }

      // Determine how much this request will consume
      const delta = amountFn ? amountFn(req) : 1;

      // ---- Atomic increment + check ----
      // We increment optimistically, then rollback if we're over the cap.
      // This prevents TOCTOU race conditions when two concurrent requests
      // both read the counter as "under-limit" before either writes.
      const updatedStats = await UsageStats.findOneAndUpdate(
        { clientId },
        { $inc: { [statsField]: delta } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      if (updatedStats[statsField] > cap) {
        // Rollback the optimistic increment
        await UsageStats.findOneAndUpdate(
          { clientId },
          { $inc: { [statsField]: -delta } }
        );

        // Resiliently log limit reached event to ActivityLog
        (async () => {
          try {
            const User = require('../models/User');
            let userId = req.user ? (req.user.id || req.user._id) : null;
            if (!userId) {
              const superAdmin = await User.findOne({ clientId, role: 'super_admin' }).lean();
              userId = superAdmin ? superAdmin._id : null;
            }
            if (!userId) {
              const anyUser = await User.findOne({ clientId }).lean();
              userId = anyUser ? anyUser._id : null;
            }
            if (userId) {
              await ActivityLog.create({
                clientId,
                userId,
                action: 'subscription_limit_reached',
                module: 'subscription',
                ipAddress: req.ip || 'system',
                details: { limitKey, current: updatedStats[statsField] - delta, cap },
                timestamp: new Date()
              });
            }
          } catch (err) {
            // ignore
          }
        })();

        return next(
          new AppError(
            httpStatus.FORBIDDEN,
            `Plan limit reached for '${limitKey}'. Current usage: ${updatedStats[statsField] - delta}/${cap}. Please upgrade your plan.`
          )
        );
      }

      // Attach updated stats for downstream controllers (optional convenience)
      req.usageStats = updatedStats;
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

module.exports = { checkSubscription, checkPlanLimit };

