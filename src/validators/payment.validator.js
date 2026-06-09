const Joi = require('joi');

/**
 * Validate create checkout session body
 */
const createCheckoutSession = {
  body: Joi.object().keys({
    plan: Joi.string().valid('basic', 'professional', 'enterprise').required(),
    billingPeriod: Joi.string().valid('monthly', 'yearly', 'lifetime').required(),
    successUrl: Joi.string().uri().required(),
    cancelUrl: Joi.string().uri().required()
  })
};

/**
 * Validate create billing portal session body
 */
const createPortalSession = {
  body: Joi.object().keys({
    returnUrl: Joi.string().uri().required()
  })
};

module.exports = {
  createCheckoutSession,
  createPortalSession
};
