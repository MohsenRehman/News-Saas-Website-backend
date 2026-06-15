const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const newsletterValidator = require('../../validators/newsletter.validator');
const newsletterController = require('../../controllers/newsletter.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkSubscription } = require('../../middleware/subscription');

const router = express.Router();

// Rate limiter for public subscriptions (Max 5 subscription attempts per 15 minutes per IP)
const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many subscription requests from this IP. Please try again after 15 minutes.'
});

// ─── Public Endpoints ────────────────────────────────────────────────────────

// Public subscribe
router.post(
  '/subscribe',
  subscribeLimiter,
  validate(newsletterValidator.subscribe),
  newsletterController.subscribe
);

// Public unsubscribe (triggered via link click in browser)
router.get(
  '/unsubscribe',
  validate(newsletterValidator.unsubscribe),
  newsletterController.unsubscribe
);

// ─── Admin/Editor Endpoints ──────────────────────────────────────────────────

// Admin routes require authentication, active subscription verification, and editor roles
router.use(authenticate);
router.use(checkSubscription);
router.use(authorize('admin', 'super_admin'));

// Subscribers list
router.get(
  '/admin/subscribers',
  validate(newsletterValidator.getSubscribers),
  newsletterController.getSubscribers
);

// Delete/Unsubscribe subscriber
router.delete(
  '/admin/subscribers/:subscriberId',
  validate(newsletterValidator.checkIdParam),
  newsletterController.removeSubscriber
);

// Campaigns CRUD & Dispatching
router.post(
  '/admin/campaigns',
  validate(newsletterValidator.createCampaign),
  newsletterController.createCampaign
);

router.get(
  '/admin/campaigns',
  validate(newsletterValidator.getCampaigns),
  newsletterController.getCampaigns
);

router.put(
  '/admin/campaigns/:campaignId',
  validate(newsletterValidator.updateCampaign),
  newsletterController.updateCampaign
);

router.delete(
  '/admin/campaigns/:campaignId',
  validate(newsletterValidator.checkIdParam),
  newsletterController.deleteCampaign
);

router.post(
  '/admin/campaigns/:campaignId/send',
  validate(newsletterValidator.checkIdParam),
  newsletterController.sendCampaign
);

module.exports = router;
