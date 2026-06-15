const newsService = require('../services/news.service');
const newsRepository = require('../repositories/news.repository');
const httpStatus = require('../constants/httpStatus');
const AppError = require('../utils/appError');

/**
 * Create a new news article for the tenant
 */
const createNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const authorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const news = await newsService.createNews(clientId, authorId, req.body, ipAddress);
    return res.success(news, 'News article created successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * List paginated news articles for the tenant
 */
const getNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { page, limit, status, category, title, search } = req.query;
    const filters = {};

    if (status) filters.status = status;
    if (category) filters.category = category;
    
    const searchVal = title || search;
    if (searchVal) filters.title = { $regex: searchVal, $options: 'i' };

    const data = await newsRepository.findAll(clientId, filters, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });

    return res.success(data, 'News articles list retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a news article by ID
 */
const getNewsById = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const news = await newsRepository.findById(req.params.id);

    if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
      throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
    }

    return res.success(news, 'News article details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing news article
 */
const updateNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;

    const news = await newsService.updateNews(clientId, req.params.id, req.body, ipAddress, operatorId);
    return res.success(news, 'News article updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Publish a news article immediately
 */
const publishNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;

    const news = await newsService.publishNews(clientId, req.params.id, ipAddress, operatorId);
    return res.success(news, 'News article successfully published.');
  } catch (error) {
    next(error);
  }
};

/**
 * Schedule a news article publication
 */
const scheduleNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const { publishDate } = req.body;

    const news = await newsService.scheduleNews(clientId, req.params.id, publishDate, ipAddress, operatorId);
    return res.success(news, 'News article successfully scheduled.');
  } catch (error) {
    next(error);
  }
};

/**
 * Duplicate a news article as a new draft
 */
const duplicateNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const authorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const duplicate = await newsService.duplicateNews(clientId, req.params.id, authorId, ipAddress);
    return res.success(duplicate, 'News article duplicated successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete a news article
 */
const deleteNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;

    await newsService.deleteNews(clientId, req.params.id, ipAddress, operatorId);
    return res.success(null, 'News article successfully deleted.');
  } catch (error) {
    next(error);
  }
};

/**
 * Preview an article regardless of status checks
 */
const previewNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const news = await newsService.previewNews(clientId, req.params.id);
    return res.success(news, 'News preview details retrieved.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createNews,
  getNews,
  getNewsById,
  updateNews,
  publishNews,
  scheduleNews,
  duplicateNews,
  deleteNews,
  previewNews
};
