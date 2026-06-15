const userRepository = require('../repositories/user.repository');
const User = require('../models/User');
const News = require('../models/News');
const WebsiteSettings = require('../models/WebsiteSettings');
const Media = require('../models/Media');
const ActivityLog = require('../models/ActivityLog');
const UsageStats = require('../models/UsageStats');
const Subscriber = require('../models/Subscriber');
const Comment = require('../models/Comment');
const Advertisement = require('../models/Advertisement');
const Analytics = require('../models/Analytics');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');
const { emitEvent } = require('./webhook.service');
const { WEBHOOK_EVENTS } = require('../constants/webhookEvents');
const { sendWelcomeEmail } = require('./email.service');

/**
 * Resiliently write activity logs without blocking request response on log failure
 */
const logActivityResilient = async (clientId, userId, action, module, ipAddress) => {
  try {
    await ActivityLog.create({
      clientId,
      userId,
      action,
      module,
      ipAddress,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error(`[ActivityLog Error] Tenant logger failed to write: ${err.message}`, err);
  }
};

/**
 * Create a new tenant editor/admin
 */
const createAdmin = async (clientId, data, ipAddress, operatorId) => {
  // Check global email uniqueness scope
  const existingUser = await userRepository.findByEmail(data.email);
  if (existingUser) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Email is already registered by another user.');
  }

  const newAdmin = await userRepository.createUser({
    clientId,
    name: data.name,
    email: data.email,
    password: data.password, // hashed pre-save hook
    role: 'admin',
    status: 'active'
  });

  logActivityResilient(clientId, operatorId, 'admin_create', 'admin', ipAddress);
  emitEvent(clientId.toString(), WEBHOOK_EVENTS.USER_CREATED, { userId: newAdmin._id, email: newAdmin.email, role: 'admin', createdAt: new Date() });

  let tenant = {};
  if (clientId) {
    try {
      const Client = require('../models/Client');
      const client = await Client.findById(clientId);
      if (client) {
        const settings = await WebsiteSettings.findOne({ clientId });
        const config = require('../config/config');
        const { getClientUrl } = require('./email.service');
        const clientUrl = getClientUrl(client, config.clientUrl);

        tenant = {
          siteName: settings ? settings.siteName : client.name,
          contactEmail: settings ? settings.contactEmail : '',
          clientUrl
        };
      }
    } catch (err) {
      logger.error(`[Welcome Email Resolve Error] ${err.message}`, err);
    }
  }

  // Send welcome email (fire-and-forget — resilient, non-blocking)
  sendWelcomeEmail(
    { name: newAdmin.name, email: newAdmin.email },
    tenant
  ).catch(() => {});

  return {
    id: newAdmin._id,
    name: newAdmin.name,
    email: newAdmin.email,
    role: newAdmin.role,
    status: newAdmin.status
  };
};

/**
 * Get paginated list of tenant admins/editors
 */
const getAdmins = async (clientId, filters, options) => {
  return userRepository.findAllTenantUsers(clientId, filters, options);
};

/**
 * Update tenant admin/editor details (name)
 */
const updateAdmin = async (clientId, userId, updateData, ipAddress, operatorId) => {
  const user = await userRepository.findById(userId);
  if (!user || user.isDeleted || user.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Admin user not found.');
  }

  // Ensure role is admin
  if (user.role !== 'admin') {
    throw new AppError(httpStatus.FORBIDDEN, 'Insufficient permissions to modify this user.');
  }

  if (updateData.name) user.name = updateData.name;
  await user.save();

  logActivityResilient(clientId, operatorId, 'admin_update', 'admin', ipAddress);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status
  };
};

/**
 * Toggle active status of an editor
 */
const updateAdminStatus = async (clientId, userId, status, ipAddress, operatorId) => {
  const user = await userRepository.findById(userId);
  if (!user || user.isDeleted || user.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Admin user not found.');
  }

  if (user.role !== 'admin') {
    throw new AppError(httpStatus.FORBIDDEN, 'Insufficient permissions to modify status of this user.');
  }

  user.status = status;
  await user.save();

  logActivityResilient(clientId, operatorId, 'admin_update', 'admin', ipAddress);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    status: user.status
  };
};

