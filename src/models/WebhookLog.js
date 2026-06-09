const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema(
  {
    webhookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Webhook',
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      index: true,
    },
    statusCode: {
      type: Number,
      default: null,
    },
    responseBody: {
      type: String,
      maxlength: 500,
      default: '',
    },
    attempt: {
      type: Number,
      default: 1,
      min: 1,
      max: 3,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      maxlength: 500,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient per-webhook log queries with sort
webhookLogSchema.index({ webhookId: 1, createdAt: -1 });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = WebhookLog;
