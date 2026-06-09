const categoryService = require('../services/category.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Create a new Category
 */
const createCategory = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const category = await categoryService.createCategory(clientId, req.body, ipAddress, operatorId);
    return res.success(category, 'Category created successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * List categories for the tenant
 */
const getCategories = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { page, limit, search, parentCategory } = req.query;

    const filters = {};
    if (search) filters.search = search;
    if (parentCategory !== undefined) filters.parentCategory = parentCategory;

    const data = await categoryService.getCategories(clientId, filters, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 100
    });

    return res.success(data, 'Categories retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get details of a single Category
 */
const getCategoryById = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const category = await categoryService.getCategoryById(clientId, req.params.id);
    return res.success(category, 'Category details retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing Category
 */
const updateCategory = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const category = await categoryService.updateCategory(clientId, req.params.id, req.body, ipAddress, operatorId);
    return res.success(category, 'Category updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete a Category
 */
const deleteCategory = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const operatorId = req.user.id;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    await categoryService.deleteCategory(clientId, req.params.id, ipAddress, operatorId);
    return res.success(null, 'Category deleted successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
};