/**
 * Reset admin editor password
 */
const resetAdminPassword = async (clientId, userId, password, ipAddress, operatorId) => {
  const user = await userRepository.findById(userId);
  if (!user || user.isDeleted || user.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Admin user not found.');
  }

  if (user.role !== 'admin') {
    throw new AppError(httpStatus.FORBIDDEN, 'Insufficient permissions to reset password of this user.');
  }

  user.password = password; // hashed pre-save
  await user.save();

  logActivityResilient(clientId, operatorId, 'admin_password_reset', 'admin', ipAddress);

  return true;
};

/**
 * Soft delete an admin editor
 */
const deleteAdmin = async (clientId, userId, ipAddress, operatorId) => {
  const user = await userRepository.findById(userId);
  if (!user || user.isDeleted || user.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Admin user not found.');
  }

  if (user.role !== 'admin') {
    throw new AppError(httpStatus.FORBIDDEN, 'Insufficient permissions to delete this user.');
  }

  await user.softDelete();

  // Decrement tenant adminCount in UsageStats
  await UsageStats.updateOne(
    { clientId },
    { $inc: { adminCount: -1 } }
  );

  logActivityResilient(clientId, operatorId, 'admin_delete', 'admin', ipAddress);

  return true;
};

/**
 * Monitor tenant admins: lists lastLogin, createdAt and total news published
 */
const getAdminsMonitoring = async (clientId) => {
  const admins = await User.find({
    clientId,
    role: 'admin',
    isDeleted: { $ne: true }
  }).sort({ createdAt: -1 });

  const monitorData = await Promise.all(
    admins.map(async (admin) => {
      const publishedCount = await News.countDocuments({
        author: admin._id,
        status: 'published',
        isDeleted: { $ne: true }
      });

      return {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        status: admin.status,
        lastLogin: admin.lastLogin || null,
        createdAt: admin.createdAt,
        publishedNewsCount: publishedCount
      };
    })
  );

  return monitorData;
};

/**
 * Get Website Settings configuration for tenant
 */
const getWebsiteSettings = async (clientId) => {
  let settings = await WebsiteSettings.findOne({ clientId, isDeleted: { $ne: true } })
    .populate('logo', 'url')
    .populate('favicon', 'url');
  if (!settings) {
    // Generate default settings on first fetch
    settings = await WebsiteSettings.create({
      clientId,
      siteName: 'My News Portal',
      contactEmail: '',
      socialLinks: {}
    });
    // Populate references (will be null but sets structure)
    await settings.populate('logo', 'url');
    await settings.populate('favicon', 'url');
  }
  return settings;
};

/**
 * Update Website Settings configuration for tenant
 */
const updateWebsiteSettings = async (clientId, settingsData, ipAddress, operatorId) => {
  let settings = await WebsiteSettings.findOne({ clientId, isDeleted: { $ne: true } });
  if (!settings) {
    settings = new WebsiteSettings({ clientId });
  }

  // Update siteName / name
  if (settingsData.name !== undefined) {
    settings.siteName = settingsData.name;
  } else if (settingsData.siteName !== undefined) {
    settings.siteName = settingsData.siteName;
  }

  if (settingsData.tagline !== undefined) settings.tagline = settingsData.tagline;
  if (settingsData.primaryColor !== undefined) settings.primaryColor = settingsData.primaryColor;
  if (settingsData.contactEmail !== undefined) settings.contactEmail = settingsData.contactEmail;
  if (settingsData.contactPhone !== undefined) settings.contactPhone = settingsData.contactPhone;

  // Handle logo string to ObjectId mapping
  if (settingsData.logo !== undefined) {
    if (!settingsData.logo) {
      settings.logo = null;
    } else {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(settingsData.logo)) {
        settings.logo = settingsData.logo;
      } else {
        // Search Media by URL
        let media = await Media.findOne({ clientId, url: settingsData.logo, isDeleted: { $ne: true } });
        if (!media) {
          media = await Media.create({
            clientId,
            name: 'Website Logo',
            url: settingsData.logo,
            publicId: `logo_${Date.now()}`,
            size: 1000,
            type: 'image',
            resourceType: 'image'
          });
        }
        settings.logo = media._id;
      }
    }
  }

  // Update social links mapping
  const socialLinks = settingsData.socialLinks || {};
  settings.socialLinks = {
    facebook: settingsData.facebookUrl !== undefined ? settingsData.facebookUrl : (socialLinks.facebook || ''),
    twitter: settingsData.twitterUrl !== undefined ? settingsData.twitterUrl : (socialLinks.twitter || ''),
    instagram: socialLinks.instagram || '',
    youtube: settingsData.youtubeUrl !== undefined ? settingsData.youtubeUrl : (socialLinks.youtube || ''),
    tiktok: settingsData.tiktokUrl !== undefined ? settingsData.tiktokUrl : (socialLinks.tiktok || '')
  };

  // Update features
  if (settingsData.features !== undefined) {
    settings.features = {
      aiStudioEnabled: settingsData.features.aiStudioEnabled ?? true,
      commentsApprovalRequired: settingsData.features.commentsApprovalRequired ?? false
    };
  }

  await settings.save();

  // Populate references before returning
  await settings.populate('logo', 'url');
  await settings.populate('favicon', 'url');

  logActivityResilient(clientId, operatorId, 'settings_update', 'settings', ipAddress);

  return settings;
};

