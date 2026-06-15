const emailService = require('../services/email.service');
const httpStatus   = require('../constants/httpStatus');
const config       = require('../config/config');

/**
 * POST /api/v1/email/test
 * Super admin endpoint to send a test email and verify SMTP configuration.
 * Body: { to, templateName? }
 */
const sendTestEmail = async (req, res, next) => {
  try {
    const { to, templateName = 'welcome' } = req.body;

    await emailService.sendEmail({
      to,
      subject:      'NewsVerce — SMTP Test Email',
      templateName,
      variables: {
        name:         'Admin',
        email:        to,
        brandName:    'NewsVerce',
        supportEmail: 'support@saasnews.com',
        loginUrl:     config.clientUrl,
        resetLink:    `${config.clientUrl}/reset-password?token=TEST_TOKEN_12345`,
        expiresIn:    10,
        plan:         'professional',
        expiryDate:   '30 June 2025',
        renewLink:    `${config.clientUrl}/subscription/renew`,
        resource:     'news articles',
        percentage:   85,
        isCritical:   false,
        upgradeLink:  `${config.clientUrl}/subscription/upgrade`,
        authorName:   'Test Author',
        title:        'Test Article Title',
        publishDate:  new Date().toLocaleDateString(),
        articleUrl:   `${config.clientUrl}/news/test-article`,
      },
    });

    return res.success({ to, templateName }, 'Test email sent successfully. Check your Mailtrap inbox.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/email/preview/:template
 * Dev/Admin: Render an email template as HTML for browser preview.
 * ONLY available in development environment.
 */
const previewTemplate = async (req, res, next) => {
  try {
    if (config.env === 'production') {
      return res.status(httpStatus.FORBIDDEN).json({
        success: false,
        message: 'Template preview is disabled in production.',
      });
    }

    const { template } = req.params;

    const html = emailService.renderTemplate(template, {
      name:         'John Doe',
      email:        'john@example.com',
      brandName:    'SaaS News Platform',
      supportEmail: 'support@saasnews.com',
      loginUrl:     `${config.clientUrl}/login`,
      resetLink:    `${config.clientUrl}/reset-password?token=PREVIEW_TOKEN`,
      expiresIn:    10,
      plan:         'professional',
      expiryDate:   '30 June 2025',
      renewLink:    `${config.clientUrl}/subscription/renew`,
      resource:     'news articles',
      percentage:   85,
      isCritical:   false,
      upgradeLink:  `${config.clientUrl}/subscription/upgrade`,
      authorName:   'John Doe',
      title:        'Sample Article Title for Preview',
      publishDate:  new Date().toLocaleDateString(),
      articleUrl:   `${config.clientUrl}/news/sample-article`,
      subject:      `${template} Email Preview`,
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (err) {
    return next(err);
  }
};

module.exports = { sendTestEmail, previewTemplate };
