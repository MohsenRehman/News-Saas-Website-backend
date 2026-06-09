const News = require('../models/News');

/**
 * Create a new News article
 * @param {Object} newsData - Article fields
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<News>}
 */
const create = async (newsData, session) => {
  const news = new News(newsData);
  return news.save({ session });
};

/**
 * Find news article by ID, populating relations
 * @param {String} id
 * @returns {Promise<News|null>}
 */
const findById = async (id) => {
  return News.findById(id)
    .populate('category', 'name slug')
    .populate('author', 'name email')
    .populate('featuredImage')
    .populate('galleryImages')
    .exec();
};

/**
 * Get paginated list of news articles for a tenant
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

  const total = await News.countDocuments(queryFilters);
  const results = await News.find(queryFilters)
    .populate('category', 'name slug')
    .populate('author', 'name email')
    .populate('featuredImage', 'url type')
    .skip(skip)
    .limit(limit)
    .sort({ publishDate: -1, createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Update News article details
 * @param {String} id
 * @param {Object} updateData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<News|null>}
 */
const update = async (id, updateData, session) => {
  return News.findByIdAndUpdate(id, updateData, {
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
