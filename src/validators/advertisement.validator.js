const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const adLocations = ['header', 'homepage_banner', 'sidebar', 'article_ads', 'footer'];
const adStatuses = ['active', 'inactive', 'scheduled'];

/**
 * Validation schema for creating an advertisement
 */
const createAd = {
  body: Joi.object().keys({
    title: Joi.string().required().trim().max(150),
    location: Joi.string().valid(...adLocations).required(),
    imageUrl: Joi.string().uri().required(),
    targetUrl: Joi.string().uri().required(),
    status: Joi.string().valid(...adStatuses).default('active'),
    startDate: Joi.date().default(Date.now),
    endDate: Joi.date().greater(Joi.ref('startDate')).allow(null).messages({
      'date.greater': 'End date must be scheduled after start date.'
    })
  })
};

/**
 * Validation schema for updating an advertisement
 */
const updateAd = {
  params: Joi.object().keys({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'id parameter must be a valid MongoDB ObjectId.'
    })
  }),
  body: Joi.object().keys({
    title: Joi.string().trim().max(150),
    location: Joi.string().valid(...adLocations),
    imageUrl: Joi.string().uri(),
    targetUrl: Joi.string().uri(),
    status: Joi.string().valid(...adStatuses),
    startDate: Joi.date(),
    endDate: Joi.date().greater(Joi.ref('startDate')).allow(null).messages({
      'date.greater': 'End date must be scheduled after start date.'
    })
  }).min(1)
};

/**
 * Validation schema for querying/listing advertisements
 */
const getAds = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    location: Joi.string().valid(...adLocations),
    status: Joi.string().valid(...adStatuses),
    search: Joi.string().allow('', null)
  })
};

/**
 * Validation schema for checking ID parameter
 */
const checkIdParam = {
  params: Joi.object().keys({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'id parameter must be a valid MongoDB ObjectId.'
    })
  })
};

module.exports = {
  createAd,
  updateAd,
  getAds,
  checkIdParam
};
