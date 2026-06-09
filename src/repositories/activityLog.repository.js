const ActivityLog = require('../models/ActivityLog');

/**
 * Retrieve paginated activity logs for a tenant client
 * @param {String} clientId 
 * @param {Object} filters 
 * @param {Object} options - Pagination options (page, limit)
 * @returns {Promise<Object>}
 */
const findAll = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const queryFilters = {
    clientId,
    isDeleted: { $ne: true }
  };

  // Apply basic filters
  if (filters.userId) {
    queryFilters.userId = filters.userId;
  }
  if (filters.action) {
    queryFilters.action = filters.action;
  }
  if (filters.module) {
    queryFilters.module = filters.module;
  }

  // Apply date range filters
  if (filters.startDate || filters.endDate) {
    queryFilters.timestamp = {};
    if (filters.startDate) {
      queryFilters.timestamp.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      queryFilters.timestamp.$lte = new Date(filters.endDate);
    }
  }

  const total = await ActivityLog.countDocuments(queryFilters);
  const results = await ActivityLog.find(queryFilters)
    .populate('userId', 'name email role')
    .skip(skip)
    .limit(limit)
    .sort({ timestamp: -1, createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

module.exports = {
  findAll
};
