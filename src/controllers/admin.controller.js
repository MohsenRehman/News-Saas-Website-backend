const adminService = require('../services/admin.service');
const userRepository = require('../repositories/user.repository');
const httpStatus = require('../constants/httpStatus');
const AppError = require('../utils/appError');

/**
 * Create a new editor admin under the tenant client
 */
const createAdmin = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const clientId = req.clientId;

    if (!clientId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Tenant client context missing.');
    }

    const admin = await adminService.createAdmin(clientId, req.body, ipAddress, operatorId);
    return res.success(admin, 'Admin editor successfully created.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve tenant admins/editors
 */
const getAdmins = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { page, limit, name } = req.query;
    const filters = {};

    if (name) filters.name = { $regex: name, $options: 'i' };

    const data = await adminService.getAdmins(clientId, filters, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });

    return res.success(data, 'Tenant editors list retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve single tenant admin profile details
 */
const getAdminById = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const user = await userRepository.findById(req.params.id);

    if (!user || user.isDeleted || user.clientId.toString() !== clientId.toString()) {
      throw new AppError(httpStatus.NOT_FOUND, 'Admin user not found.');
    }

    if (user.role !== 'admin') {
      throw new AppError(httpStatus.FORBIDDEN, 'Access denied.');
    }

    return res.success({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt
    }, 'Admin details retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update tenant admin name
 */
const updateAdmin = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const clientId = req.clientId;

    const admin = await adminService.updateAdmin(clientId, req.params.id, req.body, ipAddress, operatorId);
    return res.success(admin, 'Admin details updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle tenant admin status
 */
const updateAdminStatus = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const clientId = req.clientId;
    const { status } = req.body;

    const admin = await adminService.updateAdminStatus(clientId, req.params.id, status, ipAddress, operatorId);
    return res.success(admin, `Admin user is now [${status}].`);
  } catch (error) {
    next(error);
  }
};

/**
 * Reset tenant admin password
 */
const resetAdminPassword = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const clientId = req.clientId;
    const { password } = req.body;

    await adminService.resetAdminPassword(clientId, req.params.id, password, ipAddress, operatorId);
    return res.success(null, 'Admin password successfully reset.');
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete tenant admin
 */
const deleteAdmin = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const clientId = req.clientId;

    await adminService.deleteAdmin(clientId, req.params.id, ipAddress, operatorId);
    return res.success(null, 'Admin successfully deleted.');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve monitoring list for tenant admins
 */
const getAdminsMonitoring = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const data = await adminService.getAdminsMonitoring(clientId);
    return res.success(data, 'Tenant monitoring stats retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Get tenant website settings
 */
const getWebsiteSettings = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const settings = await adminService.getWebsiteSettings(clientId);
    return res.success(settings, 'Website settings retrieved.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update tenant website settings
 */
const updateWebsiteSettings = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const operatorId = req.user.id;
    const clientId = req.clientId;

    const settings = await adminService.updateWebsiteSettings(clientId, req.body, ipAddress, operatorId);
    return res.success(settings, 'Website settings updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve tenant dashboard statistics
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    if (!clientId) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Tenant client context missing.');
    }
    const stats = await adminService.getDashboardStats(clientId);
    return res.success(stats, 'Tenant dashboard stats retrieved.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  updateAdminStatus,
  resetAdminPassword,
  deleteAdmin,
  getAdminsMonitoring,
  getWebsiteSettings,
  updateWebsiteSettings,
  getDashboardStats,
  getQueueStats
};

/**
 * GET /api/v1/admin/system/queues
 * Returns live BullMQ job counts for all background queues.
 * Requires super_admin role (inherited from admin router global guard).
 */
async function getQueueStats(req, res, next) {
  try {
    const { isRedisReady }  = require('../config/redis');
    const { emailQueue }    = require('../queues/email.queue');
    const { activityQueue } = require('../queues/activity.queue');

    if (!isRedisReady()) {
      return res.success(
        { redisStatus: 'unavailable', queues: null },
        'Redis is not connected. Queues are running in synchronous fallback mode.'
      );
    }

    const [emailCounts, activityCounts] = await Promise.all([
      emailQueue    ? emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')    : null,
      activityQueue ? activityQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed') : null,
    ]);

    return res.success(
      {
        redisStatus: 'ready',
        queues: {
          email:    emailCounts,
          activity: activityCounts,
        }
      },
      'Queue stats retrieved successfully.'
    );
  } catch (err) {
    return next(err);
  }
}
