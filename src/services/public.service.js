const contactRepository = require('../repositories/contact.repository');
const News = require('../models/News');
const Category = require('../models/Category');
const WebsiteSettings = require('../models/WebsiteSettings');
const Advertisement = require('../models/Advertisement');
const Media = require('../models/Media');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');

/**
 * Retrieve public branding settings configuration for a tenant
 */
const getWebsiteSettings = async (clientId) => {
  const settings = await WebsiteSettings.findOne({ clientId })
    .populate('logo', 'url')
    .populate('favicon', 'url')
    .exec();

  if (!settings || settings.isDeleted) {
    return {
      siteName: 'My News Portal',
      logo: null,
      favicon: null,
      contactEmail: '',
      socialLinks: { facebook: '', twitter: '', instagram: '', youtube: '' }
    };
  }

  return settings;
};

/**
 * Retrieve active categories list
 */
const getCategories = async (clientId) => {
  return Category.find({ clientId, isDeleted: { $ne: true } })
    .populate('parentCategory', 'name slug')
    .sort({ name: 1 })
    .exec();
};

/**
 * List paginated public published news feed
 */
const getPublishedNews = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  // Strict public filter criteria (only published, and date has passed)
  const queryFilters = {
    clientId,
    status: 'published',
    publishDate: { $lte: new Date() },
    isDeleted: { $ne: true }
  };

  // Filter by category slug
  if (filters.category) {
    const cat = await Category.findOne({ clientId, slug: filters.category, isDeleted: { $ne: true } });
    if (!cat) {
      return { results: [], total: 0, page, limit };
    }
    queryFilters.category = cat._id;
  }

  // Regex text search
  if (filters.search) {
    queryFilters.$or = [
      { title: { $regex: filters.search, $options: 'i' } },
      { content: { $regex: filters.search, $options: 'i' } }
    ];
  }

  if (filters.label) {
    queryFilters.labels = filters.label;
  }

  if (filters.tag) {
    queryFilters.tags = filters.tag;
  }

  const total = await News.countDocuments(queryFilters);
  const results = await News.find(queryFilters)
    .populate('category', 'name slug')
    .populate('author', 'name email')
    .populate('featuredImage', 'url')
    .skip(skip)
    .limit(limit)
    .sort({ publishDate: -1, createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

/**
 * Retrieve details of a single published news article by slug
 */
const getNewsBySlug = async (clientId, slug) => {
  const news = await News.findOne({
    clientId,
    slug,
    status: 'published',
    publishDate: { $lte: new Date() },
    isDeleted: { $ne: true }
  })
    .populate('category', 'name slug')
    .populate('author', 'name email')
    .populate('featuredImage', 'url')
    .populate('galleryImages', 'url')
    .exec();

  if (!news) {
    throw new AppError(httpStatus.NOT_FOUND, 'Article not found.');
  }

  return news;
};

/**
 * Submit feedback/contact form
 */
const createContactSubmission = async (clientId, data) => {
  const contactPayload = {
    clientId,
    name: data.name,
    email: data.email,
    subject: data.subject,
    message: data.message,
    status: 'unread'
  };

  return contactRepository.create(contactPayload);
};

/**
 * List eligible active advertisement campaigns
 */
const getActiveAds = async (clientId, location) => {
  const now = new Date();

  // Eligible criteria: active, and current date is within start and end date thresholds
  const query = {
    clientId,
    status: 'active',
    isDeleted: { $ne: true },
    startDate: { $lte: now },
    $or: [
      { endDate: null },
      { endDate: { $gte: now } }
    ]
  };

  if (location) {
    query.location = location;
  }

  return Advertisement.find(query).sort({ createdAt: -1 }).exec();
};

module.exports = {
  getWebsiteSettings,
  getCategories,
  getPublishedNews,
  getNewsBySlug,
  createContactSubmission,
  getActiveAds
};
