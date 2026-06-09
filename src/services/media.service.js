const cloudinary = require('cloudinary').v2;
const config = require('../config/config');
const mediaRepository = require('../repositories/media.repository');
const Media = require('../models/Media');
const UsageStats = require('../models/UsageStats');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

// Configure Cloudinary SDK
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret
});

/**
 * Checks if the API keys are placeholders to activate developer Mock Mode
 */
const isMockMode = () => {
  return !config.cloudinary.apiKey || config.cloudinary.apiKey.startsWith('placeholder');
};

/**
 * Resilient activity logger
 */
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
    logger.error(`[ActivityLog Error] Media activity log write failed: ${err.message}`, err);
  }
};

/**
 * Update tenant storage usage statistics
 */
const updateStorageUsage = async (clientId, sizeBytes) => {
  if (!clientId) return;
  try {
    await UsageStats.updateOne(
      { clientId },
      { $inc: { storageUsed: sizeBytes } },
      { upsert: true }
    );
  } catch (err) {
    logger.error(`[UsageStats Error] Failed to update storage stats: ${err.message}`, err);
  }
};

/**
 * Upload a media file (Image or Video)
 */
const uploadFile = async (clientId, file, ipAddress, operatorId) => {
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No file provided for upload.');
  }

  // 1. Determine Type & Validation Rules
  let type = '';
  let resourceType = '';
  const mime = file.mimetype;
  const size = file.size;

  if (mime.startsWith('image/')) {
    const allowedImageMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif'
    ];
    if (!allowedImageMimes.includes(mime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Unsupported image format. Allowed: jpeg, jpg, png, webp, gif, heic, heif.'
      );
    }
    if (size > 10 * 1024 * 1024) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Image size exceeds maximum limit of 10MB.');
    }
    type = 'image';
    resourceType = 'image';
  } else if (mime.startsWith('video/')) {
    const allowedVideoMimes = [
      'video/mp4',
      'video/webm',
      'video/quicktime', // .mov
      'video/x-msvideo', // .avi
      'video/x-ms-wmv',  // .wmv
      'video/avi',
      'video/msvideo'
    ];
    if (!allowedVideoMimes.includes(mime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Unsupported video format. Allowed: mp4, webm, mov, avi, wmv.'
      );
    }
    if (size > 50 * 1024 * 1024) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Video size exceeds maximum limit of 50MB.');
    }
    type = 'video';
    resourceType = 'video';
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'Unsupported file type. Only images and videos are supported.');
  }

  let finalUrl = '';
  let publicId = '';
  let format = file.originalname.split('.').pop() || '';

  // 2. Upload Execution
  if (isMockMode()) {
    logger.info(`[Media Mock Mode] Uploading file: "${file.originalname}" (Size: ${size} bytes, Type: ${type})`);
    finalUrl = type === 'image'
      ? 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop'
      : 'https://www.w3schools.com/html/mov_bbb.mp4';
    publicId = `mock_public_id_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  } else {
    try {
      // Cloudinary stream upload
      const uploadPromise = () => new Promise((resolve, reject) => {
        const uploadOptions = {
          folder: `tenant_${clientId}/media`,
          resource_type: resourceType
        };
        if (resourceType === 'video') {
          uploadOptions.format = 'mp4'; // Forces transcoding to web-compatible MP4 on Cloudinary
        }
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.buffer);
      });

      const result = await uploadPromise();
      finalUrl = result.secure_url;
      publicId = result.public_id;
      if (result.format) format = result.format;
    } catch (err) {
      logger.error(`[Cloudinary Upload Error] ${err.message}`, err);
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, `Cloudinary upload failed: ${err.message}`);
    }
  }

  // 3. Save to database
  const mediaPayload = {
    clientId,
    name: file.originalname,
    url: finalUrl,
    publicId,
    format,
    size,
    type,
    mimeType: mime,
    resourceType,
    uploadedBy: operatorId
  };

  const media = await mediaRepository.create(mediaPayload);

  // 4. Update activity logs (storage stats are atomically incremented by checkPlanLimit middleware)
  logActivityResilient(clientId, operatorId, 'media_upload', 'media', ipAddress);

  return media;
};

/**
 * Get paginated list of media files
 */
const getMediaList = async (clientId, filters = {}, options = {}) => {
  const queryFilters = {};

  if (filters.search) {
    queryFilters.name = { $regex: filters.search, $options: 'i' };
  }

  if (filters.type) {
    queryFilters.type = filters.type;
  }

  return mediaRepository.findAll(clientId, queryFilters, options);
};

/**
 * Get media details by ID
 */
const getMediaById = async (clientId, id) => {
  const media = await mediaRepository.findById(id);
  if (!media || media.isDeleted || media.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Media file not found.');
  }
  return media;
};

/**
 * Rename a media file record
 */
const renameMedia = async (clientId, id, newName, ipAddress, operatorId) => {
  const media = await Media.findById(id);
  if (!media || media.isDeleted || media.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Media file not found.');
  }

  media.name = newName;
  await media.save();

  logActivityResilient(clientId, operatorId, 'media_update', 'media', ipAddress);

  return media;
};

/**
 * Delete a media file record (soft delete from DB & hard delete from Cloudinary)
 */
const deleteMedia = async (clientId, id, ipAddress, operatorId) => {
  const media = await Media.findById(id);
  if (!media || media.isDeleted || media.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Media file not found.');
  }

  // 1. If in real Cloudinary mode, delete asset on cloud
  if (!isMockMode() && media.publicId && !media.publicId.startsWith('mock_')) {
    try {
      await cloudinary.uploader.destroy(media.publicId, { resource_type: media.resourceType });
    } catch (err) {
      logger.error(`[Cloudinary Delete Error] Failed to destroy asset: ${err.message}`, err);
      // We log but continue, ensuring DB consistency even on remote network timeout
    }
  }

  // 2. Soft-delete database entry
  await media.softDelete();

  // 3. Decrement usage stats & log auditing
  await updateStorageUsage(clientId, -media.size);
  logActivityResilient(clientId, operatorId, 'media_delete', 'media', ipAddress);

  return true;
};

module.exports = {
  uploadFile,
  getMediaList,
  getMediaById,
  renameMedia,
  deleteMedia
};
