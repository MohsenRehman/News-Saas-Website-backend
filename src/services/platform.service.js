const mongoose = require('mongoose');
const clientRepository = require('../repositories/client.repository');
const subscriptionRepository = require('../repositories/subscription.repository');
const userRepository = require('../repositories/user.repository');
const categoryService = require('./category.service');
const Client = require('../models/Client');
const Subscription = require('../models/Subscription');
const Analytics = require('../models/Analytics');
const ActivityLog = require('../models/ActivityLog');
const UsageStats = require('../models/UsageStats');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

/**
 * Resiliently write activity logs without blocking request response on log failure
 * @param {Object} logData - Activity log fields
 */
const logActivityResilient = async (logData) => {
  try {
    await ActivityLog.create(logData);
  } catch (err) {
    logger.error(`[ActivityLog Error] Resilient logger failed to write: ${err.message}`, err);
  }
};

/**
 * Create Client website, Subscription, and Super Admin in an ACID transaction
 * @param {Object} data - Schema input data
 * @param {String} ipAddress
 * @param {String} platformOwnerId
 * @returns {Promise<Client>}
 */
const createWebsite = async (data, ipAddress, platformOwnerId) => {
  // 1. Enforce global admin email uniqueness scope rule
  const existingUser = await userRepository.findByEmail(data.adminEmail);
  if (existingUser) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is already registered by a user globally.');
  }

  // 2. Start session and execute database writes inside transaction block
  const session = await mongoose.startSession();
  session.startTransaction();

  let client;
  try {
    // A. Create Client
    client = await clientRepository.create({
      name: data.name,
      subdomain: data.subdomain,
      customDomain: data.customDomain || null,
      status: 'active'
    }, session);

    // B. Calculate Subscription dates
    const startDate = new Date();
    let endDate = null;
    if (data.billingPeriod === 'monthly') {
      endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else if (data.billingPeriod === 'yearly') {
      endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
    } // 'lifetime' will remain null (no expiry)

    await subscriptionRepository.create({
      clientId: client._id,
      plan: data.plan,
      billingPeriod: data.billingPeriod,
      status: 'active',
      startDate,
      endDate
    }, session);

    // C. Create Super Admin User for tenant
    await userRepository.createUser({
      clientId: client._id,
      name: data.adminName,
      email: data.adminEmail,
      password: data.adminPassword, // hashed pre-save
      role: 'super_admin',
      status: 'active'
    }, session);

    // D. Seed default categories for this tenant client
    await categoryService.seedDefaultCategories(client._id, session);

    // E. Create WebsiteSettings with the uploaded logo if present
    let logoMediaId = null;
    if (data.logo) {
      const Media = require('../models/Media');
      const media = await Media.create([{
        clientId: client._id,
        name: 'Website Logo',
        url: data.logo,
        publicId: `logo_${Date.now()}`,
        size: 1000,
        type: 'image',
        resourceType: 'image'
      }], { session });
      logoMediaId = media[0]._id;
    }

    const WebsiteSettings = require('../models/WebsiteSettings');
    await WebsiteSettings.create([{
      clientId: client._id,
      siteName: client.name,
      logo: logoMediaId,
      contactEmail: data.adminEmail,
      socialLinks: {}
    }], { session });

    // F. Initialize tenant Usage Statistics document
    await UsageStats.create([{
      clientId: client._id,
      adminCount: 0,
      newsCount: 0,
      storageUsed: 0,
      aiRequests: 0,
      apiRequests: 0,
      emailSent: 0
    }], { session });

    // Commit core database writes
    await session.commitTransaction();
  } catch (error) {
    // Abort transaction in case of any failures
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  // 3. Resilient Activity logging (triggers after transaction successfully commits)
  logActivityResilient({
    clientId: null, // Global platform event
    userId: platformOwnerId,
    action: 'client_create',
    module: 'platform',
    ipAddress,
    timestamp: new Date()
  });

  return client;
};

/**
 * Get paginated list of clients
 */
const getClients = async (filters, options) => {
  return clientRepository.findAll(filters, options);
};

/**
 * Update Client details (names / custom domains)
 */
const updateClient = async (clientId, updateData) => {
  const client = await clientRepository.findById(clientId);
  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client not found.');
  }

  const User = require('../models/User');

  // If updateData contains adminName or adminEmail, update the super_admin User
  if (updateData.adminName || updateData.adminEmail) {
    const adminUser = await User.findOne({ clientId, role: 'super_admin', isDeleted: { $ne: true } });
    if (adminUser) {
      if (updateData.adminName) adminUser.name = updateData.adminName;
      if (updateData.adminEmail) {
        const emailLower = updateData.adminEmail.toLowerCase();
        // Check if the email is already registered by another user globally
        const existingUser = await User.findOne({
          email: emailLower,
          _id: { $ne: adminUser._id }
        });
        if (existingUser) {
          throw new AppError(httpStatus.BAD_REQUEST, 'Email is already registered by another user globally.');
        }
        adminUser.email = emailLower;
      }
      await adminUser.save();
    }
  }

  // Update client fields
  const clientUpdateData = {};
  if (updateData.name !== undefined) clientUpdateData.name = updateData.name;
  if (updateData.subdomain !== undefined) clientUpdateData.subdomain = updateData.subdomain;
  if (updateData.customDomain !== undefined) clientUpdateData.customDomain = updateData.customDomain;

  const updatedClient = await clientRepository.update(clientId, clientUpdateData);

  // Update logo in WebsiteSettings if provided
  if (updateData.logo !== undefined) {
    const WebsiteSettings = require('../models/WebsiteSettings');
    const Media = require('../models/Media');
    let settings = await WebsiteSettings.findOne({ clientId, isDeleted: { $ne: true } });
    if (!settings) {
      settings = new WebsiteSettings({ clientId, siteName: updatedClient.name });
    }

    if (updateData.name) {
      settings.siteName = updateData.name;
    }

    if (!updateData.logo) {
      settings.logo = null;
    } else {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(updateData.logo)) {
        settings.logo = updateData.logo;
      } else {
        // Search Media by URL
        let media = await Media.findOne({ clientId, url: updateData.logo, isDeleted: { $ne: true } });
        if (!media) {
          media = await Media.create({
            clientId,
            name: 'Website Logo',
            url: updateData.logo,
            publicId: `logo_${Date.now()}`,
            size: 1000,
            type: 'image',
            resourceType: 'image'
          });
        }
        settings.logo = media._id;
      }
    }
    await settings.save();
  } else if (updateData.name) {
    // Sync name changes to website settings siteName
    const WebsiteSettings = require('../models/WebsiteSettings');
    let settings = await WebsiteSettings.findOne({ clientId, isDeleted: { $ne: true } });
    if (settings) {
      settings.siteName = updateData.name;
      await settings.save();
    }
  }

  // Return the updated client with the admin email/name and logo attached for the UI
  const adminUser = await User.findOne({ clientId, role: 'super_admin', isDeleted: { $ne: true } }).select('email name').lean();
  const WebsiteSettings = require('../models/WebsiteSettings');
  const settings = await WebsiteSettings.findOne({ clientId, isDeleted: { $ne: true } }).populate('logo', 'url').lean();
  let logoUrl = '';
  if (settings && settings.logo) {
    logoUrl = typeof settings.logo === 'object' ? settings.logo.url : settings.logo;
  }

  const result = updatedClient.toObject();
  result.adminEmail = adminUser ? adminUser.email : '';
  result.adminName = adminUser ? adminUser.name : '';
  result.logo = logoUrl;
  return result;
};

