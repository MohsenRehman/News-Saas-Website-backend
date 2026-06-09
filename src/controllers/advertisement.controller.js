const advertisementService = require('../services/advertisement.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Create a new advertisement campaign
 */
const createAd = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const ad = await advertisementService.createAd(clientId, req.body, ipAddress, operatorId);
    return res.success(ad, 'Advertisement campaign created successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * List paginated advertisement campaigns
 */
const getAds = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { page, limit, location, status, search } = req.query;

    const filters = {};
    if (location) filters.location = location;
    if (status) filters.status = status;
    if (search) filters.search = search;

    const data = await advertisementService.getAds(clientId, filters, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });

    return res.success(data, 'Advertisement campaigns retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve advertisement campaign details by ID
 */
const getAdById = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ad = await advertisementService.getAdById(clientId, req.params.id);
    return res.success(ad, 'Advertisement campaign details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing advertisement campaign details
 */
const updateAd = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const ad = await advertisementService.updateAd(clientId, req.params.id, req.body, ipAddress, operatorId);
    return res.success(ad, 'Advertisement campaign updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete an advertisement campaign
 */
const deleteAd = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    await advertisementService.deleteAd(clientId, req.params.id, ipAddress, operatorId);
    return res.success(null, 'Advertisement campaign deleted successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Track/Record an advertisement impression (Public endpoint)
 */
const trackImpression = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ad = await advertisementService.trackImpression(clientId, req.params.id);
    return res.success({ impressions: ad.impressions }, 'Advertisement impression tracked successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Track/Record an advertisement click (Public endpoint)
 */
const trackClick = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const ad = await advertisementService.trackClick(clientId, req.params.id);
    return res.success({ clicks: ad.clicks }, 'Advertisement click tracked successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAd,
  getAds,
  getAdById,
  updateAd,
  deleteAd,
  trackImpression,
  trackClick
};
