const mongoose = require('mongoose');

const bannedEmailSchema = new mongoose.Schema(
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
      lowercase: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      enum: ['banned', 'muted'],
      default: 'banned',
      index: true
    },
    reason: {
      type: String,
      default: ''
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Enforce unique ban per email address per tenant client
bannedEmailSchema.index({ clientId: 1, email: 1 }, { unique: true });

const BannedEmail = mongoose.model('BannedEmail', bannedEmailSchema);

module.exports = BannedEmail;
