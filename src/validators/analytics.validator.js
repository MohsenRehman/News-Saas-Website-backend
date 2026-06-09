const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * Validation schema for recording a pageview hit
 */
const trackPageview = {
  body: Joi.object().keys({
    path: Joi.string().required().trim(),
    newsId: Joi.string().pattern(objectIdPattern).allow(null, '').messages({
      'string.pattern.base': 'newsId must be a valid MongoDB ObjectId.'
    }),
    referrer: Joi.string().trim().allow(''),
    visitorId: Joi.string().required().trim(),
    device: Joi.string().trim().allow(''),
    country: Joi.string().trim().allow('')
  })
};

/**
 * Validation schema for retrieving analytics reports
 */
const getDashboard = {
  query: Joi.object().keys({
    timeframe: Joi.string().valid('today', '7days', '30days', 'all').default('7days')
  })
};

module.exports = {
  trackPageview,
  getDashboard
};
