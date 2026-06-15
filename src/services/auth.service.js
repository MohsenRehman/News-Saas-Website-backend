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
 * Generate password recovery reset token
 * @param {String} email
 * @returns {Promise<String>} Plain text reset token to send via email
 */
const forgotPassword = async (email) => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    // Return empty status or handle generically to prevent email enumeration
    throw new AppError(httpStatus.NOT_FOUND, 'No account found with this email');
  }

  // Generate random bytes token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.passwordResetToken = hashedResetToken;
  // Hard expiry enforced server-side — TOKEN_EXPIRY_MINUTES is the single source of truth
  // shared between auth.service.js and email.service.js to keep UI text in sync
  user.passwordResetExpires = Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000;

  await user.save();

  let tenant = {};
  if (user.clientId) {
    try {
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
      logger.error(`[Forgot Password Email Resolve Error] ${err.message}`, err);
    }
  }

  // Send password reset email (fire-and-forget — resilient, non-blocking)
  sendPasswordResetEmail(
    { name: user.name, email: user.email },
    resetToken,
    tenant
  ).catch(() => {}); // Email failure never breaks the password reset flow

  return resetToken;
};

/**
 * Reset user password using the validation token
 * @param {String} resetToken
 * @param {String} newPassword
 * @returns {Promise<Boolean>}
 */
const resetPassword = async (resetToken, newPassword) => {
  const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Step 1: Find by token hash ONLY (no expiry filter) — so we can always clean up expired tokens
  const user = await userRepository.findUserByTokenHashOnly(hashedResetToken);

  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Password reset token is invalid or does not exist.');
  }

  // Step 2: Hard backend expiry enforcement (feedback requirement)
  // Double-check expiry here — defends against clock skew and direct DB manipulation.
  // Also ensures expired tokens are always cleared from DB (not just silently rejected).
  if (!user.passwordResetExpires || user.passwordResetExpires < Date.now()) {
    // Always clean up expired tokens so DB stays tidy
    user.passwordResetToken   = null;
    user.passwordResetExpires = null;
    await user.save();
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Password reset token has expired. Tokens are valid for ${TOKEN_EXPIRY_MINUTES} minutes. Please request a new reset link.`
    );
  }

  user.password             = newPassword;
  user.passwordResetToken   = null;
  user.passwordResetExpires = null;

  await user.save();
  return true;
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
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile
};
