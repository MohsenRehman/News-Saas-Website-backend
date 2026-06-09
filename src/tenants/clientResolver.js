const Client = require('../models/Client');

/**
 * Resolves active client details by ID.
 * @param {String} clientId
 * @returns {Promise<Client|null>}
 */
const resolveClientById = async (clientId) => {
  return Client.findOne({ _id: clientId, isDeleted: false });
};

/**
 * Resolves active client details by Subdomain.
 * @param {String} subdomain
 * @returns {Promise<Client|null>}
 */
const resolveClientBySubdomain = async (subdomain) => {
  return Client.findOne({ subdomain, isDeleted: false });
};

module.exports = {
  resolveClientById,
  resolveClientBySubdomain
};
