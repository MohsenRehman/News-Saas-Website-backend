const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const campaignSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    body: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['draft', 'sending', 'sent', 'failed'],
      default: 'draft',
      index: true
    },
    recipientsCount: {
      type: Number,
      default: 0
    },
    sentAt: {
      type: Date,
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    stats: {
      queued:  { type: Number, default: 0 },
      sent:    { type: Number, default: 0 },
      failed:  { type: Number, default: 0 },
      opened:  { type: Number, default: 0 },
      clicked: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true
  }
);

campaignSchema.plugin(softDeletePlugin);

const Campaign = mongoose.model('Campaign', campaignSchema);
module.exports = Campaign;
