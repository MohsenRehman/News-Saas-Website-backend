const advertisementRepository = require('../repositories/advertisement.repository');
const Advertisement = require('../models/Advertisement');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

// Resilient activity logger helper
const logActivityResilient = async (clientId, userId, action, module, ipAddress) => {
  try {
    await ActivityLog.create({
      clientId,
      userId,
      action,
      module,
      ipAddress,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error(`[ActivityLog Error] Advertisement activity log write failed: ${err.message}`, err);
  }
};

/**
 * Register a new advertisement campaign
 */
const createAd = async (clientId, data, ipAddress, operatorId) => {
  const adPayload = {
    clientId,
    title: data.title,
    location: data.location,
    imageUrl: data.imageUrl,
    targetUrl: data.targetUrl,
    status: data.status || 'active',
    startDate: data.startDate || new Date(),
    endDate: data.endDate || null
  };

  const ad = await advertisementRepository.create(adPayload);

  logActivityResilient(clientId, operatorId, 'ad_create', 'advertisement', ipAddress);

  return ad;
};

/**
 * List paginated advertisement campaigns
 */
const getAds = async (clientId, filters = {}, options = {}) => {
  const queryFilters = {};

  if (filters.search) {
    queryFilters.title = { $regex: filters.search, $options: 'i' };
  }

  if (filters.location) {
    queryFilters.location = filters.location;
  }

  if (filters.status) {
    queryFilters.status = filters.status;
  }

  return advertisementRepository.findAll(clientId, queryFilters, options);
};

/**
 * Get details of a single advertisement campaign
 */
const getAdById = async (clientId, id) => {
  const ad = await advertisementRepository.findById(id);
  if (!ad || ad.isDeleted || ad.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Advertisement campaign not found.');
  }
  return ad;
};

/**
 * Update an existing advertisement campaign details
 */
const updateAd = async (clientId, id, updateData, ipAddress, operatorId) => {
  const ad = await Advertisement.findById(id);
  if (!ad || ad.isDeleted || ad.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Advertisement campaign not found.');
  }

  // Cross-field date check if either date is updated
  const newStart = updateData.startDate ? new Date(updateData.startDate) : ad.startDate;
  const newEnd = updateData.endDate ? new Date(updateData.endDate) : ad.endDate;

  if (newEnd && newStart && newEnd <= newStart) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Campaign end date must be scheduled after start date.');
  }

  const updatedAd = await advertisementRepository.update(id, updateData);

  logActivityResilient(clientId, operatorId, 'ad_update', 'advertisement', ipAddress);

  return updatedAd;
};

/**
 * Soft delete an advertisement campaign
 */
const deleteAd = async (clientId, id, ipAddress, operatorId) => {
  const ad = await Advertisement.findById(id);
  if (!ad || ad.isDeleted || ad.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Advertisement campaign not found.');
  }

  await ad.softDelete();

  logActivityResilient(clientId, operatorId, 'ad_delete', 'advertisement', ipAddress);

  return true;
};

/**
 * Increment advertisement impression count (Public tracker)
 */
const trackImpression = async (clientId, id) => {
  const ad = await Advertisement.findById(id);
  // Verify ownership and soft-delete state prior to updating analytics metrics
  if (!ad || ad.isDeleted || ad.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Advertisement campaign not found.');
  }

  return advertisementRepository.incrementImpressions(id);
};

/**
 * Increment advertisement click count (Public tracker)
 */
const trackClick = async (clientId, id) => {
  const ad = await Advertisement.findById(id);
  // Verify ownership and soft-delete state prior to updating analytics metrics
  if (!ad || ad.isDeleted || ad.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Advertisement campaign not found.');
  }

  return advertisementRepository.incrementClicks(id);
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
