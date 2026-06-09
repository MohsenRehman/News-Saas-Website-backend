const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');
const stripe = require('../../config/stripe');
const paymentService = require('../../services/payment.service');

const router = express.Router();

/**
 * Inbound webhook receiver.
 * Routes for external systems (Stripe, payment gateways, etc.)
 * to POST events into this platform.
 *
 * Design notes:
 *  - Uses raw body parser to preserve integrity for signature verification
 *  - Has its own strict rate limiter (independent of global limiter)
 *  - Sets req.isSystemWebhook = true (bypasses tenant middleware side-effects)
 *  - Does NOT depend on tenant resolver (avoids circular dependency risk)
 */

// Strict inbound rate limiter: 20 requests per minute per IP
const inboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: 'Too many inbound webhook requests from this IP.'
});

router.use(inboundLimiter);

// Mark all inbound requests as system-level (not tenant-bound)
router.use((req, res, next) => {
  req.isSystemWebhook = true;
  next();
});

// ─── Stripe Inbound Receiver ──────────────────────────────────────────────────

/**
 * POST /api/v1/webhooks/inbound/stripe
 *
 * Receives Stripe webhook events. Uses raw body for HMAC signature verification.
 */
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }), // Raw body needed for Stripe sig check
  async (req, res) => {
    const stripeSignature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    if (webhookSecret && stripeSignature) {
      try {
        // Construct verified Stripe event
        event = stripe.webhooks.constructEvent(req.body, stripeSignature, webhookSecret);
      } catch (err) {
        logger.error('[Inbound/Stripe] Signature verification error:', err.message);
        return res.status(400).json({ error: `Signature verification failed: ${err.message}` });
      }
    } else {
      // In development / local testing without stripe signature verified (e.g. mock scripts)
      logger.warn('[Inbound/Stripe] Stripe webhook signature verification bypassed (keys missing).');
      try {
        event = JSON.parse(req.body.toString('utf8'));
      } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON payload.' });
      }
    }

    logger.info(`[Inbound/Stripe] Received event: ${event?.type || 'unknown'}`);

    // Fire-and-forget processing via setImmediate to respond 200 OK immediately
    setImmediate(async () => {
      try {
        switch (event?.type) {
          case 'checkout.session.completed':
            await paymentService.handleCheckoutComplete(event.data.object);
            break;

          case 'invoice.payment_succeeded':
            await paymentService.handleInvoicePaymentSucceeded(event.data.object);
            break;

          case 'invoice.payment_failed':
            await paymentService.handlePaymentFailed(event.data.object);
            break;

          case 'customer.subscription.deleted':
            await paymentService.handleSubscriptionDeleted(event.data.object);
            break;

          default:
            logger.info(`[Inbound/Stripe] Unhandled event type: ${event?.type}`);
        }
      } catch (err) {
        logger.error(`[Inbound/Stripe] Error processing event ${event?.type || 'unknown'}:`, err.message);
      }
    });

    // Acknowledge receipt immediately (Stripe requires 2xx within 30s)
    return res.status(200).json({ received: true });
  }
);

// ─── Generic Inbound Receiver (for testing / custom integrations) ─────────────

/**
 * POST /api/v1/webhooks/inbound/generic
 * Accepts any JSON payload with an 'event' field.
 * Useful for testing emitEvent + inbound flows without Stripe.
 */
router.post('/generic', express.json(), async (req, res) => {
  const { event, data } = req.body;

  if (!event) {
    return res.status(400).json({ error: 'event field is required.' });
  }

  logger.info(`[Inbound/Generic] Received event: ${event}`, data);
  return res.status(200).json({ received: true, event });
});

module.exports = router;
