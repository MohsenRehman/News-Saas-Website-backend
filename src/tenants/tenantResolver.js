const logger = require('../config/logger');

/**
 * Middleware to resolve tenant context (clientId) from requests.
 * Placeholder to be fully implemented in Phase 4.
 */
const tenantResolver = (req, res, next) => {
  logger.info('[TenantResolver] Middleware placeholder called');
  next();
};

module.exports = tenantResolver;
