const Category = require('../models/Category');

/**
 * Create a new Category
 * @param {Object} categoryData - Category fields
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Category>}
 */
const create = async (categoryData, session) => {
  const category = new Category(categoryData);
  return category.save({ session });
};

/**
 * Find Category by ID
 * @param {String} id
 * @returns {Promise<Category|null>}
 */
const findById = async (id) => {
  return Category.findById(id).populate('parentCategory', 'name slug').exec();
};

/**
 * Find all categories for a tenant client
 * @param {String} clientId
 * @param {Object} filters
 * @param {Object} options - Pagination options (page, limit)
 * @returns {Promise<Object>} Results and counts
 */
const findAll = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 100 } = options;
  const skip = (page - 1) * limit;

  // Enforce client isolation and filter out soft deleted items
  const queryFilters = {
    clientId,
    isDeleted: { $ne: true },
    ...filters
  };

  const total = await Category.countDocuments(queryFilters);
  const results = await Category.find(queryFilters)
    .populate('parentCategory', 'name slug')
    .skip(skip)
    .limit(limit)
    .sort({ name: 1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Update Category details
 * @param {String} id
 * @param {Object} updateData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Category|null>}
 */
const update = async (id, updateData, session) => {
  return Category.findByIdAndUpdate(id, updateData, {
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
