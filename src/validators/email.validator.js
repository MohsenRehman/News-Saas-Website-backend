const Joi = require('joi');

const VALID_TEMPLATES = ['welcome', 'resetPassword', 'subscriptionExpiry', 'usageWarning', 'newsPublished'];

/**
 * Validate test email body
 */
const sendTestEmail = {
  body: Joi.object().keys({
    to:           Joi.string().email().required().messages({ 'string.email': 'Please provide a valid email address.' }),
    templateName: Joi.string().valid(...VALID_TEMPLATES).optional(),
  }),
};

module.exports = { sendTestEmail };
