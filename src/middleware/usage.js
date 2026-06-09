const { checkPlanLimit } = require('./subscription');

const limitMiddleware = checkPlanLimit('maxApiRequests');

/**
 * trackAndLimitApiRequests
 * ------------------------
 * Middleware that tracks and limits API requests made by tenant admins and editors.
 * Bypasses public visitor requests, health checks, payments, jobs, and subscription updates.
 */
const trackAndLimitApiRequests = (req, res, next) => {
  const path = req.path;

  // 1. Bypass checks
  const isBypass = !req.clientId ||
                   path.startsWith('/api/v1/health') ||
                   path.startsWith('/api/v1/admin/subscription') ||
                   path.startsWith('/api/v1/subscription') ||
                   path.startsWith('/api/v1/payments') ||
                   path.startsWith('/api/v1/jobs') ||
                   path.startsWith('/api/v1/webhooks');

  if (isBypass) {
    return next();
  }

  // 2. Track only admin, editor, or AI API requests
  const isAdminRequest = path.startsWith('/api/v1/admin') ||
                         path.startsWith('/api/v1/ai') ||
                         path.startsWith('/api/v1/newsletter/admin') ||
                         (req.user && ['admin', 'super_admin', 'editor'].includes(req.user.role));

  if (!isAdminRequest) {
    return next();
  }

  // 3. Delegate to the atomic plan limit checker
  return limitMiddleware(req, res, next);
};

module.exports = { trackAndLimitApiRequests };
