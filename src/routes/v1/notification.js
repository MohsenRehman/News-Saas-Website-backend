const express = require('express');
const validate = require('../../middleware/validate');
const notificationValidator = require('../../validators/notification.validator');
const notificationController = require('../../controllers/notification.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Enforce auth globally for all notification operations
router.use(authenticate);

// User-scoped notification actions
router.get('/', validate(notificationValidator.getNotifications), notificationController.getNotifications);
router.patch('/:id/read', validate(notificationValidator.notificationId), notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);
router.delete('/:id', validate(notificationValidator.notificationId), notificationController.deleteNotification);

// Administrative notification dispatch (requires super_admin or admin roles)
router.post('/', authorize('super_admin', 'admin'), validate(notificationValidator.createNotification), notificationController.createNotification);

module.exports = router;
