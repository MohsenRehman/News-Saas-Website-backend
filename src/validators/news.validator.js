const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * Validation schema for creating a news article
 */
const createNews = {
  body: Joi.object().keys({
    title: Joi.string().required().trim(),
    slug: Joi.string().trim().lowercase().allow('', null),
    shortDescription: Joi.string().required().trim(),
    content: Joi.string().required(),
    featuredImage: Joi.string().allow(null, ''),
    galleryImages: Joi.array()
      .items(Joi.string().allow('', null))
      .default([]),
    videoUrl: Joi.string().uri().allow('', null),
    tags: Joi.array().items(Joi.string().trim()).default([]),
    category: Joi.string()
      .required()
      .pattern(objectIdPattern)
      .messages({
        'string.pattern.base': 'category must be a valid MongoDB ObjectId.'
      }),
    status: Joi.string()
      .valid('draft', 'published', 'scheduled', 'archived')
      .default('draft'),
    labels: Joi.array()
      .items(Joi.string().valid('breaking', 'featured', 'trending', 'top_story'))
      .default([]),
    publishDate: Joi.date().allow(null)
  })
};

/**
 * Validation schema for updating a news article
 */
const updateNews = {
  body: Joi.object().keys({
    title: Joi.string().trim(),
    slug: Joi.string().trim().lowercase().allow('', null),
    shortDescription: Joi.string().trim(),
    content: Joi.string(),
    featuredImage: Joi.string().allow(null, ''),
    galleryImages: Joi.array().items(Joi.string().allow('', null)),
    videoUrl: Joi.string().uri().allow('', null),
    tags: Joi.array().items(Joi.string().trim()),
    category: Joi.string().pattern(objectIdPattern),
    status: Joi.string().valid('draft', 'published', 'scheduled', 'archived'),
    labels: Joi.array().items(Joi.string().valid('breaking', 'featured', 'trending', 'top_story')),
    publishDate: Joi.date().allow(null)
  }).min(1)
};

/**
 * Validation schema for scheduling a news article
 */
const scheduleNews = {
  body: Joi.object().keys({
    publishDate: Joi.date()
      .required()
      .greater('now')
      .messages({
        'date.greater': 'Publish date must be scheduled in the future.'
      })
  })
};

module.exports = {
  createNews,
  updateNews,
  scheduleNews
};
