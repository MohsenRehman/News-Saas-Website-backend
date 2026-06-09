const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const usageStatsSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      unique: true, // One usage statistics document per tenant
      index: true
    },
    adminCount: {
      type: Number,
      default: 0
    },
    newsCount: {
      type: Number,
      default: 0
    },
    storageUsed: {
      type: Number, // in bytes
      default: 0
    },
    aiRequests: {
      type: Number,
      default: 0
    },
    apiRequests: {
      type: Number,
      default: 0
    },
    emailSent: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

usageStatsSchema.plugin(softDeletePlugin);

const UsageStats = mongoose.model('UsageStats', usageStatsSchema);

module.exports = UsageStats;
