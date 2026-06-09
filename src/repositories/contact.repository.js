const Contact = require('../models/Contact');

/**
 * Register a new reader contact form submission
 * @param {Object} contactData - Form fields
 * @returns {Promise<Contact>}
 */
const create = async (contactData) => {
  const contact = new Contact(contactData);
  return contact.save();
};

/**
 * Get paginated list of contact form submissions for a tenant client
 * @param {String} clientId
 * @param {Object} filters
 * @param {Object} options - Pagination options (page, limit)
 * @returns {Promise<Object>} Results and counts
 */
const findAll = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const queryFilters = {
    clientId,
    isDeleted: { $ne: true },
    ...filters
  };

  const total = await Contact.countDocuments(queryFilters);
  const results = await Contact.find(queryFilters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Find contact submission by ID and clientId
 * @param {String} clientId
 * @param {String} id
 * @returns {Promise<Contact|null>}
 */
const findById = async (clientId, id) => {
  return Contact.findOne({ _id: id, clientId, isDeleted: { $ne: true } }).exec();
};

module.exports = {
  create,
  findAll,
  findById
};

