const newsRepository = require('../repositories/news.repository');
const News = require('../models/News');
const Category = require('../models/Category');
const Media = require('../models/Media');
const ActivityLog = require('../models/ActivityLog');
const UsageStats = require('../models/UsageStats');
const Subscription = require('../models/Subscription');
const { PLAN_LIMITS } = require('../constants/planLimits');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');
const { emitEvent } = require('./webhook.service');
const { WEBHOOK_EVENTS } = require('../constants/webhookEvents');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const resolveFeaturedImage = async (clientId, authorId, featuredImage) => {
  if (!featuredImage) return null;
  
  if (objectIdPattern.test(featuredImage)) {
    return featuredImage;
  }
  
  try {
    let media = await Media.findOne({ url: featuredImage, clientId, isDeleted: { $ne: true } });
    if (!media) {
      media = await Media.create({
        clientId,
        name: 'Featured Image',
        url: featuredImage,
        publicId: `external_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        format: 'jpg',
        size: 0,
        type: 'image',
        uploadedBy: authorId
      });
    }
    return media._id.toString();
  } catch (err) {
    logger.error(`[NewsService] Failed to resolve featuredImage URL to Media: ${err.message}`);
    return null;
  }
};

const resolveGalleryImages = async (clientId, authorId, galleryImages) => {
  if (!galleryImages || !Array.isArray(galleryImages)) return [];
  
  const resolvedIds = [];
  for (const image of galleryImages) {
    if (!image) continue;
    if (objectIdPattern.test(image)) {
      resolvedIds.push(image);
      continue;
    }
    
    try {
      let media = await Media.findOne({ url: image, clientId, isDeleted: { $ne: true } });
      if (!media) {
        media = await Media.create({
          clientId,
          name: 'Gallery Image',
          url: image,
          publicId: `external_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          format: 'jpg',
          size: 0,
          type: 'image',
          uploadedBy: authorId
        });
      }
      resolvedIds.push(media._id.toString());
    } catch (err) {
      logger.error(`[NewsService] Failed to resolve galleryImage URL to Media: ${err.message}`);
    }
  }
  return resolvedIds;
};

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
    logger.error(`[ActivityLog Error] News activity log write failed: ${err.message}`, err);
  }
};

/**
 * Check published news article limits and atomically increment newsCount in UsageStats
 */
