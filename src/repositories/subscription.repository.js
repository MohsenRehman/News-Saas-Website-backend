const Subscription = require('../models/Subscription');

/**
 * Create a new Subscription
 * @param {Object} data - Subscription fields
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Subscription>}
 */
const create = async (data, session) => {
  const subscription = new Subscription(data);
  return subscription.save({ session });
};

/**
 * Find recent subscription details by client ID
 * @param {String} clientId
 * @returns {Promise<Subscription|null>}
 */
const findByClientId = async (clientId) => {
  return Subscription.findOne({ clientId, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .exec();
};

/**
 * Update Subscription details
 * @param {String} id
 * @param {Object} updateData
 * @param {Object} [session] - Mongoose transaction session
 * @returns {Promise<Subscription|null>}
 */
const update = async (id, updateData, session) => {
  return Subscription.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
    session
  });
};

module.exports = {
  create,
  findByClientId,
  update
};
