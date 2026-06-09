const stripe = require('../config/stripe');
const StripeCustomer = require('../models/StripeCustomer');
const Client = require('../models/Client');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const subscriptionService = require('./subscription.service');
const { STRIPE_PRICES } = require('../constants/stripePrices');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');
const { emitEvent } = require('./webhook.service');
const { WEBHOOK_EVENTS } = require('../constants/webhookEvents');
const { enqueueEmailJob } = require('./email.service');

/**
 * createCheckoutSession
 * ---------------------
 * Initiates a Stripe Checkout Session for a tenant.
 * Expired tenants must still be able to pay (no checkSubscription guard).
 * Uses mode: 'payment' for lifetime plan, and mode: 'subscription' for others.
 */
const createCheckoutSession = async (clientId, { plan, billingPeriod, successUrl, cancelUrl }) => {
  // 1. Validate plan and period
  const priceId = billingPeriod === 'lifetime'
    ? STRIPE_PRICES.lifetime?.one_time
    : STRIPE_PRICES[plan]?.[billingPeriod];

  if (!priceId) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid plan/billingPeriod combination or price ID not configured in env: ${plan}/${billingPeriod}`);
  }

  // 2. Find or create Stripe Customer ID for this tenant
  let stripeCustomer = await StripeCustomer.findOne({ clientId, isDeleted: false });
  let stripeCustomerId;

  if (stripeCustomer) {
    stripeCustomerId = stripeCustomer.stripeCustomerId;
  } else {
    const client = await Client.findById(clientId);
    if (!client) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client (tenant) not found.');
    }

    const adminUser = await User.findOne({ clientId, role: 'admin', isDeleted: false });
    const email = adminUser ? adminUser.email : `billing@${client.subdomain}.local`;
    const name = adminUser ? adminUser.name : client.name;

    // Create customer in Stripe
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        clientId: clientId.toString(),
        subdomain: client.subdomain
      }
    });

    stripeCustomerId = customer.id;

    // Save StripeCustomer mapping record
    stripeCustomer = await StripeCustomer.create({
      clientId,
      stripeCustomerId,
      plan,
      billingPeriod
    });
  }

  // 3. Determine Stripe Checkout Mode
  const isLifetime = billingPeriod === 'lifetime';
  const mode = isLifetime ? 'payment' : 'subscription';

  // 4. Create Stripe Checkout Session
  const sessionData = {
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      clientId: clientId.toString(),
      plan,
      billingPeriod
    }
  };

  // Attach subscription-specific metadata if mode is subscription
  if (mode === 'subscription') {
    sessionData.subscription_data = {
      metadata: {
        clientId: clientId.toString(),
        plan,
        billingPeriod
      }
    };
  }

  const session = await stripe.checkout.sessions.create(sessionData);
  return { url: session.url };
};

/**
 * createPortalSession
 * -------------------
 * Creates a Stripe Billing Portal session for self-service invoice/payment management.
 */
const createPortalSession = async (clientId, returnUrl) => {
  const stripeCustomer = await StripeCustomer.findOne({ clientId, isDeleted: false });
  if (!stripeCustomer) {
    throw new AppError(httpStatus.NOT_FOUND, 'No Stripe customer profile found for this tenant.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomer.stripeCustomerId,
    return_url: returnUrl
  });

  return { url: session.url };
};

/**
 * handleCheckoutComplete
 * ----------------------
 * Handles the stripe checkout.session.completed webhook event.
 */
const handleCheckoutComplete = async (session) => {
  const { clientId, plan, billingPeriod } = session.metadata || {};
  if (!clientId || !plan || !billingPeriod) {
    logger.error('[PaymentService] Checkout session completed, but missing metadata.', session.id);
    return;
  }

  const stripeCustomerId = session.customer;
  const stripeSubscriptionId = session.subscription || null; // Will be null for mode: payment (lifetime)

  logger.info(`[PaymentService] Processing checkout complete for tenant ${clientId}: plan=${plan}, billingPeriod=${billingPeriod}`);

  // 1. Update StripeCustomer mapping record
  await StripeCustomer.findOneAndUpdate(
    { clientId },
    {
      stripeCustomerId,
      stripeSubscriptionId,
      plan,
      billingPeriod
    },
    { upsert: true, new: true }
  );

  // 2. Upgrade or renew internal subscription
  const updatedSubscription = await subscriptionService.upgradeOrRenewPlan(clientId, {
    plan,
    billingPeriod
  });

  // 3. Send subscription confirmation email (resiliently)
  const adminUser = await User.findOne({ clientId, role: 'admin', isDeleted: false });
  if (adminUser) {
    enqueueEmailJob({
      to: adminUser.email,
      subject: `Subscription Activated: ${plan.toUpperCase()}`,
      templateName: 'welcome', // Resiliently fall back to welcome or generic text wrapper
      variables: {
        name: adminUser.name,
        email: adminUser.email,
        brandName: `SaaS News Platform (${plan.toUpperCase()})`,
        supportEmail: 'billing@saasnews.com',
        loginUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/login`
      }
    }).catch((err) => {
      logger.error(`[PaymentService] Failed to send subscription confirmation email: ${err.message}`);
    });
  }

  logger.info(`[PaymentService] Successfully updated subscription from checkout for tenant: ${clientId}`);
};

