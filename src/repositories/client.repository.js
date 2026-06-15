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
  const client = await Client.findById(id);
  if (!client) return null;
  const admin = await User.findOne({
    clientId: client._id,
    role: 'super_admin',
    isDeleted: { $ne: true }
  }).select('email name').lean();

  const settings = await WebsiteSettings.findOne({ clientId: client._id, isDeleted: { $ne: true } }).populate('logo', 'url').lean();

  const plainClient = client.toObject();
  plainClient.adminEmail = admin ? admin.email : '';
  plainClient.adminName = admin ? admin.name : '';
  
  let logoUrl = '';
  if (settings && settings.logo) {
    logoUrl = typeof settings.logo === 'object' ? settings.logo.url : settings.logo;
  }
  plainClient.logo = logoUrl;
  
  return plainClient;
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

  // Fetch the super_admin user for each client in the page results
  const clientIds = results.map(client => client._id);
  const admins = await User.find({
    clientId: { $in: clientIds },
    role: 'super_admin',
    isDeleted: { $ne: true }
  }).select('email name clientId').lean();

  const settingsList = await WebsiteSettings.find({
    clientId: { $in: clientIds },
    isDeleted: { $ne: true }
  }).populate('logo', 'url').lean();

  const adminMap = {};
  admins.forEach(admin => {
    if (admin.clientId) {
      adminMap[admin.clientId.toString()] = admin;
    }
  });

  const logoMap = {};
  settingsList.forEach(settings => {
    if (settings.clientId) {
      let logoUrl = '';
      if (settings.logo) {
        logoUrl = typeof settings.logo === 'object' ? settings.logo.url : settings.logo;
      }
      logoMap[settings.clientId.toString()] = logoUrl;
    }
  });

  // Map results to attach admin details dynamically
  const resultsWithAdmin = results.map(client => {
    const plainClient = client.toObject();
    const admin = adminMap[client._id.toString()];
    plainClient.adminEmail = admin ? admin.email : '';
    plainClient.adminName = admin ? admin.name : '';
    plainClient.logo = logoMap[client._id.toString()] || '';
    return plainClient;
  });

  return { results: resultsWithAdmin, total, page, limit };
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
