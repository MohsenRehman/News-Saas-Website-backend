const Joi = require('joi');

/**
 * Validate public newsletter subscription
 */
const subscribe = {
  body: Joi.object().keys({
    email: Joi.string().email().required().trim().lowercase(),
    name: Joi.string().optional().trim().allow('').max(50)
  })
};

/**
 * Validate public newsletter unsubscription
 */
const unsubscribe = {
  query: Joi.object().keys({
    token: Joi.string().length(48).hex().required().messages({
      'string.length': 'Invalid secure unsubscribe token structure.'
    })
  })
};

/**
 * Validate admin creating a newsletter campaign
 */
const createCampaign = {
  body: Joi.object().keys({
    subject: Joi.string().required().trim().min(3).max(150),
    body: Joi.string().required().trim().min(10)
  })
};

/**
 * Validate subscriber list query filters
 */
const getSubscribers = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'unsubscribed').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

/**
 * Validate campaign lists
 */
const getCampaigns = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

/**
 * Generic ObjectId validation
 */
const checkIdParam = {
  params: Joi.object().keys({
    subscriberId: Joi.string().length(24).hex().optional(),
    campaignId: Joi.string().length(24).hex().optional()
  })
};

module.exports = {
  subscribe,
  unsubscribe,
  createCampaign,
  getSubscribers,
  getCampaigns,
  checkIdParam
};
