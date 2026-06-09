const Joi = require('joi');

const providers = ['gemini', 'openai', 'openrouter'];

const generateArticle = {
  body: Joi.object().keys({
    title: Joi.string().required().trim(),
    provider: Joi.string().valid(...providers).default('openrouter'),
    instructions: Joi.string().optional().allow(''),
    category: Joi.string().optional().allow('')
  })
};

const generateSummary = {
  body: Joi.object().keys({
    content: Joi.string().required(),
    provider: Joi.string().valid(...providers).default('openrouter'),
    maxLength: Joi.number().optional()
  })
};

const generateHeadlines = {
  body: Joi.object().keys({
    content: Joi.string().required(),
    provider: Joi.string().valid(...providers).default('openrouter')
  })
};

const generateImage = {
  body: Joi.object().keys({
    prompt: Joi.string().required().trim()
  })
};

const workflow = {
  body: Joi.object().keys({
    title: Joi.string().required().trim(),
    provider: Joi.string().valid(...providers).default('openrouter'),
    category: Joi.string().optional().allow(''),
    options: Joi.object().keys({
      tone: Joi.string().optional().allow(''),
      instructions: Joi.string().optional().allow('')
    }).optional()
  })
};

module.exports = {
  generateArticle,
  generateSummary,
  generateHeadlines,
  generateImage,
  workflow
};
