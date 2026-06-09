const Joi = require('joi');

// Regex patterns
const subdomainRegex = /^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/;
const customDomainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * Validator schema for creating a new website tenant (Client + Subscription + Super Admin)
 */
const createWebsite = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    subdomain: Joi.string()
      .required()
      .lowercase()
      .trim()
      .pattern(subdomainRegex)
      .messages({
        'string.pattern.base': 'Subdomain must contain only lowercase alphanumeric characters and hyphens, and cannot start or end with a hyphen.'
      }),
    customDomain: Joi.string()
      .lowercase()
      .trim()
      .pattern(customDomainRegex)
      .allow('', null)
      .messages({
        'string.pattern.base': 'Custom Domain must be a valid fully qualified domain name (e.g. newsportal.com).'
      }),
    plan: Joi.string().required().valid('basic', 'professional', 'enterprise'),
    billingPeriod: Joi.string().required().valid('monthly', 'yearly', 'lifetime'),
    adminName: Joi.string().required().trim(),
    adminEmail: Joi.string().required().lowercase().trim().email(),
    adminPassword: Joi.string().required().min(6).messages({
      'string.min': 'Admin password must be at least 6 characters long.'
    })
  })
};

/**
 * Validator schema for updating an existing client tenant
 */
const updateClient = {
  body: Joi.object().keys({
    name: Joi.string().trim(),
    subdomain: Joi.string()
      .lowercase()
      .trim()
      .pattern(subdomainRegex)
      .messages({
        'string.pattern.base': 'Subdomain must contain only lowercase alphanumeric characters and hyphens.'
      }),
    customDomain: Joi.string()
      .lowercase()
      .trim()
      .pattern(customDomainRegex)
      .allow('', null)
      .messages({
        'string.pattern.base': 'Custom Domain must be a valid fully qualified domain name.'
      })
  }).min(1) // require at least one update parameter
};

/**
 * Validator schema for client status changes
 */
const updateStatus = {
  body: Joi.object().keys({
    status: Joi.string().required().valid('active', 'inactive', 'suspended')
  })
};

module.exports = {
  createWebsite,
  updateClient,
  updateStatus
};
