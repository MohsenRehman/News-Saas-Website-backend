const User = require('../models/User');

/**
 * Find user by email address
 * @param {String} email
 * @returns {Promise<User|null>}
 */
const findByEmail = async (email) => {
  return User.findOne({ email });
};

/**
 * Find user by user ID
 * @param {String} id
 * @returns {Promise<User|null>}
 */
const findById = async (id) => {
  return User.findById(id);
};

/**
 * Create a new user document
 * @param {Object} userData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<User>}
 */
const createUser = async (userData, session) => {
  const user = new User(userData);
  return user.save({ session });
};

/**
 * Update user document details by ID
 * @param {String} userId
 * @param {Object} updateData
 * @returns {Promise<User|null>}
 */
const updateUser = async (userId, updateData) => {
  return User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });
};

/**
 * Find user with active password reset token
 * @param {String} token - Hashed or unhashed reset token
 * @returns {Promise<User|null>}
 */
const findUserByResetToken = async (token) => {
  return User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: Date.now() }
  });
};

/**
 * Find user by reset token hash ONLY (without expiry filter).
 * Used by auth.service.resetPassword for hard expiry enforcement + DB cleanup.
 * @param {String} tokenHash - SHA-256 hashed reset token
 * @returns {Promise<User|null>}
 */
const findUserByTokenHashOnly = async (tokenHash) => {
  return User.findOne({ passwordResetToken: tokenHash });
};

/**
 * Get paginated list of tenant admins/editors
 * @param {String} clientId
 * @param {Object} filters
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const findAllTenantUsers = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const queryFilters = {
    clientId,
    role: 'admin',
    isDeleted: { $ne: true },
    ...filters
  };

  const total = await User.countDocuments(queryFilters);
  const results = await User.find(queryFilters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .exec();

  return { results, total, page, limit };
};

module.exports = {
  findByEmail,
  findById,
  createUser,
  updateUser,
  findUserByResetToken,
  findUserByTokenHashOnly,
  findAllTenantUsers
};
