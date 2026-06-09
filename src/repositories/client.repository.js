const Client = require('../models/Client');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Category = require('../models/Category');
const News = require('../models/News');
const Media = require('../models/Media');
const Advertisement = require('../models/Advertisement');
const WebsiteSettings = require('../models/WebsiteSettings');
const Notification = require('../models/Notification');
const Contact = require('../models/Contact');
const cache = require('../utils/cache');

/**
 * Clear cached domain lookups for a client
 * @param {Object} client 
 */
const clearClientCache = async (client) => {
  if (!client) return;
  const promises = [];
  if (client.subdomain) {
    promises.push(cache.del(`domain:${client.subdomain}.saasnews.com`));
    promises.push(cache.del(`domain:${client.subdomain}.localhost`));
    promises.push(cache.del(`domain:${client.subdomain}.127.0.0.1`));
  }
  if (client.customDomain) {
    promises.push(cache.del(`domain:${client.customDomain}`));
  }
  await Promise.all(promises);
};

/**
 * Create a new Client
 * @param {Object} data - Client fields
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Client>}
 */
const create = async (data, session) => {
  const client = new Client(data);
  return client.save({ session });
};

/**
 * Find client by ID
 * @param {String} id
 * @returns {Promise<Client|null>}
 */
const findById = async (id) => {
  return Client.findById(id);
};

/**
 * Get paginated list of clients
 * @param {Object} filters
 * @param {Object} options - Pagination options (page, limit)
 * @returns {Promise<Object>} Results array and total count
 */
const findAll = async (filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const queryFilters = { isDeleted: { $ne: true }, ...filters };
  const total = await Client.countDocuments(queryFilters);
  const results = await Client.find(queryFilters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Update Client details
 * @param {String} id
 * @param {Object} updateData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Client|null>}
 */
const update = async (id, updateData, session) => {
  const client = await Client.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
    session
  });
  if (client) {
    await clearClientCache(client);
  }
  return client;
};

/**
 * Soft delete client and cascade to all tenant models under transaction
 * @param {String} clientId
 * @param {Object} session - Mongoose transaction session
 * @returns {Promise<Client|null>}
 */
const softDeleteCascade = async (clientId, session) => {
  const deletedAt = new Date();
  
  // 1. Soft delete Client
  const client = await Client.findById(clientId);
  if (!client) return null;

  client.status = 'deleted';
  client.isDeleted = true;
  client.deletedAt = deletedAt;
  await client.save({ session });

  await clearClientCache(client);

  // 2. Cascade soft-delete updates to all tenant models
  const cascadeQuery = { clientId };
  const updatePayload = { isDeleted: true, deletedAt };
  const options = { session };

  await Promise.all([
    Subscription.updateMany(cascadeQuery, updatePayload, options),
    User.updateMany(cascadeQuery, updatePayload, options),
    Category.updateMany(cascadeQuery, updatePayload, options),
    News.updateMany(cascadeQuery, updatePayload, options),
    Media.updateMany(cascadeQuery, updatePayload, options),
    Advertisement.updateMany(cascadeQuery, updatePayload, options),
    WebsiteSettings.updateMany(cascadeQuery, updatePayload, options),
    Notification.updateMany(cascadeQuery, updatePayload, options),
    Contact.updateMany(cascadeQuery, updatePayload, options)
  ]);

  return client;
};

module.exports = {
  create,
  findById,
  findAll,
  update,
  softDeleteCascade
};
