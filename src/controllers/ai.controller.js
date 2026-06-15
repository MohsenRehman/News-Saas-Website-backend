const aiService = require('../services/ai.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Handle Article Generation request
 */
const generateArticle = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { title, provider, instructions, language } = req.body;

    const content = await aiService.generateArticleText(clientId, title, provider, instructions, language);
    return res.success({ content }, 'AI Article generated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Article Summarization request
 */
const generateSummary = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { content, provider } = req.body;

    const summary = await aiService.generateSummaryText(clientId, content, provider);
    return res.success({ summary }, 'AI Summary generated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Headlines Generation request
 */
const generateHeadlines = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { content, provider } = req.body;

    const headlines = await aiService.generateHeadlinesList(clientId, content, provider);
    return res.success({ headlines }, 'AI Headlines generated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Image Generation request
 */
const generateImage = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { prompt } = req.body;

    const imageUrl = await aiService.generateImageArt(clientId, prompt);
    return res.success({ imageUrl }, 'AI Image generated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Orchestrate complete AI Content Generation Workflow
 */
const runWorkflow = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const { title, provider, options } = req.body;
    const instructions = options?.instructions || '';

    const data = await aiService.runAiWorkflow(clientId, title, provider, ipAddress, operatorId, instructions);

    const message = data.warnings.length > 0
      ? 'AI workflow completed with some warnings.'
      : 'AI workflow completed successfully.';

    return res.success(data, message);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateArticle,
  generateSummary,
  generateHeadlines,
  generateImage,
  runWorkflow
};
