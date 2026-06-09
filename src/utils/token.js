const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Generate a short-lived access token
 * @param {Object} user - User document
 * @returns {String} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      clientId: user.clientId
    },
    config.jwt.secret,
    {
      expiresIn: '15m'
    }
  );
};

/**
 * Generate a long-lived refresh token
 * @param {Object} user - User document
 * @returns {String} JWT refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user._id
    },
    config.jwt.refreshSecret,
    {
      expiresIn: '7d'
    }
  );
};

/**
 * Verify access token signature
 * @param {String} token - JWT token
 * @returns {Object} Payload
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};

/**
 * Verify refresh token signature
 * @param {String} token - JWT token
 * @returns {Object} Payload
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
