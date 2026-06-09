const { resolveDomain } = require('../tenants/domainResolver');
const Client = require('../models/Client');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');

/**
 * Middleware to resolve tenant context (clientId) from requests.
 * Uses custom headers (for API clients/testing) or checks Host headers.
 */
const resolveTenant = async (req, res, next) => {
  try {
    let client = null;
    const xTenantHeader = req.headers['x-tenant'];
    const isJobPath = req.path.startsWith('/api/v1/jobs/');
    const isBypassPath = req.path === '/api/v1/health' || 
                         req.path === '/api/v1/health/error-test' || 
                         isJobPath;

    // 1. Local testing bypass using headers (e.g. x-tenant: peshawar)
    if (xTenantHeader) {
      client = await Client.findOne({
        subdomain: xTenantHeader.toLowerCase().trim(),
        isDeleted: false
      });
      if (!client && !isBypassPath) {
        throw new AppError(httpStatus.NOT_FOUND, `Tenant website not found for subdomain: ${xTenantHeader}`);
      }
    } else {
      // 2. Resolve client from hostname
      const host = req.headers.host;
      client = await resolveDomain(host);

      // If it resolved to null, but it is NOT the master platform host, it is an invalid domain
      const cleanHost = host ? host.split(':')[0].toLowerCase().trim() : '';
      const isMasterHost = ['localhost', '127.0.0.1', 'saasnews.com'].includes(cleanHost);

      if (!client && !isMasterHost && !isBypassPath) {
        throw new AppError(httpStatus.NOT_FOUND, 'Tenant website not found');
      }
    }

    if (client) {
      // Verify client is active
      if (client.status !== 'active' && !isBypassPath) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          `Tenant site is currently [${client.status}]. Access is restricted.`
        );
      }

      // Inject tenant context into request object
      req.clientId = client._id;
      req.client = client;
    } else {
      // Global platform level context (e.g. platform owner landing requests)
      req.clientId = null;
      req.client = null;
    }

    if (isJobPath) {
      req.isSystemJob = true;
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = resolveTenant;
