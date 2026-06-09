const express = require('express');
const multer = require('multer');
const validate = require('../../middleware/validate');
const mediaValidator = require('../../validators/media.validator');
const mediaController = require('../../controllers/media.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkPlanLimit } = require('../../middleware/subscription');

const router = express.Router();

// Multer memory storage config, capped at 50MB for video/document support
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

// Enforce authentication & RBAC roles globally on this router
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Upload endpoint - check storage limits atomically based on file size
router.post('/', upload.single('file'), checkPlanLimit('maxStorage', (req) => req.file ? req.file.size : 0), mediaController.uploadFile);

// Listing & CRUD details endpoints
router.get('/', validate(mediaValidator.getMedia), mediaController.getMediaList);
router.get('/:id', validate(mediaValidator.checkIdParam), mediaController.getMediaById);
router.put('/:id', validate(mediaValidator.renameMedia), mediaController.renameMedia);
router.delete('/:id', validate(mediaValidator.checkIdParam), mediaController.deleteMedia);

module.exports = router;
