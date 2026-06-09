const Analytics = require('../models/Analytics');

/**
 * Register a new Analytics pageview hit
 * @param {Object} pageviewData - Hit details
 * @returns {Promise<Analytics>}
 */
const create = async (pageviewData) => {
  const hit = new Analytics(pageviewData);
  return hit.save();
};

/**
 * Get summary stats (total pageviews and unique visitors) for a timeframe
 * @param {String} clientId
 * @param {Date} [startDate]
 * @returns {Promise<Object>}
 */
const getSummaryStats = async (clientId, startDate) => {
  const match = { clientId, isDeleted: { $ne: true } };
  if (startDate) {
    match.timestamp = { $gte: startDate };
  }

  const stats = await Analytics.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalPageviews: { $sum: 1 },
        visitorIds: { $addToSet: '$visitorId' }
      }
    },
    {
      $project: {
        _id: 0,
        totalPageviews: 1,
        uniqueVisitors: { $size: '$visitorIds' }
      }
    }
  ]);

  return stats[0] || { totalPageviews: 0, uniqueVisitors: 0 };
};

/**
 * Get pageview count grouped by device
 * @param {String} clientId
 * @param {Date} [startDate]
 * @returns {Promise<Array>}
 */
const getDeviceBreakdown = async (clientId, startDate) => {
  const match = { clientId, isDeleted: { $ne: true } };
  if (startDate) {
    match.timestamp = { $gte: startDate };
  }

  return Analytics.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$device',
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        device: '$_id',
        count: 1
      }
    },
    { $sort: { count: -1 } }
  ]);
};

/**
 * Get pageview count grouped by country
 * @param {String} clientId
 * @param {Date} [startDate]
 * @returns {Promise<Array>}
 */
const getCountryBreakdown = async (clientId, startDate) => {
  const match = { clientId, isDeleted: { $ne: true } };
  if (startDate) {
    match.timestamp = { $gte: startDate };
  }

  return Analytics.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$country',
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        country: '$_id',
        count: 1
      }
    },
    { $sort: { count: -1 } }
  ]);
};

/**
 * Get top viewed articles joined with news collection to get title and slug details
 * @param {String} clientId
 * @param {Date} [startDate]
 * @param {Number} [limit]
 * @returns {Promise<Array>}
 */
const getTopArticles = async (clientId, startDate, limit = 5) => {
  const match = { clientId, newsId: { $ne: null }, isDeleted: { $ne: true } };
  if (startDate) {
    match.timestamp = { $gte: startDate };
  }

  return Analytics.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$newsId',
        views: { $sum: 1 }
      }
    },
    { $sort: { views: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'news',
        localField: '_id',
        foreignField: '_id',
        as: 'article'
      }
    },
    { $unwind: '$article' },
    {
      $project: {
        _id: 0,
        newsId: '$_id',
        views: 1,
        title: '$article.title',
        slug: '$article.slug'
      }
    }
  ]);
};

module.exports = {
  create,
  getSummaryStats,
  getDeviceBreakdown,
  getCountryBreakdown,
  getTopArticles
};
