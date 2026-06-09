const tokenUtil = require('../utils/token');
const userRepository = require('../repositories/user.repository');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');

/**
 * Middleware to authenticate requests via JWT access token.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Please authenticate');
    }

    const token = authHeader.split(' ')[1];
    const decoded = tokenUtil.verifyAccessToken(token);

    const user = await userRepository.findById(decoded.id);
    if (!user || user.status !== 'active') {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Please authenticate');
    }

    // Attach user profile context to request
    req.user = {
      id: user._id,
      role: user.role,
      clientId: user.clientId
    };
    
    return next();
  } catch (error) {
    return next(new AppError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
};

/**
 * Middleware to authorize requests based on user roles (RBAC).
 * @param {...String} allowedRoles - List of permitted roles
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AppError(httpStatus.FORBIDDEN, 'Forbidden: Insufficient permissions'));
    }
    return next();
  };
};

module.exports = {
  authenticate,
  authorize
};