/**
 * Update client active status
 */
const updateClientStatus = async (clientId, status, ipAddress, platformOwnerId) => {
  const client = await clientRepository.findById(clientId);
  if (!client || client.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client not found.');
  }

  const updatedClient = await clientRepository.update(clientId, { status });

  logActivityResilient({
    clientId: null,
    userId: platformOwnerId,
    action: `client_${status}`,
    module: 'platform',
    ipAddress,
    timestamp: new Date()
  });

  return updatedClient;
};

/**
 * Delete a client (cascades soft-deletes to all tenant models under transaction)
 */
const deleteClient = async (clientId, ipAddress, platformOwnerId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let client;
  try {
    client = await clientRepository.softDeleteCascade(clientId, session);
    if (!client) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client not found.');
    }
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  logActivityResilient({
    clientId: null,
    userId: platformOwnerId,
    action: 'client_delete',
    module: 'platform',
    ipAddress,
    timestamp: new Date()
  });

  return client;
};

/**
 * Aggregate platform statistics (Clients, Active, MRR, Traffic Hits)
 */
const getDashboardStats = async () => {
  const totalClients = await Client.countDocuments({ isDeleted: { $ne: true } });
  const activeClients = await Client.countDocuments({ status: 'active', isDeleted: { $ne: true } });

  // Calculate Amortized Monthly Recurring Revenue (MRR)
  const activeSubscriptions = await Subscription.find({
    status: 'active',
    isDeleted: { $ne: true }
  });

  let totalMRR = 0;
  activeSubscriptions.forEach((sub) => {
    let monthlyValue = 0;
    if (sub.billingPeriod === 'monthly') {
      if (sub.plan === 'basic') monthlyValue = 29;
      else if (sub.plan === 'professional') monthlyValue = 99;
      else if (sub.plan === 'enterprise') monthlyValue = 299;
    } else if (sub.billingPeriod === 'yearly') {
      if (sub.plan === 'basic') monthlyValue = 299 / 12;
      else if (sub.plan === 'professional') monthlyValue = 999 / 12;
      else if (sub.plan === 'enterprise') monthlyValue = 2999 / 12;
    } else if (sub.billingPeriod === 'lifetime') {
      // Amortize lifetime subscription payment over 36 months
      if (sub.plan === 'basic') monthlyValue = 999 / 36;
      else if (sub.plan === 'professional') monthlyValue = 2999 / 36;
      else if (sub.plan === 'enterprise') monthlyValue = 9999 / 36;
    }
    totalMRR += monthlyValue;
  });

  // Calculate total analytics logging counts
  const trafficHits = await Analytics.countDocuments({ isDeleted: { $ne: true } });

  return {
    totalClients,
    activeClients,
    revenueMRR: Math.round(totalMRR * 100) / 100, // round to 2 decimals
    trafficHits
  };
};

module.exports = {
  createWebsite,
  getClients,
  updateClient,
  updateClientStatus,
  deleteClient,
  getDashboardStats
};
