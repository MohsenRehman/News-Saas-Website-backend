const Media = require('../models/Media');

/**
 * Register a new Media upload
 * @param {Object} mediaData - Media fields
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Media>}
 */
const create = async (mediaData, session) => {
  const media = new Media(mediaData);
  return media.save({ session });
};

/**
 * Find Media by ID
 * @param {String} id
 * @returns {Promise<Media|null>}
 */
const findById = async (id) => {
  return Media.findById(id).populate('uploadedBy', 'name email').exec();
};

/**
 * Get paginated list of media files for a tenant client
 * @param {String} clientId
 * @param {Object} filters
 * @param {Object} options - Pagination options (page, limit)
 * @returns {Promise<Object>} Results and counts
 */
const findAll = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  // Enforce client isolation and filter out soft deleted items
  const queryFilters = {
    clientId,
    isDeleted: { $ne: true },
    ...filters
  };

  const total = await Media.countDocuments(queryFilters);
  const results = await Media.find(queryFilters)
    .populate('uploadedBy', 'name email')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Update Media file record details (e.g. rename)
 * @param {String} id
 * @param {Object} updateData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Media|null>}
 */
const update = async (id, updateData, session) => {
  return Media.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
    session
  });
};

module.exports = {
  create,
  findById,
  findAll,
  update
};
