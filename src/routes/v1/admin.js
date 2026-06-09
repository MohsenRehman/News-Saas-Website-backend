const express = require('express');
const validate = require('../../middleware/validate');
const adminValidator = require('../../validators/admin.validator');
const adminController = require('../../controllers/admin.controller');
const activityLogValidator = require('../../validators/activityLog.validator');
const activityLogController = require('../../controllers/activityLog.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const { checkPlanLimit } = require('../../middleware/subscription');

const router = express.Router();

// Enforce auth & super_admin RBAC globally on this router
router.use(authenticate);
router.use(authorize('super_admin'));

// Tenant user (editor) management
router.post('/users', checkPlanLimit('maxUsers'), validate(adminValidator.createAdmin), adminController.createAdmin);
router.get('/users', adminController.getAdmins);
router.get('/users/:id', adminController.getAdminById);
router.put('/users/:id', validate(adminValidator.updateAdmin), adminController.updateAdmin);
router.patch('/users/:id/status', validate(adminValidator.updateStatus), adminController.updateAdminStatus);
router.post('/users/:id/reset-password', validate(adminValidator.resetPassword), adminController.resetAdminPassword);
router.delete('/users/:id', adminController.deleteAdmin);

// Tenant admin activity auditing monitor
router.get('/monitoring', adminController.getAdminsMonitoring);

// Tenant dashboard analytics statistics
router.get('/dashboard-stats', adminController.getDashboardStats);

// Tenant branding & website configuration
router.get('/settings', adminController.getWebsiteSettings);
router.put('/settings', validate(adminValidator.updateSettings), adminController.updateWebsiteSettings);

// Activity logs monitoring query
router.get('/activity-logs', validate(activityLogValidator.getActivityLogs), activityLogController.getActivityLogs);

// Queue health monitoring (BullMQ job counts per queue)
router.get('/system/queues', adminController.getQueueStats);

module.exports = router;
