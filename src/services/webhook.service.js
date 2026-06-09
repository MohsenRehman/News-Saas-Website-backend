const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const Webhook    = require('../models/Webhook');
const WebhookLog = require('../models/WebhookLog');
const AppError   = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const { WEBHOOK_EVENT_SET } = require('../constants/webhookEvents');
const config     = require('../config/config');
const logger     = require('../config/logger');

// ────────────────────────────────────────────────────────────────────────────
// AES-256-CBC helpers for webhook secret encryption
// "Encrypt for use, hash for audit" pattern
// ────────────────────────────────────────────────────────────────────────────

const ALGO      = 'aes-256-cbc';
const ENC_KEY   = Buffer.from(config.webhookEncryptionKey, 'hex'); // 32 bytes
const IV_LENGTH = 16;

function encryptSecret(rawSecret) {
  const iv         = crypto.randomBytes(IV_LENGTH);
  const cipher     = crypto.createCipheriv(ALGO, ENC_KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(rawSecret, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(encryptedValue) {
  const [ivHex, encHex] = encryptedValue.split(':');
  const iv        = Buffer.from(ivHex, 'hex');
  const enc       = Buffer.from(encHex, 'hex');
  const decipher  = crypto.createDecipheriv(ALGO, ENC_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
  return decrypted.toString('utf8');
}

// ────────────────────────────────────────────────────────────────────────────
// HMAC signing
// ────────────────────────────────────────────────────────────────────────────

function signPayload(rawSecret, payload, timestamp) {
  const body = JSON.stringify(payload);
  const data = `${timestamp}.${body}`;
  return `sha256=${crypto.createHmac('sha256', rawSecret).update(data).digest('hex')}`;
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP Delivery with timeout + retry (feedback: 5–10s timeout per attempt)
// ────────────────────────────────────────────────────────────────────────────

const DELIVERY_TIMEOUT_MS  = 8000;  // 8s max per attempt
const MAX_RETRIES          = 3;
const RETRY_DELAYS_MS      = [1000, 2000, 4000]; // exponential back-off

async function deliverWithTimeout(url, body, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Delivery timeout after ${DELIVERY_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

async function deliverWebhook(webhook, event, payload) {
  // Decrypt the raw secret for HMAC signing
  let rawSecret;
  try {
    rawSecret = decryptSecret(webhook.secretEncrypted);
  } catch {
    logger.error(`[Webhook] Failed to decrypt secret for webhook ${webhook._id}`);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signPayload(rawSecret, payload, timestamp);
  const headers   = {
    'X-Webhook-Event':     event,
    'X-Webhook-Signature': signature,
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Id':        webhook._id.toString(),
  };

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;

    // Create a pending log entry for this attempt
    const logEntry = await WebhookLog.create({
      webhookId: webhook._id,
      clientId:  webhook.clientId,
      event,
      payload,
      status:    'pending',
      attempt,
    });

    try {
      if (attempt > 1) {
        // Exponential back-off before retry
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 2]));
      }

      const response = await deliverWithTimeout(webhook.url, payload, headers);
      const statusCode  = response.status;
      const text        = await response.text().catch(() => '');
      const responseBody = text.slice(0, 500);

      if (response.ok) {
        await WebhookLog.findByIdAndUpdate(logEntry._id, {
          status:      'success',
          statusCode,
          responseBody,
          deliveredAt: new Date(),
        });
        logger.info(`[Webhook] Delivered '${event}' to ${webhook.url} (attempt ${attempt}) → ${statusCode}`);
        return; // Success — stop retrying
      }

      // Non-2xx response: log as failed attempt, retry if possible
      await WebhookLog.findByIdAndUpdate(logEntry._id, {
        status:       attempt === MAX_RETRIES ? 'failed' : 'pending',
        statusCode,
        responseBody,
        errorMessage: `Non-OK response: ${statusCode}`,
      });
      lastError = `HTTP ${statusCode}`;
    } catch (err) {
      lastError = err.message;
      await WebhookLog.findByIdAndUpdate(logEntry._id, {
        status:       attempt === MAX_RETRIES ? 'failed' : 'pending',
        errorMessage: err.message.slice(0, 500),
      });
      logger.warn(`[Webhook] Attempt ${attempt}/${MAX_RETRIES} failed for ${webhook.url}: ${err.message}`);
    }
  }

  logger.error(`[Webhook] All ${MAX_RETRIES} delivery attempts failed for webhook ${webhook._id}. Last error: ${lastError}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Public Service Functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * registerWebhook
 * Generates raw secret, encrypts for storage, bcrypt-hashes for audit.
 * Returns the raw secret ONCE — never again retrievable.
 */
const registerWebhook = async (clientId, { url, events, description }) => {
  // Validate events against known event set
  const invalid = events.filter((e) => !WEBHOOK_EVENT_SET.has(e));
  if (invalid.length > 0) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid webhook event(s): ${invalid.join(', ')}`);
  }

  // Generate a cryptographically secure 32-byte raw secret
  const rawSecret       = crypto.randomBytes(32).toString('hex');
  const secretEncrypted = encryptSecret(rawSecret);
  const secretHash      = await bcrypt.hash(rawSecret, 10);

  const webhook = await Webhook.create({
    clientId,
    url,
    events,
    description: description || '',
    secretEncrypted,
    secretHash,
    isActive: true,
  });

  // Return webhook without secret fields, but include rawSecret once
  const out = webhook.toObject();
  delete out.secretEncrypted;
  delete out.secretHash;
  out.secret = rawSecret; // Shown ONCE — user must store this

  return out;
};

/**
 * emitEvent
 * Fires outbound webhooks for a tenant event.
 * Validates event name first (avoids DB query for unknown events).
 * Fire-and-forget: does not await delivery.
 */
const emitEvent = (clientId, eventName, payload) => {
  // [Feedback] Event validation at emit level — avoid unnecessary DB queries
  if (!WEBHOOK_EVENT_SET.has(eventName)) {
    logger.warn(`[Webhook] emitEvent called with unknown event '${eventName}' — skipped.`);
    return;
  }

  // Fire-and-forget: query + deliver async, never block the request
  setImmediate(async () => {
    try {
      const webhooks = await Webhook.find({
        clientId,
        isActive:  true,
        isDeleted: false,
        events:    eventName, // Mongo array contains query
      }).select('+secretEncrypted');

      if (!webhooks.length) return;

      await Promise.allSettled(
        webhooks.map((wh) => deliverWebhook(wh, eventName, payload))
      );
    } catch (err) {
      logger.error(`[Webhook] emitEvent error for event '${eventName}': ${err.message}`);
    }
  });
};

/**
 * listWebhooks
 * Returns all active webhooks for a tenant (secrets excluded).
 */
const listWebhooks = async (clientId) => {
  return Webhook.find({ clientId, isDeleted: false })
    .select('-secretEncrypted -secretHash')
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * getWebhookById
 * Returns a single webhook belonging to the tenant.
 */
const getWebhookById = async (webhookId, clientId) => {
  const webhook = await Webhook.findOne({ _id: webhookId, clientId, isDeleted: false })
    .select('-secretEncrypted -secretHash')
    .lean();

  if (!webhook) {
    throw new AppError(httpStatus.NOT_FOUND, 'Webhook not found.');
  }
  return webhook;
};

/**
 * updateWebhook
 * Update url, events, description, or isActive status.
 */
const updateWebhook = async (webhookId, clientId, updates) => {
  const webhook = await Webhook.findOne({ _id: webhookId, clientId, isDeleted: false });
  if (!webhook) throw new AppError(httpStatus.NOT_FOUND, 'Webhook not found.');

  if (updates.events) {
    const invalid = updates.events.filter((e) => !WEBHOOK_EVENT_SET.has(e));
    if (invalid.length > 0) {
      throw new AppError(httpStatus.BAD_REQUEST, `Invalid webhook event(s): ${invalid.join(', ')}`);
    }
    webhook.events = updates.events;
  }
  if (updates.url         !== undefined) webhook.url         = updates.url;
  if (updates.description !== undefined) webhook.description = updates.description;
  if (updates.isActive    !== undefined) webhook.isActive    = updates.isActive;

  await webhook.save();
  const out = webhook.toObject();
  delete out.secretEncrypted;
  delete out.secretHash;
  return out;
};

/**
 * deleteWebhook
 * Soft-deletes a webhook.
 */
const deleteWebhook = async (webhookId, clientId) => {
  const webhook = await Webhook.findOne({ _id: webhookId, clientId, isDeleted: false });
  if (!webhook) throw new AppError(httpStatus.NOT_FOUND, 'Webhook not found.');

  await webhook.softDelete();
  return { message: 'Webhook deleted successfully.' };
};

/**
 * rotateSecret
 * Generates a new secret, re-encrypts, re-hashes. Returns new raw secret once.
 */
const rotateSecret = async (webhookId, clientId) => {
  const webhook = await Webhook.findOne({ _id: webhookId, clientId, isDeleted: false })
    .select('+secretEncrypted +secretHash');

  if (!webhook) throw new AppError(httpStatus.NOT_FOUND, 'Webhook not found.');

  const newRawSecret    = crypto.randomBytes(32).toString('hex');
  webhook.secretEncrypted = encryptSecret(newRawSecret);
  webhook.secretHash      = await bcrypt.hash(newRawSecret, 10);
  await webhook.save();

  return { secret: newRawSecret }; // Shown ONCE
};

/**
 * getWebhookLogs
 * Paginated delivery logs for a webhook.
 */
const getWebhookLogs = async (webhookId, clientId, { page = 1, limit = 20 } = {}) => {
  // Verify ownership
  const webhook = await Webhook.findOne({ _id: webhookId, clientId, isDeleted: false }).lean();
  if (!webhook) throw new AppError(httpStatus.NOT_FOUND, 'Webhook not found.');

  const skip  = (page - 1) * limit;
  const total = await WebhookLog.countDocuments({ webhookId });
  const logs  = await WebhookLog.find({ webhookId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    logs,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

module.exports = {
  registerWebhook,
  emitEvent,
  listWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
  getWebhookLogs,
};
