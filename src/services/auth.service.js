const crypto = require('crypto');
const userRepository = require('../repositories/user.repository');
const tokenUtil = require('../utils/token');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const { sendPasswordResetEmail, TOKEN_EXPIRY_MINUTES } = require('./email.service');
const Client = require('../models/Client');

/**
 * Login user with email and password
 * @param {String} email
 * @param {String} password
 * @param {String} ipAddress
 * @param {String} userAgent
 * @returns {Promise<Object>} User data and generated tokens
 */
const loginWithEmailAndPassword = async (email, password, ipAddress, userAgent) => {
  const user = await userRepository.findByEmail(email);
  
  if (!user || user.status !== 'active') {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }

  const isPasswordMatch = await user.isPasswordMatch(password);
  if (!isPasswordMatch) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }

  // Update last login details and history logs
  user.lastLogin = new Date();
  user.loginHistory.push({
    ipAddress,
    userAgent,
    timestamp: new Date()
  });

  // Limit login logs storage to recent 20 events
  if (user.loginHistory.length > 20) {
    user.loginHistory.shift();
  }

  await user.save();

  const accessToken = tokenUtil.generateAccessToken(user);
  const refreshToken = tokenUtil.generateRefreshToken(user);

  let tenantSubdomain = null;
  if (user.clientId) {
    const client = await Client.findById(user.clientId);
    if (client) {
      tenantSubdomain = client.subdomain;
    }
  }

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
      tenantSubdomain
    },
    tokens: {
      accessToken,
      refreshToken
    }
  };
};

/**
 * Regenerate a new access token using a valid refresh token
 * @param {String} refreshToken
 * @returns {Promise<String>} New access token
 */
const refreshAuth = async (refreshToken) => {
  try {
    const payload = tokenUtil.verifyRefreshToken(refreshToken);
    const user = await userRepository.findById(payload.id);

    if (!user || user.status !== 'active') {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Please authenticate');
    }

    return tokenUtil.generateAccessToken(user);
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Request password reset OTP
 * @param {String} email
 * @param {String} ipAddress
 * @param {String} userAgent
 * @returns {Promise<void>}
 */
const forgotPasswordOTP = async (email, ipAddress, userAgent) => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    // Return early to prevent email enumeration timing attacks
    return;
  }

  // 1. Cooldown check
  if (user.passwordResetOTPResendAvailableAt && user.passwordResetOTPResendAvailableAt > Date.now()) {
    const secondsLeft = Math.ceil((user.passwordResetOTPResendAvailableAt - Date.now()) / 1000);
    throw new AppError(httpStatus.BAD_REQUEST, `Please wait ${secondsLeft} seconds before requesting a new OTP.`);
  }

  // 2. Generate secure 6-digit OTP
  const crypto = require('crypto');
  const otp = crypto.randomInt(100000, 1000000).toString();

  // 3. Hash OTP (8 rounds to match standard hashing configuration)
  const bcrypt = require('bcryptjs');
  const hashedOtp = await bcrypt.hash(otp, 8);

  // 4. Update user model, explicitly resetting attempts and verification status
  user.passwordResetOTP = hashedOtp;
  user.passwordResetOTPExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
  user.passwordResetOTPVerified = false;
  user.passwordResetOTPAttempts = 0;
  user.passwordResetOTPResendAvailableAt = Date.now() + 60 * 1000; // 60 seconds cooldown

  await user.save();

  // 5. Send OTP via email (resilient fire-and-forget)
  let tenant = {};
  if (user.clientId) {
    try {
      const Client = require('../models/Client');
      const client = await Client.findById(user.clientId);
      if (client) {
        const WebsiteSettings = require('../models/WebsiteSettings');
        const settings = await WebsiteSettings.findOne({ clientId: user.clientId });
        const config = require('../config/config');
        const { getClientUrl } = require('./email.service');
        const clientUrl = getClientUrl(client, config.clientUrl);

        tenant = {
          siteName: settings ? settings.siteName : client.name,
          contactEmail: settings ? settings.contactEmail : '',
          clientUrl
        };
      }
    } catch (err) {
      const logger = require('../config/logger');
      logger.error(`[Forgot Password OTP Email Resolve Error] ${err.message}`, err);
    }
  }

  const { sendPasswordResetOTPEmail } = require('./email.service');
  sendPasswordResetOTPEmail(
    { name: user.name, email: user.email },
    otp,
    tenant
  ).catch(() => {});
};

