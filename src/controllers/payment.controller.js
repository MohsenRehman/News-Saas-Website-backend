const paymentService = require('../services/payment.service');
const StripeCustomer = require('../models/StripeCustomer');
const Subscription = require('../models/Subscription');

/**
 * POST /api/v1/payments/checkout
 * Create a Stripe Checkout Session for subscription or lifetime upgrade.
 * Expired tenants must be allowed to access this to renew, so no subscription guard.
 */
const checkout = async (req, res, next) => {
  try {
    const { plan, billingPeriod, successUrl, cancelUrl } = req.body;
    const session = await paymentService.createCheckoutSession(req.clientId, {
      plan,
      billingPeriod,
      successUrl,
      cancelUrl
    });

    return res.success(session, 'Stripe Checkout Session created successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/payments/portal
 * Create a Stripe Billing Portal session for the tenant to manage payment methods/invoices.
 */
const portal = async (req, res, next) => {
  try {
    const { returnUrl } = req.body;
    const session = await paymentService.createPortalSession(req.clientId, returnUrl);

    return res.success(session, 'Stripe Billing Portal session created successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/payments/status
 * Retrieve the current Stripe customer mapping and internal subscription status.
 */
const status = async (req, res, next) => {
  try {
    const [stripeCustomer, subscription] = await Promise.all([
      StripeCustomer.findOne({ clientId: req.clientId, isDeleted: false }),
      Subscription.findOne({ clientId: req.clientId, isDeleted: false })
    ]);

    return res.success(
      {
        stripeCustomer: stripeCustomer
          ? {
              stripeCustomerId: stripeCustomer.stripeCustomerId,
              stripeSubscriptionId: stripeCustomer.stripeSubscriptionId,
              plan: stripeCustomer.plan,
              billingPeriod: stripeCustomer.billingPeriod
            }
          : null,
        subscription
      },
      'Subscription and billing status retrieved successfully.'
    );
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  checkout,
  portal,
  status
};
