const express = require('express');
const validate = require('../../middleware/validate');
const platformValidator = require('../../validators/platform.validator');
const platformController = require('../../controllers/platform.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

// Protect all platform routes with platform_owner role
router.use(authenticate);
router.use(authorize('platform_owner'));

// Clients provisioning and listing
router.post('/clients', validate(platformValidator.createWebsite), platformController.createWebsite);
router.get('/clients', platformController.getClients);
router.get('/clients/:id', platformController.getClientById);
router.put('/clients/:id', validate(platformValidator.updateClient), platformController.updateClient);

// Status toggling and cascading soft delete
router.patch('/clients/:id/status', validate(platformValidator.updateStatus), platformController.updateClientStatus);
router.delete('/clients/:id', platformController.deleteClient);

// Stats dashboard
router.get('/dashboard', platformController.getDashboardStats);

module.exports = router;
