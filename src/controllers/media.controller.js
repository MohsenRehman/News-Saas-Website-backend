const mediaService = require('../services/media.service');
const httpStatus = require('../constants/httpStatus');
const AppError = require('../utils/appError');

/**
 * Handle Media File upload request
 */
const uploadFile = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    if (!req.file) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Please upload a file (multipart/form-data field name: file).');
    }

    const media = await mediaService.uploadFile(clientId, req.file, ipAddress, operatorId);
    return res.success(media, 'Media file uploaded successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * List paginated media files for tenant client
 */
const getMediaList = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { page, limit, type, search } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (search) filters.search = search;

    const data = await mediaService.getMediaList(clientId, filters, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });

    return res.success(data, 'Media files list retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get single media file details
 */
const getMediaById = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const media = await mediaService.getMediaById(clientId, req.params.id);
    return res.success(media, 'Media details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Rename a media record
 */
const renameMedia = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const { name } = req.body;

    const media = await mediaService.renameMedia(clientId, req.params.id, name, ipAddress, operatorId);
    return res.success(media, 'Media renamed successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete a media file
 */
const deleteMedia = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    await mediaService.deleteMedia(clientId, req.params.id, ipAddress, operatorId);
    return res.success(null, 'Media deleted successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFile,
  getMediaList,
  getMediaById,
  renameMedia,
  deleteMedia
};
