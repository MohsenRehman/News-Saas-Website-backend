const webhookService = require('../services/webhook.service');
const httpStatus     = require('../constants/httpStatus');

/**
 * POST /api/v1/webhooks
 * Register a new webhook endpoint. Returns raw secret ONCE.
 */
const registerWebhook = async (req, res, next) => {
  try {
    const { url, events, description } = req.body;
    const data = await webhookService.registerWebhook(req.clientId, { url, events, description });
    return res.status(httpStatus.CREATED).json({
      success: true,
      message: 'Webhook registered successfully. Store the secret now — it will not be shown again.',
      data,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/webhooks
 * List all webhooks for the current tenant.
 */
const listWebhooks = async (req, res, next) => {
  try {
    const data = await webhookService.listWebhooks(req.clientId);
    return res.success(data, 'Webhooks retrieved successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/webhooks/:id
 * Get a single webhook by ID.
 */
const getWebhookById = async (req, res, next) => {
  try {
    const data = await webhookService.getWebhookById(req.params.id, req.clientId);
    return res.success(data, 'Webhook retrieved successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/v1/webhooks/:id
 * Update webhook url, events, description, or active status.
 */
const updateWebhook = async (req, res, next) => {
  try {
    const data = await webhookService.updateWebhook(req.params.id, req.clientId, req.body);
    return res.success(data, 'Webhook updated successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/v1/webhooks/:id
 * Soft-delete a webhook.
 */
const deleteWebhook = async (req, res, next) => {
  try {
    const data = await webhookService.deleteWebhook(req.params.id, req.clientId);
    return res.success(data, 'Webhook deleted successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/v1/webhooks/:id/rotate-secret
 * Generate a new HMAC signing secret. Returns new raw secret ONCE.
 */
const rotateSecret = async (req, res, next) => {
  try {
    const data = await webhookService.rotateSecret(req.params.id, req.clientId);
    return res.success(data, 'Webhook secret rotated. Store the new secret now — it will not be shown again.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/webhooks/:id/logs
 * Get paginated delivery logs for a webhook.
 */
const getWebhookLogs = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page, 10)  || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const data  = await webhookService.getWebhookLogs(req.params.id, req.clientId, { page, limit });
    return res.success(data, 'Webhook logs retrieved successfully.');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  registerWebhook,
  listWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  getWebhookLogs,
};
