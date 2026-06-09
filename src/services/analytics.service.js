const analyticsRepository = require('../repositories/analytics.repository');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');

/**
 * Log a public visitor pageview hit
 */
const trackPageview = async (clientId, data) => {
  const pageviewPayload = {
    clientId,
    newsId: data.newsId || null,
    path: data.path,
    referrer: data.referrer || '',
    visitorId: data.visitorId,
    device: data.device || 'desktop',
    country: data.country || 'Unknown',
    timestamp: new Date()
  };

  return analyticsRepository.create(pageviewPayload);
};

/**
 * Retrieve traffic analytics report for tenant dashboard
 */
const getAnalyticsDashboard = async (clientId, timeframe = '7days') => {
  let startDate = null;
  const now = new Date();

  if (timeframe === 'today') {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0); // start of today
  } else if (timeframe === '7days') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeframe === '30days') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } // 'all' leaves startDate = null

  // Run Mongoose aggregation lookups in parallel
  const [summary, devices, countries, articles] = await Promise.all([
    analyticsRepository.getSummaryStats(clientId, startDate),
    analyticsRepository.getDeviceBreakdown(clientId, startDate),
    analyticsRepository.getCountryBreakdown(clientId, startDate),
    analyticsRepository.getTopArticles(clientId, startDate, 5)
  ]);

  return {
    totalPageviews: summary.totalPageviews,
    uniqueVisitors: summary.uniqueVisitors,
    deviceBreakdown: devices,
    countryBreakdown: countries,
    topArticles: articles
  };
};

module.exports = {
  trackPageview,
  getAnalyticsDashboard
};
