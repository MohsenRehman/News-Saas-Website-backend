const Joi = require('joi');

/**
 * Validator schema for creating a new tenant admin editor
 */
const createAdmin = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    email: Joi.string().required().lowercase().trim().email(),
    password: Joi.string().required().min(6).messages({
      'string.min': 'Password must be at least 6 characters long.'
    })
  })
};

/**
 * Validator schema for updating an editor details
 */
const updateAdmin = {
  body: Joi.object().keys({
    name: Joi.string().trim()
  }).min(1)
};

/**
 * Validator schema for editor status toggling
 */
const updateStatus = {
  body: Joi.object().keys({
    status: Joi.string().required().valid('active', 'inactive')
  })
};

/**
 * Validator schema for resetting an editor's password
 */
const resetPassword = {
  body: Joi.object().keys({
    password: Joi.string().required().min(6).messages({
      'string.min': 'Password must be at least 6 characters long.'
    })
  })
};

/**
 * Validator schema for updating tenant website configurations
 */
const updateSettings = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    tagline: Joi.string().allow('', null).trim().default(''),
    logo: Joi.string().allow('', null).trim().default(''),
    primaryColor: Joi.string().regex(/^#[0-9a-fA-F]{6}$/).required(),
    contactEmail: Joi.string().lowercase().trim().email().required(),
    contactPhone: Joi.string().allow('', null).trim().default(''),
    twitterUrl: Joi.string().allow('', null).trim().default(''),
    facebookUrl: Joi.string().allow('', null).trim().default(''),
    youtubeUrl: Joi.string().allow('', null).trim().default(''),
    tiktokUrl: Joi.string().allow('', null).trim().default(''),
    whatsappUrl: Joi.string().allow('', null).trim().default(''),
    features: Joi.object().keys({
      aiStudioEnabled: Joi.boolean().default(true),
      commentsApprovalRequired: Joi.boolean().default(false)
    }).default({ aiStudioEnabled: true, commentsApprovalRequired: false })
  })
};

module.exports = {
  createAdmin,
  updateAdmin,
  updateStatus,
  resetPassword,
  updateSettings
};
