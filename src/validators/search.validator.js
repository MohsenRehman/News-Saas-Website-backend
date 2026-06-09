const Joi = require('joi');

/**
 * Validation schema for global search
 */
const globalSearch = {
  query: Joi.object().keys({
    q: Joi.string().required().trim().min(1).messages({
      'string.empty': 'Search query parameter (q) cannot be empty.'
    }),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    category: Joi.string().trim().lowercase(),
    tag: Joi.string().trim(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string().valid('relevance', 'date').default('date')
  })
};

/**
 * Validation schema for autocomplete search suggestions
 */
const searchSuggestions = {
  query: Joi.object().keys({
    q: Joi.string().required().trim().min(1).messages({
      'string.empty': 'Suggestions query parameter (q) cannot be empty.'
    })
  })
};

module.exports = {
  globalSearch,
  searchSuggestions
};
