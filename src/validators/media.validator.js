const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * Validation schema for listing media files
 */
const getMedia = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    type: Joi.string().valid('image', 'video', 'document'),
    search: Joi.string().allow('', null)
  })
};

/**
 * Validation schema for renaming a media file record
 */
const renameMedia = {
  params: Joi.object().keys({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'id parameter must be a valid MongoDB ObjectId.'
    })
  }),
  body: Joi.object().keys({
    name: Joi.string().required().trim().max(100)
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
  getMedia,
  renameMedia,
  checkIdParam
};
