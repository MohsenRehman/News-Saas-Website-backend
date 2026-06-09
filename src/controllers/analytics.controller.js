const analyticsService = require('../services/analytics.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Log a public visitor pageview tracking hit
 */
const trackPageview = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const hit = await analyticsService.trackPageview(clientId, req.body);
    return res.success(hit, 'Pageview hit logged successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve traffic analytics report for tenant dashboard
 */
const getDashboard = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { timeframe } = req.query;

    const data = await analyticsService.getAnalyticsDashboard(clientId, timeframe);
    return res.success(data, 'Analytics summary report retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  trackPageview,
  getDashboard
};
