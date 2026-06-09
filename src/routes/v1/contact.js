const express = require('express');
const validate = require('../../middleware/validate');
const contactValidator = require('../../validators/contact.validator');
const contactController = require('../../controllers/contact.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Enforce auth & RBAC globally on this router for admin levels
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

router.get('/', validate(contactValidator.getContacts), contactController.getContacts);
router.get('/:id', validate(contactValidator.contactId), contactController.getContactById);
router.delete('/:id', validate(contactValidator.contactId), contactController.deleteContact);

module.exports = router;