/**
 * Verify password reset OTP and generate temporary resetToken
 * @param {String} email
 * @param {String} otp
 * @returns {Promise<String>} Plain text resetToken
 */
const verifyResetOtp = async (email, otp) => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  if (!user.passwordResetOTP) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  if (user.passwordResetOTPExpiresAt && user.passwordResetOTPExpiresAt < Date.now()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP has expired. Please request a new OTP.');
  }

  if (user.passwordResetOTPAttempts >= 5) {
    // Invalidate and save
    user.passwordResetOTP = null;
    user.passwordResetOTPExpiresAt = null;
    user.passwordResetOTPAttempts = 0;
    user.passwordResetOTPVerified = false;
    user.passwordResetOTPResendAvailableAt = null;
    await user.save();
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  const bcrypt = require('bcryptjs');
  const isMatch = await bcrypt.compare(otp, user.passwordResetOTP);

  if (!isMatch) {
    user.passwordResetOTPAttempts += 1;
    if (user.passwordResetOTPAttempts >= 5) {
      user.passwordResetOTP = null;
      user.passwordResetOTPExpiresAt = null;
      user.passwordResetOTPAttempts = 0;
      user.passwordResetOTPVerified = false;
      user.passwordResetOTPResendAvailableAt = null;
    }
    await user.save();
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP');
  }

  // Generate temporary reset token (32 bytes hex)
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Clear all OTP metadata and store reset session details
  user.passwordResetToken = hashedResetToken;
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes session TTL
  user.passwordResetOTP = null;
  user.passwordResetOTPExpiresAt = null;
  user.passwordResetOTPAttempts = 0;
  user.passwordResetOTPResendAvailableAt = null;
  user.passwordResetOTPVerified = true;

  await user.save();
  return resetToken;
};

/**
 * Reset password using temporary resetToken
 * @param {String} resetToken
 * @param {String} newPassword
 * @returns {Promise<User>} The updated user document
 */
const resetPasswordOTP = async (resetToken, newPassword) => {
  const crypto = require('crypto');
  const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  const user = await userRepository.findUserByTokenHashOnly(hashedResetToken);
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Reset password token is invalid or does not exist.');
  }

  if (!user.passwordResetExpires || user.passwordResetExpires < Date.now()) {
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.passwordResetOTPVerified = false;
    await user.save();
    throw new AppError(httpStatus.BAD_REQUEST, 'Password reset token has expired. Please request a new OTP.');
  }

  // Update password and clear session metadata
  user.password = newPassword;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.passwordResetOTPVerified = false;

  await user.save();
  return user;
};

/**
 * Change current password
 * @param {String} userId
 * @param {String} currentPassword
 * @param {String} newPassword
 * @returns {Promise<Boolean>}
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const isPasswordMatch = await user.isPasswordMatch(currentPassword);
  if (!isPasswordMatch) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Incorrect current password');
  }

  user.password = newPassword;
  await user.save();
  return true;
};

/**
 * Update authenticated user's profile info (name, email)
 * @param {String} userId
 * @param {Object} updateData
 * @returns {Promise<Object>} Updated user profile
 */
const updateProfile = async (userId, updateData) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (updateData.email) {
    const emailLower = updateData.email.toLowerCase();
    // Check if email is already taken by another user
    const existingUser = await userRepository.findByEmail(emailLower);
    if (existingUser && existingUser._id.toString() !== userId.toString()) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Email is already registered by another user globally.');
    }
    user.email = emailLower;
  }

  if (updateData.name) {
    user.name = updateData.name;
  }

  if (updateData.profileImage !== undefined) {
    user.profileImage = updateData.profileImage;
  }

  await user.save();
  
  let tenantSubdomain = null;
  if (user.clientId) {
    const client = await Client.findById(user.clientId);
    if (client) {
      tenantSubdomain = client.subdomain;
    }
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    profileImage: user.profileImage || '',
    tenantSubdomain,
    status: user.status
  };
};

module.exports = {
  loginWithEmailAndPassword,
  refreshAuth,
  forgotPasswordOTP,
  verifyResetOtp,
  resetPasswordOTP,
  changePassword,
  updateProfile
};
