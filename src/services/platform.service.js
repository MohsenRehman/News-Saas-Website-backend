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

    // E. Initialize tenant Usage Statistics document
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
  if (!client || client.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client not found.');
  }
  return clientRepository.update(clientId, updateData);
};

/**
 * Update client active status
 */
const updateClientStatus = async (clientId, status, ipAddress, platformOwnerId) => {
  const client = await clientRepository.findById(clientId);
  if (!client || client.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Client not found.');
  }

  client.status = status;
  await client.save();

  logActivityResilient({
    clientId: null,
    userId: platformOwnerId,
    action: `client_${status}`,
    module: 'platform',
    ipAddress,
    timestamp: new Date()
  });

  return client;
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
