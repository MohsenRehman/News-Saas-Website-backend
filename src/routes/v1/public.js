const express = require('express');
const validate = require('../../middleware/validate');
const publicValidator = require('../../validators/public.validator');
const publicController = require('../../controllers/public.controller');

const router = express.Router();

// Public website routes (resolved under tenant context, exempt from JWT auth gating)
router.get('/settings', publicController.getWebsiteSettings);
router.get('/categories', publicController.getCategories);
router.get('/news', validate(publicValidator.getPublicNews), publicController.getPublishedNews);
router.get('/news/:slug', publicController.getNewsBySlug);
router.post('/contacts', validate(publicValidator.createContact), publicController.createContactSubmission);
router.get('/advertisements', validate(publicValidator.getPublicAds), publicController.getActiveAds);

module.exports = router;
