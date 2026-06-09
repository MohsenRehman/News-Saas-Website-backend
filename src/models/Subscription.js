const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const subscriptionSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    plan: {
      type: String,
      enum: ['basic', 'professional', 'enterprise'],
      required: true
    },
    billingPeriod: {
      type: String,
      enum: ['monthly', 'yearly', 'lifetime'],
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'suspended'],
      default: 'active',
      index: true
    },
    startDate: {
      type: Date,
      default: Date.now,
      required: true
    },
    endDate: {
      type: Date,
      // If period is lifetime, endDate can be null/undefined
      required: function () {
        return this.billingPeriod !== 'lifetime';
      }
    }
  },
  {
    timestamps: true
  }
);

subscriptionSchema.plugin(softDeletePlugin);

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
