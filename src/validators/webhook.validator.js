const Joi = require('joi');
const { WEBHOOK_EVENT_SET } = require('../constants/webhookEvents');

const VALID_EVENTS = [...WEBHOOK_EVENT_SET];

/**
 * Validate registration payload
 */
const registerWebhook = {
  body: Joi.object().keys({
    url: Joi.string().uri({ scheme: ['http', 'https'] }).required().messages({
      'string.uri': 'url must be a valid http or https URL.',
    }),
    events: Joi.array()
      .items(Joi.string().valid(...VALID_EVENTS))
      .min(1)
      .required()
      .messages({
        'array.min':  'At least one event must be specified.',
        'any.only':   `Each event must be one of: ${VALID_EVENTS.join(', ')}`,
      }),
    description: Joi.string().max(200).allow('', null).optional(),
  }),
};

/**
 * Validate update payload
 */
const updateWebhook = {
  body: Joi.object()
    .keys({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
      events: Joi.array()
        .items(Joi.string().valid(...VALID_EVENTS))
        .min(1)
        .optional(),
      description: Joi.string().max(200).allow('', null).optional(),
      isActive: Joi.boolean().optional(),
    })
    .min(1),
};

module.exports = { registerWebhook, updateWebhook };
