const Joi = require('joi');

/**
 * Validation schema for retrieving activity logs
 */
const getActivityLogs = {
  query: Joi.object().keys({
    userId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).messages({
      'string.pattern.base': 'Invalid userId format.'
    }),
    action: Joi.string().trim(),
    module: Joi.string().trim(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

module.exports = {
  getActivityLogs
};