const checkAndIncrementNewsLimit = async (clientId) => {
  // Ensure UsageStats document exists (resilient for older seeded data)
  await UsageStats.findOneAndUpdate(
    { clientId },
    { $setOnInsert: { adminCount: 0, newsCount: 0, storageUsed: 0, aiRequests: 0, apiRequests: 0, emailSent: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const subscription = await Subscription.findOne({ clientId, status: 'active', isDeleted: false }).lean();
  if (!subscription) {
    throw new AppError(httpStatus.PAYMENT_REQUIRED, 'No active subscription found.');
  }

  const plan = subscription.plan;
  const limits = PLAN_LIMITS[plan] || {};
  const cap = limits.newsCount;

  // 0 means unlimited
  if (cap === 0) {
    await UsageStats.updateOne(
      { clientId },
      { $inc: { newsCount: 1 } }
    );
    return;
  }

  // Perform atomic increment and cap enforcement
  const updated = await UsageStats.findOneAndUpdate(
    { clientId, newsCount: { $lt: cap } },
    { $inc: { newsCount: 1 } },
    { new: true }
  );

  if (!updated) {
    // Log resiliently to ActivityLog
    (async () => {
      try {
        const User = require('../models/User');
        const superAdmin = await User.findOne({ clientId, role: 'super_admin' }).lean();
        let userId = superAdmin ? superAdmin._id : null;
        if (!userId) {
          const anyUser = await User.findOne({ clientId }).lean();
          userId = anyUser ? anyUser._id : null;
        }
        if (userId) {
          await ActivityLog.create({
            clientId,
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

    throw new AppError(
      httpStatus.FORBIDDEN,
      `Plan limit reached for news articles. Current usage: ${cap}/${cap}. Please upgrade your plan.`
    );
  }
};

// Simple URL-friendly slug generator
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

/**
 * Generate a unique slug for a tenant news article
 */
const generateUniqueSlug = async (clientId, title, session = null) => {
  let slug = slugify(title);
  let baseSlug = slug;
  let counter = 1;

  let slugExists = await News.findOne({ clientId, slug, isDeleted: { $ne: true } }).session(session).exec();
  while (slugExists) {
    slug = `${baseSlug}-${counter}`;
    slugExists = await News.findOne({ clientId, slug, isDeleted: { $ne: true } }).session(session).exec();
    counter++;
  }

  return slug;
};

/**
 * Validate that associated references (category, media) belong to the same tenant client
 */
const validateTenantReferences = async (clientId, data) => {
  // A. Check Category
  if (data.category) {
    const category = await Category.findOne({ _id: data.category, clientId, isDeleted: { $ne: true } });
    if (!category) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Referenced Category not found or access denied.');
    }
  }

  // B. Check Featured Image
  if (data.featuredImage) {
    const media = await Media.findOne({ _id: data.featuredImage, clientId, isDeleted: { $ne: true } });
    if (!media) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Referenced Featured Image not found or access denied.');
    }
  }

  // C. Check Gallery Images
  if (data.galleryImages && data.galleryImages.length > 0) {
    const count = await Media.countDocuments({
      _id: { $in: data.galleryImages },
      clientId,
      isDeleted: { $ne: true }
    });
    if (count !== data.galleryImages.length) {
      throw new AppError(httpStatus.BAD_REQUEST, 'One or more Gallery Images not found or access denied.');
    }
  }
};

/**
 * Create a new news article
 */
const createNews = async (clientId, authorId, data, ipAddress) => {
  if (data.featuredImage) {
    data.featuredImage = await resolveFeaturedImage(clientId, authorId, data.featuredImage);
  }
  if (data.galleryImages) {
    data.galleryImages = await resolveGalleryImages(clientId, authorId, data.galleryImages);
  }

  // 1. Verify Category and Media exist and belong to this clientId
  await validateTenantReferences(clientId, data);

  // 2. Generate clean unique slug
  const slug = data.slug ? slugify(data.slug) : await generateUniqueSlug(clientId, data.title);

  // 3. Assemble document payload
  const newsPayload = {
    clientId,
    author: authorId,
    title: data.title,
    slug,
    shortDescription: data.shortDescription,
    content: data.content,
    featuredImage: data.featuredImage || null,
    galleryImages: data.galleryImages || [],
    videoUrl: data.videoUrl || '',
    tags: data.tags || [],
    category: data.category,
    status: data.status || 'draft',
    labels: data.labels || [],
    publishDate: data.publishDate || new Date()
  };

  if (data.status === 'published') {
    await checkAndIncrementNewsLimit(clientId);
  }

  const news = await newsRepository.create(newsPayload);

  // 4. Log audit log
  logActivityResilient(clientId, authorId, 'news_create', 'news', ipAddress);

  return news;
};

/**
 * Update an existing news article
 */
const updateNews = async (clientId, newsId, updateData, ipAddress, operatorId) => {
  const news = await News.findById(newsId);
  if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
  }

  if (updateData.featuredImage) {
    updateData.featuredImage = await resolveFeaturedImage(clientId, operatorId, updateData.featuredImage);
  }
  if (updateData.galleryImages) {
    updateData.galleryImages = await resolveGalleryImages(clientId, operatorId, updateData.galleryImages);
  }

  // Verify updated references belong to this tenant
  await validateTenantReferences(clientId, updateData);

  // If title is updated and slug is not provided, regenerate slug
  if (updateData.title && !updateData.slug && updateData.title !== news.title) {
    updateData.slug = await generateUniqueSlug(clientId, updateData.title);
  } else if (updateData.slug) {
    updateData.slug = slugify(updateData.slug);
  }

  const oldStatus = news.status;
  const newStatus = updateData.status || oldStatus;

  if (oldStatus !== 'published' && newStatus === 'published') {
    await checkAndIncrementNewsLimit(clientId);
  } else if (oldStatus === 'published' && newStatus !== 'published') {
    await UsageStats.updateOne({ clientId }, { $inc: { newsCount: -1 } });
  }

  const updatedNews = await newsRepository.update(newsId, updateData);

  logActivityResilient(clientId, operatorId, 'news_update', 'news', ipAddress);
  emitEvent(clientId, WEBHOOK_EVENTS.NEWS_UPDATED, { newsId, title: updatedNews?.title, updatedAt: new Date() });

  return updatedNews;
};

/**
 * Publish news article immediately
 */
const publishNews = async (clientId, newsId, ipAddress, operatorId) => {
  const news = await News.findById(newsId);
  if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
  }

  if (news.status !== 'published') {
    await checkAndIncrementNewsLimit(clientId);
  }
  news.status = 'published';
  news.publishDate = new Date();
  await news.save();

  logActivityResilient(clientId, operatorId, 'news_publish', 'news', ipAddress);
  emitEvent(clientId, WEBHOOK_EVENTS.NEWS_PUBLISHED, { newsId: news._id, title: news.title, slug: news.slug, publishDate: news.publishDate });

  return news;
};

/**
 * Schedule news article publication
 */
const scheduleNews = async (clientId, newsId, publishDate, ipAddress, operatorId) => {
  const news = await News.findById(newsId);
  if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
  }

  news.status = 'scheduled';
  news.publishDate = publishDate;
  await news.save();

  logActivityResilient(clientId, operatorId, 'news_schedule', 'news', ipAddress);
  emitEvent(clientId, WEBHOOK_EVENTS.NEWS_SCHEDULED, { newsId: news._id, title: news.title, scheduledFor: publishDate });

  return news;
};

/**
 * Duplicate an existing news article as a new draft
 */
const duplicateNews = async (clientId, newsId, authorId, ipAddress) => {
  const news = await News.findById(newsId);
  if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
  }

  // Generate unique copy slug
  const titleCopy = `${news.title} Copy`;
  const slugCopy = await generateUniqueSlug(clientId, titleCopy);

  const duplicatePayload = {
    clientId,
    author: authorId,
    title: titleCopy,
    slug: slugCopy,
    shortDescription: news.shortDescription,
    content: news.content,
    featuredImage: news.featuredImage || null,
    galleryImages: news.galleryImages || [],
    videoUrl: news.videoUrl || '',
    tags: news.tags || [],
    category: news.category,
    status: 'draft',
    labels: news.labels || [],
    publishDate: new Date()
  };

  const duplicate = await newsRepository.create(duplicatePayload);

  logActivityResilient(clientId, authorId, 'news_duplicate', 'news', ipAddress);

  return duplicate;
};

/**
 * Soft delete a news article
 */
const deleteNews = async (clientId, newsId, ipAddress, operatorId) => {
  const news = await News.findById(newsId);
  if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
  }

  await news.softDelete();
  if (news.status === 'published') {
    await UsageStats.updateOne({ clientId }, { $inc: { newsCount: -1 } });
  }

  logActivityResilient(clientId, operatorId, 'news_delete', 'news', ipAddress);
  emitEvent(clientId, WEBHOOK_EVENTS.NEWS_DELETED, { newsId: news._id, title: news.title, deletedAt: new Date() });

  return true;
};

/**
 * Preview a news article regardless of status checks
 */
const previewNews = async (clientId, newsId) => {
  const news = await newsRepository.findById(newsId);
  if (!news || news.isDeleted || news.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found.');
  }
  return news;
};

module.exports = {
  createNews,
  updateNews,
  publishNews,
  scheduleNews,
  duplicateNews,
  deleteNews,
  previewNews
};
