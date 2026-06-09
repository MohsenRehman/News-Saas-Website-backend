const Joi = require('joi');

/**
 * Validation schema for listing notifications
 */
const getNotifications = {
  query: Joi.object().keys({
    isRead: Joi.boolean(),
    type: Joi.string().valid('admin', 'system', 'subscription_alert'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

/**
 * Validation schema for dispatching an admin notification
 */
const createNotification = {
  body: Joi.object().keys({
    userId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
      'string.pattern.base': 'Invalid target userId format.'
    }),
    title: Joi.string().required().trim().min(1),
    message: Joi.string().required().trim().min(1),
    type: Joi.string().valid('admin', 'system', 'subscription_alert').default('admin')
  })
};

/**
 * Validation schema for actions on a single notification ID
 */
const notificationId = {
  params: Joi.object().keys({
    id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required().messages({
      'string.pattern.base': 'Invalid notification ID format.'
    })
  })
};

module.exports = {
  getNotifications,
  createNotification,
  notificationId
};
