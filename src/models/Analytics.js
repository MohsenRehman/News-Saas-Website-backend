const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const analyticsSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    newsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'News',
      default: null,
      index: true
    },
    path: {
      type: String,
      required: true,
      trim: true
    },
    referrer: {
      type: String,
      default: ''
    },
    visitorId: {
      type: String,
      required: true,
      index: true
    },
    device: {
      type: String,
      default: 'desktop'
    },
    country: {
      type: String,
      default: 'Unknown'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying statistics within timeframes
analyticsSchema.index({ clientId: 1, timestamp: -1 });

analyticsSchema.plugin(softDeletePlugin);

const Analytics = mongoose.model('Analytics', analyticsSchema);

module.exports = Analytics;
