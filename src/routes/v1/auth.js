const express = require('express');
const validate = require('../../middleware/validate');
const authValidator = require('../../validators/auth.validator');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

// Public auth endpoints
router.post('/login', validate(authValidator.login), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-tokens', authController.refreshTokens);
router.post('/forgot-password', validate(authValidator.forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate(authValidator.resetPassword), authController.resetPassword);

// Protected auth endpoints
router.post('/change-password', authenticate, validate(authValidator.changePassword), authController.changePassword);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
