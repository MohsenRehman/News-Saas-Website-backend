const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const advertisementSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      enum: ['header', 'homepage_banner', 'sidebar', 'article_ads', 'footer'],
      required: true,
      index: true
    },
    imageUrl: {
      type: String,
      required: true
    },
    targetUrl: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'scheduled'],
      default: 'active',
      index: true
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date
    },
    impressions: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Compound index for active ads lookup
advertisementSchema.index({ clientId: 1, location: 1, status: 1 });

advertisementSchema.plugin(softDeletePlugin);

const Advertisement = mongoose.model('Advertisement', advertisementSchema);

module.exports = Advertisement;
