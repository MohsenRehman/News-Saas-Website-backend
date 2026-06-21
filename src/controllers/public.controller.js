const publicService = require('../services/public.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Get public branding settings configurations
 */
const getWebsiteSettings = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const clientId = req.clientId;
    const settings = await publicService.getWebsiteSettings(clientId);
    return res.success({
      client: req.client,
      settings
    }, 'Website settings retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get active categories list for navigation bar
 */
const getCategories = async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const clientId = req.clientId;
    const categories = await publicService.getCategories(clientId);
    return res.success(categories, 'Categories retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get paginated published news feed
 */
const getPublishedNews = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { page, limit, category, search, label, tag } = req.query;

    const data = await publicService.getPublishedNews(
      clientId,
      { category, search, label, tag },
      {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 10
      }
    );

    return res.success(data, 'News feed retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get single news article by its unique slug
 */
const getNewsBySlug = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const news = await publicService.getNewsBySlug(clientId, req.params.slug);
    return res.success(news, 'News article details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Submit feedback/contact form message
 */
const createContactSubmission = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const submission = await publicService.createContactSubmission(clientId, req.body);
    return res.success(submission, 'Contact form submitted successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * Get active advertisement campaigns eligible for rendering
 */
const getActiveAds = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { location } = req.query;

    const ads = await publicService.getActiveAds(clientId, location);
    return res.success(ads, 'Active advertisement campaigns retrieved.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWebsiteSettings,
  getCategories,
  getPublishedNews,
  getNewsBySlug,
  createContactSubmission,
  getActiveAds
};
