const express = require('express');
const validate = require('../../middleware/validate');
const advertisementValidator = require('../../validators/advertisement.validator');
const advertisementController = require('../../controllers/advertisement.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// 1. Public Analytics Endpoints (No auth required, resolved strictly via tenant middleware)
router.post('/:id/impression', validate(advertisementValidator.checkIdParam), advertisementController.trackImpression);
router.post('/:id/click', validate(advertisementValidator.checkIdParam), advertisementController.trackClick);

// 2. Private Administrative CRUD Endpoints (Enforces authentication and platform owner role)
router.post('/', authenticate, authorize('platform_owner'), validate(advertisementValidator.createAd), advertisementController.createAd);
router.get('/', authenticate, authorize('platform_owner'), validate(advertisementValidator.getAds), advertisementController.getAds);
router.get('/:id', authenticate, authorize('platform_owner'), validate(advertisementValidator.checkIdParam), advertisementController.getAdById);
router.put('/:id', authenticate, authorize('platform_owner'), validate(advertisementValidator.updateAd), advertisementController.updateAd);
router.delete('/:id', authenticate, authorize('platform_owner'), validate(advertisementValidator.checkIdParam), advertisementController.deleteAd);

module.exports = router;