/**
 * handleInvoicePaymentSucceeded
 * -----------------------------
 * Handles Stripe invoice.payment_succeeded. Renews recurring subscription cycles.
 */
const handleInvoicePaymentSucceeded = async (invoice) => {
  const stripeSubscriptionId = invoice.subscription;
  if (!stripeSubscriptionId) {
    logger.info('[PaymentService] invoice.payment_succeeded has no subscription ID. (Likely one-time payment).');
    return;
  }

  // Check if it's a regular recurring cycle invoice
  if (invoice.billing_reason !== 'subscription_cycle') {
    logger.info(`[PaymentService] Invoice payment succeeded, but billing reason is '${invoice.billing_reason}'. Skipping auto-renew (already handled by checkout).`);
    return;
  }

  const stripeCustomer = await StripeCustomer.findOne({ stripeSubscriptionId, isDeleted: false });
  if (!stripeCustomer) {
    logger.error(`[PaymentService] StripeCustomer not found for subscription ID: ${stripeSubscriptionId}`);
    return;
  }

  logger.info(`[PaymentService] Recurring cycle payment succeeded. Renewing tenant ${stripeCustomer.clientId}`);

  // Auto-renew subscription
  await subscriptionService.upgradeOrRenewPlan(stripeCustomer.clientId, {
    plan: stripeCustomer.plan,
    billingPeriod: stripeCustomer.billingPeriod
  });
};

/**
 * handlePaymentFailed
 * -------------------
 * Handles Stripe invoice.payment_failed. Marks subscription as expired and alerts admin.
 */
const handlePaymentFailed = async (invoice) => {
  const stripeSubscriptionId = invoice.subscription;
  if (!stripeSubscriptionId) return;

  const stripeCustomer = await StripeCustomer.findOne({ stripeSubscriptionId, isDeleted: false });
  if (!stripeCustomer) {
    logger.error(`[PaymentService] StripeCustomer not found for payment failed event: ${stripeSubscriptionId}`);
    return;
  }

  logger.warn(`[PaymentService] Payment failed for subscription ID: ${stripeSubscriptionId}, tenant: ${stripeCustomer.clientId}`);

  // 1. Mark subscription as expired in DB
  await Subscription.findOneAndUpdate(
    { clientId: stripeCustomer.clientId, isDeleted: false },
    { status: 'expired' }
  );

  // 2. Notify the tenant admin
  const adminUser = await User.findOne({ clientId: stripeCustomer.clientId, role: 'admin', isDeleted: false });
  if (adminUser) {
    enqueueEmailJob({
      to: adminUser.email,
      subject: 'Urgent: Payment Failed for your subscription',
      templateName: 'subscriptionExpiry',
      variables: {
        brandName: 'SaaS News Platform',
        supportEmail: 'billing@saasnews.com',
        plan: stripeCustomer.plan,
        expiryDate: 'Immediately (due to failed payment)',
        renewLink: `${process.env.CLIENT_URL || 'http://localhost:3000'}/subscription/renew`
      }
    }).catch((err) => {
      logger.error(`[PaymentService] Failed to send payment failed alert email: ${err.message}`);
    });
  }

  emitEvent(stripeCustomer.clientId.toString(), WEBHOOK_EVENTS.SUBSCRIPTION_CANCELLED, {
    plan: stripeCustomer.plan,
    reason: 'payment_failed'
  });
};

/**
 * handleSubscriptionDeleted
 * --------------------------
 * Handles Stripe customer.subscription.deleted. Suspends the tenant's subscription.
 */
const handleSubscriptionDeleted = async (subscription) => {
  const stripeSubscriptionId = subscription.id;
  const stripeCustomer = await StripeCustomer.findOne({ stripeSubscriptionId, isDeleted: false });
  if (!stripeCustomer) {
    logger.error(`[PaymentService] StripeCustomer not found for deleted subscription: ${stripeSubscriptionId}`);
    return;
  }

  logger.info(`[PaymentService] Stripe subscription deleted. Suspending tenant subscription: ${stripeCustomer.clientId}`);

  // Suspend tenant subscription
  await subscriptionService.cancelSubscription(stripeCustomer.clientId);

  // Reset Stripe Subscription ID mapping
  stripeCustomer.stripeSubscriptionId = null;
  await stripeCustomer.save();
};

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleCheckoutComplete,
  handleInvoicePaymentSucceeded,
  handlePaymentFailed,
  handleSubscriptionDeleted
};
