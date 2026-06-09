const Joi = require('joi');

/**
 * Validate posting a comment
 */
const createComment = {
  body: Joi.object().keys({
    newsId: Joi.string().length(24).hex().required().messages({
      'string.length': 'Invalid news article ID structure.'
    }),
    parentId: Joi.string().length(24).hex().optional().allow(null),
    authorName: Joi.string().required().trim().min(2).max(50),
    authorEmail: Joi.string().email().required().trim().lowercase(),
    content: Joi.string().required().trim().min(1).max(1000).messages({
      'string.empty': 'Comment content cannot be empty.'
    })
  })
};

/**
 * Validate fetching comments for a specific article
 */
const getCommentsForArticle = {
  params: Joi.object().keys({
    newsId: Joi.string().length(24).hex().required()
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50)
  })
};

/**
 * Validate comment moderation status update
 */
const moderateComment = {
  params: Joi.object().keys({
    commentId: Joi.string().length(24).hex().required()
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('pending', 'approved', 'flagged', 'rejected').required().messages({
      'any.only': 'Status must be one of: pending, approved, flagged, rejected.'
    })
  })
};

module.exports = {
  createComment,
  getCommentsForArticle,
  moderateComment
};
