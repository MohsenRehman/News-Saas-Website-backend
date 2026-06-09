const Stripe = require('stripe');
const config = require('./config');
const logger = require('./logger');

let stripe;

if (!config.stripe.secretKey) {
  if (config.env === 'production') {
    throw new Error('STRIPE_SECRET_KEY is required in production.');
  } else {
    logger.warn('[Stripe] STRIPE_SECRET_KEY is not defined. Payments integration will run in degraded/mock-fallback mode.');
  }
}

stripe = new Stripe(config.stripe.secretKey || 'sk_test_placeholder', {
  apiVersion: '2024-04-10', // Using a stable API version
});

module.exports = stripe;
