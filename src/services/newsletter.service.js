const Subscriber = require('../models/Subscriber');
const Campaign = require('../models/Campaign');
const Client = require('../models/Client');
const ActivityLog = require('../models/ActivityLog');
const emailService = require('./email.service');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

/**
 * Public subscription to newsletter
 */
const subscribe = async (clientId, { email, name }) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Find subscriber bypassing soft-delete to prevent key conflicts
  let subscriber = await Subscriber.collection.findOne({ clientId, email: normalizedEmail });

  if (subscriber) {
    if (subscriber.isDeleted) {
      // Restore soft deleted subscriber
      await Subscriber.collection.updateOne(
        { _id: subscriber._id },
        { $set: { isDeleted: false, status: 'active', unsubscribedAt: null } }
      );
      const restored = await Subscriber.findById(subscriber._id);
      return restored.toObject();
    }

    if (subscriber.status === 'unsubscribed') {
      // Re-activate subscription
      const updated = await Subscriber.findOneAndUpdate(
        { _id: subscriber._id },
        { status: 'active', unsubscribedAt: null },
        { new: true }
      );
      return updated.toObject();
    }

    // Already active
    const activeSub = await Subscriber.findById(subscriber._id);
    return activeSub.toObject();
  }

  // Create new subscriber
  const newSub = await Subscriber.create({
    clientId,
    email: normalizedEmail,
    name: name || '',
    status: 'active'
  });

  return newSub.toObject();
};

/**
 * Public secure unsubscribe using unsubscribeToken
 */
const unsubscribe = async (token) => {
  const subscriber = await Subscriber.findOne({ unsubscribeToken: token });
  if (!subscriber) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscription record not found or invalid token.');
  }

  if (subscriber.status === 'unsubscribed') {
    return subscriber.toObject();
  }

  subscriber.status = 'unsubscribed';
  subscriber.unsubscribedAt = new Date();
  await subscriber.save();

  return subscriber.toObject();
};

/**
 * Create a new newsletter campaign draft
 */
const createCampaign = async (clientId, data, creatorUserId) => {
  const campaign = await Campaign.create({
    clientId,
    subject: data.subject,
    body: data.body,
    createdBy: creatorUserId,
    status: 'draft'
  });

  return campaign.toObject();
};

/**
 * Dispatch Campaign to subscribers in batches of 50 asynchronously (using setImmediate)
 */
const sendCampaign = async (clientId, campaignId, operatorUserId) => {
  const campaign = await Campaign.findOne({ _id: campaignId, clientId, isDeleted: false });
  if (!campaign) {
    throw new AppError(httpStatus.NOT_FOUND, 'Campaign not found.');
  }

  if (campaign.status !== 'draft') {
    throw new AppError(httpStatus.BAD_REQUEST, `Campaign cannot be sent because its current status is: ${campaign.status}`);
  }

  const client = await Client.findById(clientId);
  const brandName = client ? client.name : 'SaaS News Portal';

  const subscribers = await Subscriber.find({ clientId, status: 'active' });
  const total = subscribers.length;

  campaign.status          = 'sending';
  campaign.recipientsCount = total;
  campaign.stats           = { queued: total, sent: 0, failed: 0, opened: 0, clicked: 0 };
  await campaign.save();

  // Return immediately to caller while sending in the background
  let index = 0;
  let sentCount = 0;
  let failedCount = 0;

  const sendNextBatch = () => {
    const batch = subscribers.slice(index, index + 50);
    if (batch.length === 0) {
      // Completed dispatch
      campaign.status = 'sent';
      campaign.sentAt = new Date();
      campaign.recipientsCount = total;
      campaign.stats = {
        sent: sentCount,
        failed: failedCount,
        opened: 0,
        clicked: 0
      };
      campaign.save().then(() => {
        logger.info(`[NewsletterService] Completed campaign "${campaign.subject}" dispatch for client ${clientId}. Sent: ${sentCount}, Failed: ${failedCount}`);
      }).catch(err => {
        logger.error(`[NewsletterService] Failed to finalize campaign stats: ${err.message}`);
      });
      return;
    }
    const promises = batch.map(async (sub) => {
      try {
        const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5000';
        const unsubscribeUrl = `${appUrl}/api/v1/newsletter/unsubscribe?token=${sub.unsubscribeToken}`;

        const isSent = await emailService.enqueueEmailJob({
          clientId,                         // For email limit tracking (UsageStats)
          campaignId: campaign._id.toString(), // For worker to update Campaign.stats
          to: sub.email,
          subject: campaign.subject,
          templateName: 'newsletter',
          variables: {
            body: campaign.body,
            brandName,
            unsubscribeUrl
          }
        });
        // In sync-fallback mode, isSent is a boolean — update local counters
        if (isSent === true)  sentCount++;
        if (isSent === false) failedCount++;
        // In queue mode, isSent is a job ID string — worker handles stat updates
      } catch (err) {
        failedCount++;
        logger.warn(`[NewsletterService] Failed to email subscriber ${sub.email}: ${err.message}`);
      }
    });

    Promise.all(promises).finally(() => {
      index += 50;
      setImmediate(sendNextBatch);
    });
  };

  // Launch background process
  setImmediate(sendNextBatch);

  // Write administrative activity log
  await ActivityLog.create({
    clientId,
    userId: operatorUserId,
    module: 'newsletter',
    action: 'campaign_send',
    details: { campaignId: campaign._id.toString(), recipientsCount: total },
    ipAddress: 'system'
  }).catch((err) => {
    logger.error(`[NewsletterService] Failed to write activity log: ${err.message}`);
  });

  return { success: true, message: 'Campaign sending initiated in background.', status: 'sending', recipientsCount: total };
};

/**
 * Admin: Get paginated subscribers
 */
const getSubscribers = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const queryFilters = { clientId };
  if (filters.status) {
    queryFilters.status = filters.status;
  }

  const total = await Subscriber.countDocuments(queryFilters);
  const results = await Subscriber.find(queryFilters)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return { results, total, page, limit };
};

/**
 * Admin: Unsubscribe/Delete a subscriber directly
 */
const removeSubscriber = async (clientId, subscriberId, operatorUserId) => {
  const subscriber = await Subscriber.findOne({ _id: subscriberId, clientId });
  if (!subscriber) {
    throw new AppError(httpStatus.NOT_FOUND, 'Subscriber record not found.');
  }

  // Soft delete subscriber
  await subscriber.softDelete();

  // Log action
  await ActivityLog.create({
    clientId,
    userId: operatorUserId,
    module: 'newsletter',
    action: 'subscriber_delete',
    details: { subscriberId: subscriber._id.toString(), email: subscriber.email },
    ipAddress: 'system'
  }).catch((err) => {
    logger.error(`[NewsletterService] Failed to write activity log: ${err.message}`);
  });

  return { success: true };
};

/**
 * Admin: Get campaigns
 */
const getCampaigns = async (clientId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const total = await Campaign.countDocuments({ clientId, isDeleted: false });
  const results = await Campaign.find({ clientId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return { results, total, page, limit };
};

module.exports = {
  subscribe,
  unsubscribe,
  createCampaign,
  sendCampaign,
  getSubscribers,
  removeSubscriber,
  getCampaigns
};
