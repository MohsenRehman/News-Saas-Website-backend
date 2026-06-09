const notificationRepository = require('../repositories/notification.repository');
const userRepository = require('../repositories/user.repository');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');

/**
 * List paginated notifications for a tenant user
 */
const getNotifications = async (clientId, userId, filters, options) => {
  return notificationRepository.findAll(clientId, userId, filters, options);
};

/**
 * Mark a single notification as read (with owner check)
 */
const markRead = async (clientId, id, userId) => {
  const notification = await notificationRepository.findById(clientId, id);
  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found.');
  }

  // Ensure notification belongs to the authenticated user
  if (notification.userId.toString() !== userId.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to this notification.');
  }

  if (!notification.isRead) {
    notification.isRead = true;
    await notification.save();
  }

  return notification;
};

/**
 * Bulk mark all notifications as read for a user
 */
const markAllRead = async (clientId, userId) => {
  return notificationRepository.markAllRead(clientId, userId);
};

/**
 * Soft delete a notification (with owner check)
 */
const deleteNotification = async (clientId, id, userId) => {
  const notification = await notificationRepository.findById(clientId, id);
  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found.');
  }

  // Ensure notification belongs to the authenticated user
  if (notification.userId.toString() !== userId.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to this notification.');
  }

  await notification.softDelete();
  return notification;
};

/**
 * Dispatch an administrative custom notification to a tenant editor
 */
const createNotification = async (clientId, senderId, dispatchData) => {
  const targetUser = await userRepository.findById(dispatchData.userId);
  if (!targetUser || targetUser.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Target user not found.');
  }

  // Enforce tenant isolation for the target user
  if (targetUser.clientId.toString() !== clientId.toString()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Target user does not belong to this tenant client.');
  }

  return notificationRepository.create({
    clientId,
    userId: dispatchData.userId,
    title: dispatchData.title,
    message: dispatchData.message,
    type: dispatchData.type || 'admin'
  });
};

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  createNotification
};
