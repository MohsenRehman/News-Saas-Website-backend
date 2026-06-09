const activityLogRepository = require('../repositories/activityLog.repository');

/**
 * Get paginated and filtered activity logs
 * @param {String} clientId 
 * @param {Object} filters 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
const getActivityLogs = async (clientId, filters, options) => {
  return activityLogRepository.findAll(clientId, filters, options);
};

module.exports = {
  getActivityLogs
};
