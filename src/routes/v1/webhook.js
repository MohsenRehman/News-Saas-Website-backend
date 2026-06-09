const express                     = require('express');
const { authenticate, authorize }  = require('../../middleware/auth');
const { checkSubscription }        = require('../../middleware/subscription');
const validate                    = require('../../middleware/validate');
const webhookValidator            = require('../../validators/webhook.validator');
const webhookController           = require('../../controllers/webhook.controller');

const router = express.Router();

// All webhook management routes require authentication
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

/**
 * POST /api/v1/webhooks
 * Register a new webhook endpoint (requires active subscription)
 */
router.post(
  '/',
  checkSubscription,
  validate(webhookValidator.registerWebhook),
  webhookController.registerWebhook
);

/**
 * GET /api/v1/webhooks
 * List all webhooks for the current tenant
 */
router.get('/', webhookController.listWebhooks);

/**
 * GET /api/v1/webhooks/:id
 * Get a single webhook by ID
 */
router.get('/:id', webhookController.getWebhookById);

/**
 * PUT /api/v1/webhooks/:id
 * Update webhook URL, events, description, or active status
 */
router.put(
  '/:id',
  validate(webhookValidator.updateWebhook),
  webhookController.updateWebhook
);

/**
 * DELETE /api/v1/webhooks/:id
 * Soft-delete a webhook
 */
router.delete('/:id', webhookController.deleteWebhook);

/**
 * PATCH /api/v1/webhooks/:id/rotate-secret
 * Rotate the HMAC signing secret for a webhook
 */
router.patch('/:id/rotate-secret', webhookController.rotateSecret);

/**
 * GET /api/v1/webhooks/:id/logs
 * Get paginated delivery attempt logs for a webhook
 * Query: ?page=1&limit=20
 */
router.get('/:id/logs', webhookController.getWebhookLogs);

module.exports = router;
