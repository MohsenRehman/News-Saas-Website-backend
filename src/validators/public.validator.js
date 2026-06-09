const Joi = require('joi');

const adLocations = ['header', 'homepage_banner', 'sidebar', 'article_ads', 'footer'];
const newsLabels = ['breaking', 'featured', 'trending', 'top_story'];

/**
 * Validation schema for listing public news feed
 */
const getPublicNews = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    category: Joi.string().trim().lowercase(),
    search: Joi.string().allow('', null),
    label: Joi.string().valid(...newsLabels),
    tag: Joi.string().trim()
  })
};

/**
 * Validation schema for public contact submissions
 */
const createContact = {
  body: Joi.object().keys({
    name: Joi.string().required().trim().max(100),
    email: Joi.string().required().email().lowercase().trim(),
    subject: Joi.string().required().trim().max(150),
    message: Joi.string().required().trim()
  })
};

/**
 * Validation schema for active ads queries
 */
const getPublicAds = {
  query: Joi.object().keys({
    location: Joi.string().valid(...adLocations)
  })
};

module.exports = {
  getPublicNews,
  createContact,
  getPublicAds
};
