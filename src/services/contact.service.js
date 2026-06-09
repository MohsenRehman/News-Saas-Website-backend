const contactRepository = require('../repositories/contact.repository');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

// Resilient logging helper
const logActivityResilient = async (clientId, userId, action, module, ipAddress) => {
  try {
    await ActivityLog.create({
      clientId,
      userId,
      action,
      module,
      ipAddress,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error(`[ActivityLog Error] Contact activity log write failed: ${err.message}`, err);
  }
};

/**
 * Retrieve paginated contact submissions
 * @param {String} clientId 
 * @param {Object} filters 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
const getContacts = async (clientId, filters, options) => {
  return contactRepository.findAll(clientId, filters, options);
};

/**
 * Retrieve single contact submission, auto transition status to read, and log audit log
 * @param {String} clientId 
 * @param {String} id 
 * @param {Object} userContext - { userId, ipAddress }
 * @returns {Promise<Object>}
 */
const getContactById = async (clientId, id, userContext) => {
  const contact = await contactRepository.findById(clientId, id);
  if (!contact) {
    throw new AppError(httpStatus.NOT_FOUND, 'Contact submission not found.');
  }

  // If status is unread, transition it to read
  if (contact.status === 'unread') {
    contact.status = 'read';
    await contact.save();
  }

  // Log activity
  await logActivityResilient(
    clientId,
    userContext.userId,
    'contact_read',
    'contact',
    userContext.ipAddress
  );

  return contact;
};

/**
 * Soft-delete a contact submission and log audit log
 * @param {String} clientId 
 * @param {String} id 
 * @param {Object} userContext - { userId, ipAddress }
 * @returns {Promise<Object>}
 */
const deleteContact = async (clientId, id, userContext) => {
  const contact = await contactRepository.findById(clientId, id);
  if (!contact) {
    throw new AppError(httpStatus.NOT_FOUND, 'Contact submission not found.');
  }

  // Soft delete the document
  await contact.softDelete();

  // Log activity
  await logActivityResilient(
    clientId,
    userContext.userId,
    'contact_delete',
    'contact',
    userContext.ipAddress
  );

  return contact;
};

module.exports = {
  getContacts,
  getContactById,
  deleteContact
};
