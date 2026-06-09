const Joi = require('joi');

/**
 * Validation schema for listing contact submissions
 */
const getContacts = {
  query: Joi.object().keys({
    status: Joi.string().valid('unread', 'read'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

/**
 * Validation schema for single contact action by ID
 */
const contactId = {
  params: Joi.object().keys({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
      'string.pattern.base': 'Invalid contact ID format.'
    })
  })
};

module.exports = {
  getContacts,
  contactId
};
