const News = require('../models/News');
const ActivityLog = require('../models/ActivityLog');
const UsageStats = require('../models/UsageStats');
const Subscription = require('../models/Subscription');
const { PLAN_LIMITS } = require('../constants/planLimits');
const logger = require('../config/logger');

// Resilient logging helper
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
    logger.error(`[ActivityLog Error] Auto-publish activity log write failed: ${err.message}`, err);
  }
};

/**
 * Publishes a single news article and records audit trails
 * @param {Object} article - Mongoose News Document
 */
const publishSingleArticle = async (article) => {
  const subscription = await Subscription.findOne({ clientId: article.clientId, status: 'active', isDeleted: false }).lean();
  if (subscription) {
    const limits = PLAN_LIMITS[subscription.plan] || {};
    const cap = limits.newsCount;
    if (cap > 0) {
      const usage = await UsageStats.findOne({ clientId: article.clientId }).lean();
      if (usage && usage.newsCount >= cap) {
        // Log resiliently to ActivityLog
        (async () => {
          try {
            const User = require('../models/User');
            let userId = article.author;
            if (!userId) {
              const superAdmin = await User.findOne({ clientId: article.clientId, role: 'super_admin' }).lean();
              userId = superAdmin ? superAdmin._id : null;
            }
            if (!userId) {
              const anyUser = await User.findOne({ clientId: article.clientId }).lean();
              userId = anyUser ? anyUser._id : null;
            }
            if (userId) {
              await ActivityLog.create({
                clientId: article.clientId,
                userId,
                action: 'subscription_limit_reached',
                module: 'subscription',
                details: { limitKey: 'maxNews', cap },
                timestamp: new Date()
              });
            }
          } catch (err) {
            // ignore
          }
        })();

        throw new Error(`Plan limit reached for news articles (${cap}/${cap}). Upgrade required to publish.`);
      }
    }
  }

  article.status = 'published';
  await article.save();

  // Increment newsCount atomically
  await UsageStats.updateOne(
    { clientId: article.clientId },
    { $inc: { newsCount: 1 } },
    { upsert: true }
  );

  // Audit activity logs using the article's own client ID and author ID
  await logActivityResilient(
    article.clientId,
    article.author,
    'news_auto_publish',
    'news',
    'system'
  );
};

/**
 * Scan database for scheduled news articles due for release and publish them
 * @returns {Promise<Object>} Summary of executed publishing job
 */
const publishScheduledArticles = async () => {
  const successes = [];
  const failures = [];

  try {
    // Find articles due for release
    const queryCriteria = {
      status: 'scheduled',
      publishDate: { $lte: new Date() },
      isDeleted: { $ne: true }
    };

    const articles = await News.find(queryCriteria).exec();

    // Process articles individually to ensure failure isolation and precise auditing
    for (const article of articles) {
      try {
        await publishSingleArticle(article);
        successes.push({
          id: article._id,
          title: article.title,
          slug: article.slug
        });
      } catch (err) {
        logger.error(`[Scheduled Publishing Error] Failed to publish article [${article._id}]: ${err.message}`, err);
        failures.push({
          id: article._id,
          error: err.message
        });
      }
    }
  } catch (err) {
    logger.error(`[Scheduled Publishing Trigger Failed] Scan failed: ${err.message}`, err);
    throw err;
  }

  return {
    successCount: successes.length,
    successes,
    failureCount: failures.length,
    failures
  };
};

module.exports = {
  publishScheduledArticles,
  publishSingleArticle
};
