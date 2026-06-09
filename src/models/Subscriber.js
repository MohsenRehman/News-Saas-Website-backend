const mongoose = require('mongoose');
const crypto = require('crypto');
const softDeletePlugin = require('../utils/softDelete');

const subscriberSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['active', 'unsubscribed'],
      default: 'active',
      index: true
    },
    unsubscribeToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(24).toString('hex')
    },
    unsubscribedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Enforce unique subscriber email per tenant
subscriberSchema.index({ clientId: 1, email: 1 }, { unique: true });
subscriberSchema.plugin(softDeletePlugin);

const Subscriber = mongoose.model('Subscriber', subscriberSchema);
module.exports = Subscriber;
