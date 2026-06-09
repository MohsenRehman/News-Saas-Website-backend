const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const notificationSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    type: {
      type: String,
      enum: ['admin', 'system', 'subscription_alert'],
      default: 'system',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying user notifications
notificationSchema.index({ clientId: 1, userId: 1, isRead: 1 });

notificationSchema.plugin(softDeletePlugin);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
