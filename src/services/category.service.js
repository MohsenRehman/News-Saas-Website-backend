const categoryRepository = require('../repositories/category.repository');
const Category = require('../models/Category');
const News = require('../models/News');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
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
    logger.error(`[ActivityLog Error] Category activity log write failed: ${err.message}`, err);
  }
};

// URL-friendly slug generator
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
 * Generate a unique slug for a tenant category
 */
const generateUniqueSlug = async (clientId, name, session = null) => {
  let slug = slugify(name);
  let baseSlug = slug;
  let counter = 1;

  let slugExists = await Category.findOne({ clientId, slug, isDeleted: { $ne: true } }).session(session).exec();
  while (slugExists) {
    slug = `${baseSlug}-${counter}`;
    slugExists = await Category.findOne({ clientId, slug, isDeleted: { $ne: true } }).session(session).exec();
    counter++;
  }

  return slug;
};

/**
 * Check for cyclic parent reference (e.g. A -> B -> A)
 */
const checkCircularReference = async (clientId, categoryId, newParentId) => {
  if (!newParentId) return;
  if (categoryId && categoryId.toString() === newParentId.toString()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'A category cannot be its own parent.');
  }

  let currentParentId = newParentId;
  while (currentParentId) {
    const parent = await Category.findOne({ _id: currentParentId, clientId, isDeleted: { $ne: true } });
    if (!parent) break;
    
    if (categoryId && parent._id.toString() === categoryId.toString()) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Circular parent category reference detected.');
    }
    currentParentId = parent.parentCategory;
  }
};

/**
 * Create a new category
 */
const createCategory = async (clientId, data, ipAddress, operatorId) => {
  // If parentCategory is provided, validate it belongs to the same tenant
  if (data.parentCategory) {
    const parent = await Category.findOne({ _id: data.parentCategory, clientId, isDeleted: { $ne: true } });
    if (!parent) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Referenced parent category not found or access denied.');
    }
  }

  const slug = await generateUniqueSlug(clientId, data.name);

  const categoryPayload = {
    clientId,
    name: data.name,
    slug,
    description: data.description || '',
    parentCategory: data.parentCategory || null
  };

  const category = await categoryRepository.create(categoryPayload);

  logActivityResilient(clientId, operatorId, 'category_create', 'category', ipAddress);

  return category;
};

/**
 * List categories with pagination, search, and parentCategory filters
 */
const getCategories = async (clientId, filters = {}, options = {}) => {
  const queryFilters = {};

  if (filters.search) {
    queryFilters.name = { $regex: filters.search, $options: 'i' };
  }

  if (filters.parentCategory !== undefined) {
    queryFilters.parentCategory = filters.parentCategory || null;
  }

  return categoryRepository.findAll(clientId, queryFilters, options);
};

/**
 * Get category details by ID
 */
const getCategoryById = async (clientId, id) => {
  const category = await categoryRepository.findById(id);
  if (!category || category.isDeleted || category.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found.');
  }
  return category;
};

/**
 * Update an existing category
 */
const updateCategory = async (clientId, id, updateData, ipAddress, operatorId) => {
  const category = await Category.findById(id);
  if (!category || category.isDeleted || category.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found.');
  }

  // Handle parent category validation & circular reference protection
  if (updateData.parentCategory !== undefined) {
    if (updateData.parentCategory) {
      // Validate parent exists for the same tenant
      const parent = await Category.findOne({ _id: updateData.parentCategory, clientId, isDeleted: { $ne: true } });
      if (!parent) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Referenced parent category not found or access denied.');
      }
      // Check circular references
      await checkCircularReference(clientId, id, updateData.parentCategory);
    }
  }

  // Regenerate slug if name changes
  if (updateData.name && updateData.name !== category.name) {
    updateData.slug = await generateUniqueSlug(clientId, updateData.name);
  }

  const updatedCategory = await categoryRepository.update(id, updateData);

  logActivityResilient(clientId, operatorId, 'category_update', 'category', ipAddress);

  return updatedCategory;
};

/**
 * Soft delete a category, validating that it is not in use
 */
const deleteCategory = async (clientId, id, ipAddress, operatorId) => {
  const category = await Category.findById(id);
  if (!category || category.isDeleted || category.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found.');
  }

  // 1. Prevent delete if category has children
  const childrenCount = await Category.countDocuments({ parentCategory: id, isDeleted: { $ne: true } });
  if (childrenCount > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot delete category because it has active sub-categories.'
    );
  }

  // 2. Prevent delete if category is used by news articles
  const newsCount = await News.countDocuments({ category: id, isDeleted: { $ne: true } });
  if (newsCount > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot delete category because it is linked to active news articles.'
    );
  }

  await category.softDelete();

  logActivityResilient(clientId, operatorId, 'category_delete', 'category', ipAddress);

  return true;
};

/**
 * Seed the 12 default categories for a tenant
 */
const seedDefaultCategories = async (clientId, session = null) => {
  const defaultNames = [
    'Peshawar',
    'KPK',
    'Pakistan',
    'World',
    'Politics',
    'Sports',
    'Education',
    'Business',
    'Technology',
    'Health',
    'Jobs',
    'Entertainment'
  ];

  for (const name of defaultNames) {
    // Check if the slug already exists for this tenant client (resiliency)
    const slug = slugify(name);
    const exists = await Category.findOne({ clientId, slug, isDeleted: { $ne: true } }).session(session).exec();
    if (!exists) {
      const category = new Category({
        clientId,
        name,
        slug,
        description: `Default category for ${name}`,
        parentCategory: null
      });
      await category.save({ session });
    }
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  seedDefaultCategories
};
