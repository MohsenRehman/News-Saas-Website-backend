const notificationService = require('../services/notification.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Handle listing notifications for current authenticated user
 */
const getNotifications = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const userId = req.user.id;
    const { isRead, type, page, limit } = req.query;

    const filters = {};
    if (isRead !== undefined) {
      // Joi parses string boolean parameters automatically to real boolean in validated queries,
      // but let's be double sure and support both.
      filters.isRead = isRead === 'true' || isRead === true;
    }
    if (type) {
      filters.type = type;
    }

    const data = await notificationService.getNotifications(
      clientId,
      userId,
      filters,
      {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20
      }
    );

    return res.success(data, 'Notifications retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle marking a single notification as read
 */
const markRead = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await notificationService.markRead(clientId, id, userId);
    return res.success(notification, 'Notification marked as read.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle bulk marking all notifications as read for current user
 */
const markAllRead = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const userId = req.user.id;

    await notificationService.markAllRead(clientId, userId);
    return res.success(null, 'All notifications marked as read.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle soft deleting a notification
 */
const deleteNotification = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { id } = req.params;
    const userId = req.user.id;

    await notificationService.deleteNotification(clientId, id, userId);
    return res.success(null, 'Notification deleted successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle dispatching custom admin notification alert to target tenant user
 */
const createNotification = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const senderId = req.user.id;

    const notification = await notificationService.createNotification(clientId, senderId, req.body);
    return res.success(notification, 'Notification dispatched successfully.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  createNotification
};
