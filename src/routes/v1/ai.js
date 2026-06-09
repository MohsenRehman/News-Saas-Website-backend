const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const aiValidator = require('../../validators/ai.validator');
const aiController = require('../../controllers/ai.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkPlanLimit } = require('../../middleware/subscription');

const router = express.Router();

// 1. Dedicated AI Rate Limiter (cap at 15 calls per 15 minutes per IP)
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many AI generation requests from this IP. Please try again after 15 minutes.'
});

// Enforce auth, RBAC roles, rate limiters, and plan limits globally on this router
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));
router.use(aiRateLimiter);
router.use(checkPlanLimit('maxAiRequests'));

// AI generation endpoints
router.post('/generate-article', validate(aiValidator.generateArticle), aiController.generateArticle);
router.post('/generate-summary', validate(aiValidator.generateSummary), aiController.generateSummary);
router.post('/generate-headlines', validate(aiValidator.generateHeadlines), aiController.generateHeadlines);
router.post('/generate-image', validate(aiValidator.generateImage), aiController.generateImage);

// Orchestrated title-to-article workflow pipeline
router.post('/workflow', validate(aiValidator.workflow), aiController.runWorkflow);

module.exports = router;
