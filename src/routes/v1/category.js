const express = require('express');
const validate = require('../../middleware/validate');
const categoryValidator = require('../../validators/category.validator');
const categoryController = require('../../controllers/category.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Enforce auth & role restrictions globally on this router
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Base Category CRUD routes
router.post('/', validate(categoryValidator.createCategory), categoryController.createCategory);
router.get('/', validate(categoryValidator.getCategories), categoryController.getCategories);
router.get('/:id', validate(categoryValidator.checkIdParam), categoryController.getCategoryById);
router.put('/:id', validate(categoryValidator.updateCategory), categoryController.updateCategory);
router.delete('/:id', validate(categoryValidator.checkIdParam), categoryController.deleteCategory);

module.exports = router;
