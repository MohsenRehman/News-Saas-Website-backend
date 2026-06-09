const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');
const { WEBHOOK_EVENT_SET } = require('../constants/webhookEvents');

const webhookSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * secretHash — HMAC-SHA256 key stored as a bcrypt hash.
     * The raw secret is returned ONCE at registration and never stored in plain text.
     * Verification during delivery: we use the raw secret from a secure store (env/vault)
     * or re-derive. For MVP: we store ONE-WAY hashed for audit, and keep raw in
     * a separate non-logged field during request lifecycle only.
     *
     * NOTE: We use crypto.createHmac for outbound signing, so we need the raw secret
     * for signing. We store secretHash (bcrypt) for tamper-detection audits,
     * and secretEncrypted (AES-256) for operational use. This follows the
     * "encrypt for use, hash for audit" pattern.
     */
    secretHash: {
      type: String,
      required: true,
      select: false, // Never returned in API responses
    },
    secretEncrypted: {
      type: String,
      required: true,
      select: false, // Never returned in API responses
    },
    events: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0 && arr.every((e) => WEBHOOK_EVENT_SET.has(e)),
        message: 'events must be a non-empty array of valid webhook event names.',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: fast lookup of active webhooks per tenant per event
webhookSchema.index({ clientId: 1, isActive: 1 });

webhookSchema.plugin(softDeletePlugin);

const Webhook = mongoose.model('Webhook', webhookSchema);

module.exports = Webhook;
