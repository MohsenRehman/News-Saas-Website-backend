const { Server } = require('socket.io');
const tokenUtil = require('../utils/token');
const userRepository = require('../repositories/user.repository');
const logger = require('./logger');

let io = null;

/**
 * Initialize the Socket.IO server on top of HTTP server
 * @param {Object} server - HTTP Server instance
 * @returns {Object} Socket.IO Server instance
 */
const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow connections from any frontend origin
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Define namespaces for platform administration and client tenant isolation
  const platformNamespace = io.of('/platform');
  const tenantNamespacePattern = io.of(/^\/tenant-[a-zA-Z0-9_-]+$/);

  // Reusable socket authentication middleware using JWT access tokens
  const authMiddleware = async (socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (!authHeader) {
        return next(new Error('Authentication error: Token missing'));
      }

      // Support both "Bearer <token>" and raw token strings
      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
      const decoded = tokenUtil.verifyAccessToken(token);

      const user = await userRepository.findById(decoded.id);
      if (!user || user.status !== 'active') {
        return next(new Error('Authentication error: User is inactive or not found'));
      }

      // Attach user credentials and profile context to socket connection
      socket.user = {
        id: user._id,
        role: user.role,
        clientId: user.clientId
      };

      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.message === 'jwt expired') {
        logger.info(`[Socket Auth] Connection rejected: token expired`);
      } else {
        logger.error(`[Socket Auth] Authentication failed: ${err.message}`);
      }
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  };

  // Enforce JWT authentication on both namespaces
  platformNamespace.use(authMiddleware);
  tenantNamespacePattern.use(authMiddleware);

  // Handle general platform administration socket connections
  platformNamespace.on('connection', (socket) => {
    logger.info(`[Socket] Client connected to /platform: socketId=${socket.id}, userId=${socket.user.id}`);
    
    socket.on('disconnect', () => {
      logger.info(`[Socket] Client disconnected from /platform: socketId=${socket.id}`);
    });
  });

  // Handle tenant-isolated client editor and audience socket connections
  tenantNamespacePattern.on('connection', (socket) => {
    const namespaceName = socket.nsp.name;
    const tenantId = namespaceName.replace('/tenant-', '');
    logger.info(`[Socket] Client connected to tenant namespace ${tenantId}: socketId=${socket.id}, userId=${socket.user.id}`);

    // Automatically join tenant and individual user notification rooms
    socket.join(`tenant:${tenantId}`);
    socket.join(`user:${socket.user.id}`);

    socket.on('disconnect', () => {
      logger.info(`[Socket] Client disconnected from tenant namespace ${tenantId}: socketId=${socket.id}`);
    });
  });

  logger.info('[Socket] Socket.IO server initialized successfully');
  return io;
};

/**
 * Retrieve the active Socket.IO server instance
 * @returns {Object} Socket.IO Server instance
 */
const getIo = () => {
  return io;
};

/**
 * Emit a broadcast event to all sockets within a specific tenant client namespace
 * @param {String} tenantId - Tenant identifier
 * @param {String} event - Outbound event name
 * @param {Object} data - Outbound payload
 */
const emitToTenant = (tenantId, event, data) => {
  if (!io) return;
  io.of(`/tenant-${tenantId}`).to(`tenant:${tenantId}`).emit(event, data);
};

/**
 * Emit a target-specific event to a singular user's socket room within a tenant namespace
 * @param {String} tenantId - Tenant identifier
 * @param {String} userId - Recipient user DB ID
 * @param {String} event - Outbound event name
 * @param {Object} data - Outbound payload
 */
const emitToUser = (tenantId, userId, event, data) => {
  if (!io) return;
  io.of(`/tenant-${tenantId}`).to(`user:${userId}`).emit(event, data);
};

module.exports = {
  init,
  getIo,
  emitToTenant,
  emitToUser
};
