const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

/**
 * Validation schema for creating a category
 */
const createCategory = {
  body: Joi.object().keys({
    name: Joi.string().required().trim().max(100),
    description: Joi.string().allow('', null).default(''),
    parentCategory: Joi.string().pattern(objectIdPattern).allow(null).messages({
      'string.pattern.base': 'parentCategory must be a valid MongoDB ObjectId.'
    })
  })
};

/**
 * Validation schema for updating a category
 */
const updateCategory = {
  params: Joi.object().keys({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'id parameter must be a valid MongoDB ObjectId.'
    })
  }),
  body: Joi.object().keys({
    name: Joi.string().trim().max(100),
    description: Joi.string().allow('', null),
    parentCategory: Joi.string().pattern(objectIdPattern).allow(null).messages({
      'string.pattern.base': 'parentCategory must be a valid MongoDB ObjectId.'
    })
  }).min(1)
};

/**
 * Validation schema for querying/listing categories
 */
const getCategories = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(100),
    search: Joi.string().allow('', null),
    parentCategory: Joi.string().pattern(objectIdPattern).allow(null, '')
  })
};

/**
 * Validation schema for single category retrieval or deletion
 */
const checkIdParam = {
  params: Joi.object().keys({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'id parameter must be a valid MongoDB ObjectId.'
    })
  })
};

module.exports = {
  createCategory,
  updateCategory,
  getCategories,
  checkIdParam
};
