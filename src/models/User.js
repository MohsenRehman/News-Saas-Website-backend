const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const softDeletePlugin = require('../utils/softDelete');

const loginHistorySchema = new mongoose.Schema({
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      // Null is allowed for global platform owners
      default: null,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['platform_owner', 'super_admin', 'admin'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true
    },
    profileImage: {
      type: String,
      default: ''
    },
    lastLogin: {
      type: Date
    },
    loginHistory: [loginHistorySchema],
    passwordResetToken: {
      type: String,
      default: null
    },
    passwordResetExpires: {
      type: Date,
      default: null
    },
    passwordResetOTP: {
      type: String,
      default: null
    },
    passwordResetOTPExpiresAt: {
      type: Date,
      default: null
    },
    passwordResetOTPVerified: {
      type: Boolean,
      default: false
    },
    passwordResetOTPAttempts: {
      type: Number,
      default: 0
    },
    passwordResetOTPResendAvailableAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook to hash password before saving to DB
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 8);
  }
  next();
});

/**
 * Check if password matches the user's hashed password
 * @param {String} password
 * @returns {Promise<Boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.plugin(softDeletePlugin);

const User = mongoose.model('User', userSchema);

module.exports = User;
