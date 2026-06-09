const nodemailer = require('nodemailer');
const config     = require('./config');
const logger     = require('./logger');

/**
 * Nodemailer transporter singleton.
 * Uses SMTP config from environment variables (Mailtrap in dev, real SMTP in prod).
 * No code changes needed between environments — only .env values change.
 */
const transporter = nodemailer.createTransport({
  host:   config.email.smtp.host,
  port:   config.email.smtp.port,
  secure: config.email.smtp.port === 465, // true for 465 (SSL), false for 2525/587 (TLS)
  auth: {
    user: config.email.smtp.auth.user,
    pass: config.email.smtp.auth.pass,
  },
  // Timeout settings to prevent hanging connections
  connectionTimeout: 10000, // 10s
  greetingTimeout:   5000,
  socketTimeout:     10000,
});

// Verify SMTP connection on startup (non-blocking, best-effort)
if (config.env !== 'test') {
  transporter.verify((err) => {
    if (err) {
      logger.warn(`[Mailer] SMTP connection failed: ${err.message}. Emails will not be sent until SMTP is configured.`);
    } else {
      logger.info('[Mailer] SMTP transporter ready.');
    }
  });
}

module.exports = transporter;
