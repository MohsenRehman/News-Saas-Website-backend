const Joi = require('joi');

const VALID_PLANS          = ['basic', 'professional', 'enterprise'];
const VALID_BILLING_PERIODS = ['monthly', 'yearly', 'lifetime'];

/**
 * Validate body for plan upgrade / renewal
 */
const upgradeOrRenewPlan = {
  body: Joi.object().keys({
    plan:          Joi.string().valid(...VALID_PLANS).required(),
    billingPeriod: Joi.string().valid(...VALID_BILLING_PERIODS).required(),
  }),
};

/**
 * Validate body for resetting a usage counter (super_admin route)
 */
const resetUsageStats = {
  body: Joi.object().keys({
    clientId: Joi.string().required().regex(/^[a-fA-F0-9]{24}$/).messages({
      'string.pattern.base': 'clientId must be a valid 24-character MongoDB ObjectId.'
    }),
    field: Joi.string()
      .valid('admins', 'news', 'storage', 'aiRequests', 'apiRequests')
      .required()
      .messages({
        'any.only': 'field must be one of: admins, news, storage, aiRequests, apiRequests'
      }),
  }),
};

module.exports = { upgradeOrRenewPlan, resetUsageStats };
