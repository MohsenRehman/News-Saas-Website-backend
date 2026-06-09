const activityLogService = require('../services/activityLog.service');

/**
 * Handle listing activity logs request
 */
const getActivityLogs = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { userId, action, module: queryModule, startDate, endDate, page, limit } = req.query;

    const filters = {};
    if (userId) filters.userId = userId;
    if (action) filters.action = action;
    if (queryModule) filters.module = queryModule;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const data = await activityLogService.getActivityLogs(
      clientId,
      filters,
      {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20
      }
    );

    return res.success(data, 'Activity logs retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActivityLogs
};
