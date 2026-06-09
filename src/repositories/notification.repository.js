const Notification = require('../models/Notification');

/**
 * Create a new notification
 * @param {Object} notificationData 
 * @returns {Promise<Notification>}
 */
const create = async (notificationData) => {
  const notification = new Notification(notificationData);
  return notification.save();
};

/**
 * Find single notification by ID and clientId
 * @param {String} clientId 
 * @param {String} id 
 * @returns {Promise<Notification|null>}
 */
const findById = async (clientId, id) => {
  return Notification.findOne({ _id: id, clientId, isDeleted: { $ne: true } }).exec();
};

/**
 * Find paginated notifications scoped to a tenant user
 * @param {String} clientId 
 * @param {String} userId 
 * @param {Object} filters 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
const findAll = async (clientId, userId, filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const queryFilters = {
    clientId,
    userId,
    isDeleted: { $ne: true }
  };

  if (filters.isRead !== undefined) {
    queryFilters.isRead = filters.isRead;
  }
  if (filters.type) {
    queryFilters.type = filters.type;
  }

  const total = await Notification.countDocuments(queryFilters);
  const results = await Notification.find(queryFilters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Mark all notifications for a user as read
 * @param {String} clientId 
 * @param {String} userId 
 * @returns {Promise<Object>} Mongoose update result
 */
const markAllRead = async (clientId, userId) => {
  return Notification.updateMany(
    { clientId, userId, isRead: false, isDeleted: { $ne: true } },
    { $set: { isRead: true } }
  ).exec();
};

module.exports = {
  create,
  findById,
  findAll,
  markAllRead
};
