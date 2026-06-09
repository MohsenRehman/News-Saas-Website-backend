const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const stripeCustomerSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      unique: true,
      index: true
    },
    stripeCustomerId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    stripeSubscriptionId: {
      type: String,
      index: true,
      default: null // Will be null for lifetime one-time payment mode
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
    }
  },
  {
    timestamps: true
  }
);

stripeCustomerSchema.plugin(softDeletePlugin);

const StripeCustomer = mongoose.model('StripeCustomer', stripeCustomerSchema);

module.exports = StripeCustomer;