/**
 * Retrieve comprehensive statistics and aggregations for tenant dashboard
 */
const getDashboardStats = async (clientId) => {
  const [
    totalArticles,
    publishedArticles,
    draftArticles,
    scheduledArticles,
    totalSubscribers,
    totalComments,
    pendingComments,
    ads,
    categoryDistributionRaw
  ] = await Promise.all([
    News.countDocuments({ clientId, isDeleted: { $ne: true } }),
    News.countDocuments({ clientId, status: 'published', isDeleted: { $ne: true } }),
    News.countDocuments({ clientId, status: 'draft', isDeleted: { $ne: true } }),
    News.countDocuments({ clientId, status: 'scheduled', isDeleted: { $ne: true } }),
    Subscriber.countDocuments({ clientId, status: 'active', isDeleted: { $ne: true } }),
    Comment.countDocuments({ clientId, isDeleted: { $ne: true } }),
    Comment.countDocuments({ clientId, status: 'pending', isDeleted: { $ne: true } }),
    Advertisement.find({ clientId, isDeleted: { $ne: true } }),
    News.aggregate([
      { $match: { clientId, isDeleted: { $ne: true } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ['$categoryInfo.name', 'Uncategorized'] },
          value: '$count'
        }
      }
    ])
  ]);

  // Aggregate ads metrics
  let totalImpressions = 0;
  let totalClicks = 0;
  ads.forEach(ad => {
    totalImpressions += ad.impressions || 0;
    totalClicks += ad.clicks || 0;
  });
  const ctrVal = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const ctr = ctrVal.toFixed(1) + '%';
  const adRevenue = totalClicks * 0.20; // assumed flat rate per click of $0.20

  // Daily views aggregation from Analytics
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const dailyViewsRaw = await Analytics.aggregate([
    {
      $match: {
        clientId,
        timestamp: { $gte: sevenDaysAgo },
        isDeleted: { $ne: true }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
        views: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Fill in any missing days in the last 7 days with 0 views to keep graph continuous
  const dailyViewsMap = {};
  dailyViewsRaw.forEach(item => {
    dailyViewsMap[item._id] = item.views;
  });

  const dailyViews = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = daysOfWeek[d.getDay()];
    dailyViews.push({
      day: dayName,
      views: dailyViewsMap[dateStr] || 0
    });
  }

  return {
    news: {
      total: totalArticles,
      published: publishedArticles,
      draft: draftArticles,
      scheduled: scheduledArticles
    },
    engagement: {
      subscribers: totalSubscribers,
      comments: totalComments,
      pendingComments
    },
    revenue: {
      adImpressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      adRevenue
    },
    charts: {
      dailyViews,
      categoriesDistribution: categoryDistributionRaw
    }
  };
};

module.exports = {
  createAdmin,
  getAdmins,
  updateAdmin,
  updateAdminStatus,
  resetAdminPassword,
  deleteAdmin,
  getAdminsMonitoring,
  getWebsiteSettings,
  updateWebsiteSettings,
  getDashboardStats
};
