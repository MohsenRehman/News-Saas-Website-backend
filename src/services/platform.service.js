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
const News = require('../models/News');
const Media = require('../models/Media');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');
const { connection: redis, isRedisReady } = require('../config/redis');


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
  const cacheKey = 'platform:dashboard:stats';

  // 1. Try to serve from Redis Cache-Aside
  if (isRedisReady()) {
    try {
      const cachedStats = await redis.get(cacheKey);
      if (cachedStats) {
        return JSON.parse(cachedStats);
      }
    } catch (err) {
      logger.error(`[Redis Stats Cache Read Error] ${err.message}`, err);
    }
  }

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Helper for trend growth string formatting
  const calculateGrowth = (current, previous) => {
    if (previous === 0) {
      return current > 0 ? '+100.0% ↑' : '0.0% —';
    }
    const diff = ((current - previous) / previous) * 100;
    if (diff > 0) {
      return `+${diff.toFixed(1)}% ↑`;
    } else if (diff < 0) {
      return `${diff.toFixed(1)}% ↓`;
    } else {
      return '0.0% —';
    }
  };

  // 2. Fetch all required data points concurrently using Promise.all & .lean()
  const [
    totalClients,
    totalClientsLastMonth,
    activeClients,
    activeClientsLastMonth,
    suspendedClients,
    suspendedClientsLastMonth,
    activeSubscriptions,
    subscriptionsLastMonth,
    totalNews,
    totalNewsThisMonth,
    totalNewsLastMonth,
    totalTraffic,
    trafficThisMonth,
    trafficLastMonth,
    aiUsageAgg,
    aiActivityThisMonth,
    aiActivityLastMonth,
    storageAgg,
    clientsList,
    mediaStorageBreakdown,
    newsBreakdownRaw,
    storageThisMonthAgg,
    storageLastMonthAgg,
    allSubscriptions
  ] = await Promise.all([
    // Clients
    Client.countDocuments({ isDeleted: { $ne: true } }),
    Client.countDocuments({ createdAt: { $lt: startOfThisMonth }, isDeleted: { $ne: true } }),
    Client.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
    Client.countDocuments({ status: 'active', createdAt: { $lt: startOfThisMonth }, isDeleted: { $ne: true } }),
    Client.countDocuments({ status: 'suspended', isDeleted: { $ne: true } }),
    Client.countDocuments({ status: 'suspended', createdAt: { $lt: startOfThisMonth }, isDeleted: { $ne: true } }),
    // Subscriptions
    Subscription.find({ status: 'active', isDeleted: { $ne: true } }).lean(),
    Subscription.find({ status: 'active', startDate: { $lt: startOfThisMonth }, isDeleted: { $ne: true } }).lean(),
    // News counts
    News.countDocuments({ status: 'published', isDeleted: { $ne: true } }),
    News.countDocuments({ status: 'published', publishDate: { $gte: startOfThisMonth }, isDeleted: { $ne: true } }),
    News.countDocuments({ status: 'published', publishDate: { $gte: startOfLastMonth, $lt: startOfThisMonth }, isDeleted: { $ne: true } }),
    // Traffic
    Analytics.countDocuments({ isDeleted: { $ne: true } }),
    Analytics.countDocuments({ timestamp: { $gte: startOfThisMonth }, isDeleted: { $ne: true } }),
    Analytics.countDocuments({ timestamp: { $gte: startOfLastMonth, $lt: startOfThisMonth }, isDeleted: { $ne: true } }),
    // AI aggregates
    UsageStats.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$aiRequests' } } }
    ]),
    ActivityLog.countDocuments({ module: { $regex: /^ai$/i }, timestamp: { $gte: startOfThisMonth }, isDeleted: { $ne: true } }),
    ActivityLog.countDocuments({ module: { $regex: /^ai$/i }, timestamp: { $gte: startOfLastMonth, $lt: startOfThisMonth }, isDeleted: { $ne: true } }),
    // Storage
    Media.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]),
    // Clients details (for both breakdowns and charts)
    Client.find({ isDeleted: { $ne: true } }).select('name subdomain createdAt').lean(),
    // Breakdowns
    Media.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$clientId', storageUsed: { $sum: '$size' } } }
    ]),
    News.aggregate([
      { $match: { status: 'published', isDeleted: { $ne: true } } },
      { $group: { _id: '$clientId', count: { $sum: 1 } } }
    ]),
    Media.aggregate([
      { $match: { createdAt: { $gte: startOfThisMonth }, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]),
    Media.aggregate([
      { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth }, isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]),
    // All subscriptions for chart history
    Subscription.find({ isDeleted: { $ne: true } }).lean()
  ]);

  const clientsTotalTrend = calculateGrowth(totalClients, totalClientsLastMonth);
  const clientsActiveTrend = calculateGrowth(activeClients, activeClientsLastMonth);
  const clientsSuspendedTrend = calculateGrowth(suspendedClients, suspendedClientsLastMonth);

  const getSubMonthlyValuation = (sub) => {
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
      if (sub.plan === 'basic') monthlyValue = 999 / 36;
      else if (sub.plan === 'professional') monthlyValue = 2999 / 36;
      else if (sub.plan === 'enterprise') monthlyValue = 9999 / 36;
    }
    return monthlyValue;
  };

  let monthlyRevenue = 0;
  activeSubscriptions.forEach((sub) => {
    monthlyRevenue += getSubMonthlyValuation(sub);
  });
  monthlyRevenue = Math.round(monthlyRevenue * 100) / 100;

  let monthlyRevenueLastMonth = 0;
  subscriptionsLastMonth.forEach((sub) => {
    if (!sub.endDate || sub.endDate >= startOfThisMonth) {
      monthlyRevenueLastMonth += getSubMonthlyValuation(sub);
    }
  });
  const revenueTrend = calculateGrowth(monthlyRevenue, monthlyRevenueLastMonth);

  const newsTrend = calculateGrowth(totalNewsThisMonth, totalNewsLastMonth);
  const trafficTrend = calculateGrowth(trafficThisMonth, trafficLastMonth);

  const aiUsage = aiUsageAgg[0]?.total || 0;
  const aiTrend = calculateGrowth(aiActivityThisMonth, aiActivityLastMonth);

  const storageUsage = storageAgg[0]?.total || 0;

  const storageMap = {};
  mediaStorageBreakdown.forEach((item) => {
    if (item._id) {
      storageMap[item._id.toString()] = item.storageUsed;
    }
  });

  const storageBreakdown = clientsList.map((client) => {
    return {
      clientId: client._id,
      name: client.name,
      subdomain: client.subdomain,
      storageUsed: storageMap[client._id.toString()] || 0
    };
  });

  const newsMap = {};
  newsBreakdownRaw.forEach((item) => {
    if (item._id) {
      newsMap[item._id.toString()] = item.count;
    }
  });

  const newsBreakdown = clientsList.map((client) => {
    return {
      clientId: client._id,
      name: client.name,
      subdomain: client.subdomain,
      newsCount: newsMap[client._id.toString()] || 0
    };
  });

  const storageThisMonth = storageThisMonthAgg[0]?.total || 0;
  const storageLastMonth = storageLastMonthAgg[0]?.total || 0;
  const storageTrend = calculateGrowth(storageThisMonth, storageLastMonth);

  // 3. Charts Generation
  const chartMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    chartMonths.push({
      date: d,
      monthName: d.toLocaleString('en-US', { month: 'short' }),
      year: d.getFullYear(),
      monthIndex: d.getMonth()
    });
  }

  const clientGrowth = chartMonths.map((m) => {
    const endOfMonth = new Date(m.year, m.monthIndex + 1, 0, 23, 59, 59, 999);
    const count = clientsList.filter((c) => c.createdAt <= endOfMonth).length;
    return {
      month: m.monthName,
      count
    };
  });

  const revenueHistory = chartMonths.map((m) => {
    const firstDayOfMonth = new Date(m.year, m.monthIndex, 1);
    const lastDayOfMonth = new Date(m.year, m.monthIndex + 1, 0, 23, 59, 59, 999);

    let monthlyRev = 0;
    allSubscriptions.forEach((sub) => {
      const startedBeforeOrDuring = sub.startDate <= lastDayOfMonth;
      const endsAfterOrDuring = !sub.endDate || sub.endDate >= firstDayOfMonth;
      if (startedBeforeOrDuring && endsAfterOrDuring) {
        monthlyRev += getSubMonthlyValuation(sub);
      }
    });

    return {
      month: m.monthName,
      amount: Math.round(monthlyRev)
    };
  });

  const stats = {
    clients: {
      total: totalClients,
      active: activeClients,
      suspended: suspendedClients,
      totalTrend: clientsTotalTrend,
      activeTrend: clientsActiveTrend,
      suspendedTrend: clientsSuspendedTrend
    },
    revenue: {
      total: Math.round(monthlyRevenue * 12),
      monthly: monthlyRevenue,
      yearly: Math.round(monthlyRevenue * 12),
      monthlyTrend: revenueTrend
    },
    system: {
      totalNews,
      newsTrend,
      newsBreakdown,
      totalTraffic,
      trafficTrend,
      aiUsage,
      aiTrend,
      storageUsage,
      storageTrend,
      storageBreakdown
    },
    charts: {
      revenueHistory,
      clientGrowth
    }
  };

  // 4. Save to Redis Cache with a 5-minute TTL
  if (isRedisReady()) {
    try {
      await redis.set(cacheKey, JSON.stringify(stats), 'EX', 300);
    } catch (err) {
      logger.error(`[Redis Stats Cache Write Error] ${err.message}`, err);
    }
  }

  return stats;
};;

module.exports = {
  createWebsite,
  getClients,
  updateClient,
  updateClientStatus,
  deleteClient,
  getDashboardStats
};
