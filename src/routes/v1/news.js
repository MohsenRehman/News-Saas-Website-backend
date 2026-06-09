const express = require('express');
const validate = require('../../middleware/validate');
const newsValidator = require('../../validators/news.validator');
const newsController = require('../../controllers/news.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Enforce auth & role restrictions globally on this router
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Base CRUD endpoints
router.post('/', validate(newsValidator.createNews), newsController.createNews);
router.get('/', newsController.getNews);
router.get('/:id', newsController.getNewsById);
router.put('/:id', validate(newsValidator.updateNews), newsController.updateNews);
router.delete('/:id', newsController.deleteNews);

// Special editor action endpoints
router.post('/:id/duplicate', newsController.duplicateNews);
router.get('/:id/preview', newsController.previewNews);
router.patch('/:id/publish', newsController.publishNews);
router.patch('/:id/schedule', validate(newsValidator.scheduleNews), newsController.scheduleNews);

module.exports = router;
