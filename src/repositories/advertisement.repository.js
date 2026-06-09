const Advertisement = require('../models/Advertisement');

/**
 * Register a new Advertisement campaign
 * @param {Object} adData - Campaign details
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Advertisement>}
 */
const create = async (adData, session) => {
  const ad = new Advertisement(adData);
  return ad.save({ session });
};

/**
 * Find Advertisement by ID
 * @param {String} id
 * @returns {Promise<Advertisement|null>}
 */
const findById = async (id) => {
  return Advertisement.findById(id).exec();
};

/**
 * Get paginated list of advertisements for a tenant client
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

  const total = await Advertisement.countDocuments(queryFilters);
  const results = await Advertisement.find(queryFilters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Update Advertisement details
 * @param {String} id
 * @param {Object} updateData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Advertisement|null>}
 */
const update = async (id, updateData, session) => {
  return Advertisement.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
    session
  });
};

/**
 * Atomically increment advertisement impressions count
 * @param {String} id
 * @returns {Promise<Advertisement|null>}
 */
const incrementImpressions = async (id) => {
  return Advertisement.findByIdAndUpdate(
    id,
    { $inc: { impressions: 1 } },
    { new: true, runValidators: true }
  );
};

/**
 * Atomically increment advertisement clicks count
 * @param {String} id
 * @returns {Promise<Advertisement|null>}
 */
const incrementClicks = async (id) => {
  return Advertisement.findByIdAndUpdate(
    id,
    { $inc: { clicks: 1 } },
    { new: true, runValidators: true }
  );
};

module.exports = {
  create,
  findById,
  findAll,
  update,
  incrementImpressions,
  incrementClicks
};
