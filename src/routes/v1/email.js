const express                     = require('express');
const { authenticate, authorize }  = require('../../middleware/auth');
const validate                    = require('../../middleware/validate');
const emailValidator              = require('../../validators/email.validator');
const emailController             = require('../../controllers/email.controller');

const router = express.Router();

/**
 * POST /api/v1/email/test
 * Send a test email to verify SMTP configuration (super_admin only).
 */
router.post(
  '/test',
  authenticate,
  authorize('super_admin'),
  validate(emailValidator.sendTestEmail),
  emailController.sendTestEmail
);

/**
 * GET /api/v1/email/preview/:template
 * Preview a rendered email template in the browser (dev environment only).
 * No auth required — this is a dev tool (blocked in production by controller).
 */
router.get('/preview/:template', emailController.previewTemplate);

module.exports = router;
