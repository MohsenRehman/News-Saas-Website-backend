const authService = require('../services/auth.service');
const userRepository = require('../repositories/user.repository');
const httpStatus = require('../constants/httpStatus');
const AppError = require('../utils/appError');
const config = require('../config/config');
const ActivityLog = require('../models/ActivityLog');
const logger = require('../config/logger');
const tokenUtil = require('../utils/token');
const Client = require('../models/Client');

// Resilient logging helper
const logActivityResilient = async (clientId, userId, action, module, ipAddress) => {
  if (!clientId) return; // Skip logs for platform level owners
  try {
    await ActivityLog.create({
      clientId,
      userId,
      action,
      module,
      ipAddress,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error(`[ActivityLog Error] Auth activity log write failed: ${err.message}`, err);
  }
};

// Cookie options for secure refresh tokens
const cookieOptions = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: config.env === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};

/**
 * Handle user login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';

    const { user, tokens } = await authService.loginWithEmailAndPassword(
      email,
      password,
      ipAddress,
      userAgent
    );

    // Set refresh token in httpOnly secure cookie
    res.cookie('refreshToken', tokens.refreshToken, cookieOptions);

    // Log login activity
    await logActivityResilient(user.clientId, user.id, 'login', 'auth', ipAddress);

    return res.success({
      user,
      accessToken: tokens.accessToken
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle user logout (idempotent, relaxed token checks)
 */
const logout = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = tokenUtil.verifyAccessToken(token);
        const user = await userRepository.findById(decoded.id);
        if (user && user.status === 'active') {
          await logActivityResilient(user.clientId, user._id, 'logout', 'auth', ipAddress);
        }
      } catch (err) {
        // Safe skip if token is invalid or expired
        logger.info(`[Logout Audit] Skipped logging due to invalid or expired token: ${err.message}`);
      }
    }

    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie('refreshToken', clearOptions);
    return res.success(null, 'Logout successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle access token refresh
 */
const refreshTokens = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Refresh token not found');
    }

    const accessToken = await authService.refreshAuth(refreshToken);
    return res.success({ accessToken }, 'Token refreshed successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Request password reset link (mock)
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const resetToken = await authService.forgotPassword(email);

    // In production we send this token via email.
    // For easy API testing in Thunder Client, we will return the token in the response data.
    return res.success({
      resetToken,
      info: 'Normally emailed to client. Included in response payload for validation.'
    }, 'Password reset link generated');
  } catch (error) {
    next(error);
  }
};

/**
 * Complete password reset using token
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.query;
    const { password } = req.body;

    await authService.resetPassword(token, password);
    return res.success(null, 'Password reset successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Change authenticated user password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    await authService.changePassword(userId, currentPassword, newPassword);
    return res.success(null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get profile of current authenticated user
 */
const getMe = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id);
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found');
    }

    let tenantSubdomain = null;
    if (user.clientId) {
      const client = await Client.findById(user.clientId);
      if (client) {
        tenantSubdomain = client.subdomain;
      }
    }

    return res.success({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
      tenantSubdomain,
      status: user.status
    }, 'User profile retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe
};
