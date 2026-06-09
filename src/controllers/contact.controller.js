const contactService = require('../services/contact.service');

/**
 * Handle listing contact submissions request
 */
const getContacts = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { status, page, limit } = req.query;

    const filters = {};
    if (status) {
      filters.status = status;
    }

    const data = await contactService.getContacts(
      clientId,
      filters,
      {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20
      }
    );

    return res.success(data, 'Contact submissions retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle retrieving single contact submission detail
 */
const getContactById = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { id } = req.params;
    const userContext = {
      userId: req.user.id,
      ipAddress: req.ip || ''
    };

    const contact = await contactService.getContactById(clientId, id, userContext);
    return res.success(contact, 'Contact submission retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle soft deleting a contact submission
 */
const deleteContact = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { id } = req.params;
    const userContext = {
      userId: req.user.id,
      ipAddress: req.ip || ''
    };

    await contactService.deleteContact(clientId, id, userContext);
    return res.success(null, 'Contact submission deleted successfully.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getContacts,
  getContactById,
  deleteContact
};
