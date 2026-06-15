const fs          = require('fs');
const path        = require('path');
const handlebars  = require('handlebars');
const transporter = require('../config/mailer');
const config      = require('../config/config');
const logger      = require('../config/logger');
const UsageStats   = require('../models/UsageStats');
const Subscription = require('../models/Subscription');
const ActivityLog  = require('../models/ActivityLog');
const { PLAN_LIMITS } = require('../constants/planLimits');

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const TEMPLATES_DIR     = path.join(__dirname, '../templates/emails');
const BASE_TEMPLATE     = fs.readFileSync(path.join(TEMPLATES_DIR, 'base.hbs'), 'utf8');
const baseCompiled      = handlebars.compile(BASE_TEMPLATE);

const DEFAULT_FROM      = config.email.from 
  ? `"${config.email.from.name}" <${config.email.from.address}>`
  : `"NewsVerce" <${config.email.smtp.auth.user || 'noreply@saasnews.com'}>`;
const EMAIL_RETRY_COUNT = 2;     // Retry up to 2 times before giving up (feedback requirement)
const EMAIL_RETRY_DELAY = config.env === 'development' || config.env === 'test' ? 100 : 2000; // 2 second base delay in prod, 100ms in dev/test

// Template cache — avoids reading from disk on every send
const templateCache = new Map();

// ────────────────────────────────────────────────────────────────────────────
// Template Renderer
// ────────────────────────────────────────────────────────────────────────────

/**
 * renderTemplate
 * Renders an email body template and wraps it in the base layout.
 * Templates are cached after first compile (process lifetime).
 *
 * @param {string} templateName - Filename without .hbs extension
 * @param {Object} variables    - Handlebars template variables
 * @returns {string} Full HTML string
 */
const renderTemplate = (templateName, variables = {}) => {
  if (!templateCache.has(templateName)) {
    const filePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Email template '${templateName}' not found at ${filePath}`);
    }
    templateCache.set(templateName, handlebars.compile(fs.readFileSync(filePath, 'utf8')));
  }

  const contentTemplate = templateCache.get(templateName);
  const content         = contentTemplate(variables);

  // Wrap content in base layout
  return baseCompiled({
    ...variables,
    content,
    currentYear: new Date().getFullYear(),
  });
};

// ────────────────────────────────────────────────────────────────────────────
// Core Send Function with Retry Wrapper (feedback requirement)
// ────────────────────────────────────────────────────────────────────────────

/**
 * sendEmail
 * Core email send with retry logic (up to EMAIL_RETRY_COUNT retries, exponential back-off).
 * Resilient — logs errors but does NOT throw, so a failed email never crashes a request.
 *
 * @param {Object} options
 * @param {string}  options.to           - Recipient email address
 * @param {string}  options.subject      - Email subject line
 * @param {string}  options.templateName - Handlebars template name
 * @param {Object}  options.variables    - Template variables
 * @param {string} [options.from]        - Sender override (defaults to platform default)
 */
const sendEmail = async ({ to, subject, templateName, variables = {}, from, clientId }) => {
  // 1. Enforce email plan limits if clientId is provided
  if (clientId) {
    try {
      const subscription = await Subscription.findOne({ clientId, status: 'active', isDeleted: false }).lean();
      if (subscription) {
        const limits = PLAN_LIMITS[subscription.plan] || {};
        const cap = limits.emailSent;
        if (cap > 0) {
          const usage = await UsageStats.findOne({ clientId }).lean();
          if (usage && usage.emailSent >= cap) {
            // Log to ActivityLog
            (async () => {
              try {
                const User = require('../models/User');
                const superAdmin = await User.findOne({ clientId, role: 'super_admin' }).lean();
                let userId = superAdmin ? superAdmin._id : null;
                if (!userId) {
                  const anyUser = await User.findOne({ clientId }).lean();
                  userId = anyUser ? anyUser._id : null;
                }
                if (userId) {
                  await ActivityLog.create({
                    clientId,
                    userId,
                    action: 'subscription_limit_reached',
                    module: 'subscription',
                    details: { limitKey: 'maxEmails', cap },
                    timestamp: new Date()
                  });
                }
              } catch (err) {
                // ignore
              }
            })();

            logger.error(`[Email] Sending blocked. Subscription limit reached for emails: ${cap}/${cap} for client ${clientId}`);
            return false;
          }
        }
      }
    } catch (err) {
      logger.error(`[Email Limit Check Error] ${err.message}`, err);
    }
  }

  let html;
  try {
    html = renderTemplate(templateName, variables);
  } catch (err) {
    logger.error(`[Email] Template render failed for '${templateName}': ${err.message}`);
    return false; // Fail silently — never crash the caller
  }

  const mailOptions = {
    from:    from || DEFAULT_FROM,
    to,
    subject,
    html,
  };

  let lastError;
  for (let attempt = 1; attempt <= EMAIL_RETRY_COUNT + 1; attempt++) {
    try {
      if (attempt > 1) {
        const delay = EMAIL_RETRY_DELAY * (attempt - 1); // 2s, 4s
        await new Promise((r) => setTimeout(r, delay));
        logger.warn(`[Email] Retrying send to ${to} (attempt ${attempt}/${EMAIL_RETRY_COUNT + 1})`);
      }

      const info = await transporter.sendMail(mailOptions);
      logger.info(`[Email] Sent '${subject}' to ${to} — MessageId: ${info.messageId}`);

      // 2. Increment emailSent count on success
      if (clientId) {
        UsageStats.updateOne(
          { clientId },
          { $inc: { emailSent: 1 } },
          { upsert: true }
        ).catch((err) => {
          logger.error(`[UsageStats Error] Failed to increment emailSent count: ${err.message}`);
        });
      }

      return true; // Success — stop retrying
    } catch (err) {
      lastError = err;
      logger.warn(`[Email] Attempt ${attempt} failed for ${to}: ${err.message}`);
    }
  }

  // All retries exhausted — log final error (non-throwing)
  logger.error(`[Email] All ${EMAIL_RETRY_COUNT + 1} attempts failed for ${to}: ${lastError?.message}`);
  return false;
};

// ────────────────────────────────────────────────────────────────────────────
// BullMQ Queue Integration (Phase 28)
// ────────────────────────────────────────────────────────────────────────────

/**
 * enqueueEmailJob
 * ------------------------------------
 * Re-exported from src/queues/email.queue.js.
 *
 * When Redis is available → pushes to BullMQ email-queue (processed by email.worker.js).
 * When Redis is down      → calls sendEmail() directly as a synchronous fallback.
 *
 * All callers (newsletter, payment, auth, admin) continue to use this function
 * without any changes — they get BullMQ for free.
 */
const { enqueueEmailJob } = require('../queues/email.queue');

// ────────────────────────────────────────────────────────────────────────────
// Shortcut Senders — Domain-specific helpers
// All use enqueueEmailJob() → queue when Redis ready, sync otherwise
// ────────────────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MINUTES = 10; // Must match auth.service.js forgotPassword() TTL

/**
 * Send welcome email to a newly created admin/editor.
 * @param {Object} user   - { name, email }
 * @param {Object} tenant - { siteName, contactEmail, clientUrl }
 */
const sendWelcomeEmail = (user, tenant = {}) => {
  return enqueueEmailJob({
    to:           user.email,
    subject:      `Welcome to ${tenant.siteName || 'SaaS News Platform'}!`,
    templateName: 'welcome',
    variables: {
      name:         user.name,
      email:        user.email,
      brandName:    tenant.siteName    || 'SaaS News Platform',
      supportEmail: tenant.contactEmail || '',
      loginUrl:     tenant.clientUrl   || config.clientUrl,
    },
  });
};

/**
 * Send password reset email.
 * Includes hard expiry time (TOKEN_EXPIRY_MINUTES) — set server-side, not just display text.
 * @param {Object} user       - { name, email }
 * @param {string} resetToken - Raw (un-hashed) reset token
 * @param {Object} tenant     - { siteName, contactEmail, clientUrl }
 */
const sendPasswordResetEmail = (user, resetToken, tenant = {}) => {
  const clientUrl = tenant.clientUrl || config.clientUrl;
  const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

  return enqueueEmailJob({
    to:           user.email,
    subject:      'Password Reset Request',
    templateName: 'resetPassword',
    variables: {
      name:         user.name,
      brandName:    tenant.siteName     || 'SaaS News Platform',
      supportEmail: tenant.contactEmail || '',
      resetLink,
      expiresIn:    TOKEN_EXPIRY_MINUTES, // Hard expiry enforced on backend in auth.service.js
    },
  });
};

/**
 * Send subscription expiry warning email.
 * @param {Object} tenant       - { siteName, contactEmail, clientUrl, adminEmail }
 * @param {Object} subscription - { plan, endDate }
 */
const sendSubscriptionExpiryWarning = (tenant, subscription) => {
  const renewLink = `${tenant.clientUrl || config.clientUrl}/subscription/renew`;
  const expiryDate = subscription.endDate
    ? new Date(subscription.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'soon';

  return enqueueEmailJob({
    to:           tenant.adminEmail || tenant.contactEmail,
    subject:      `Action Required: Your ${tenant.siteName} subscription is expiring`,
    templateName: 'subscriptionExpiry',
    variables: {
      brandName:    tenant.siteName     || 'SaaS News Platform',
      supportEmail: tenant.contactEmail || '',
      plan:         subscription.plan,
      expiryDate,
      renewLink,
    },
  });
};

/**
 * Send usage limit warning email (80% or 100% threshold).
 * @param {Object} tenant     - { siteName, contactEmail, clientUrl, adminEmail }
 * @param {string} resource   - e.g. 'news articles', 'admins', 'AI requests'
 * @param {number} percentage - Current usage percentage (0–100)
 * @param {string} plan       - Current plan name
 */
const sendUsageWarning = (tenant, resource, percentage, plan) => {
  const upgradeLink = `${tenant.clientUrl || config.clientUrl}/subscription/upgrade`;

  return enqueueEmailJob({
    to:           tenant.adminEmail || tenant.contactEmail,
    subject:      `Usage Alert: ${resource} limit at ${percentage}% on ${tenant.siteName}`,
    templateName: 'usageWarning',
    variables: {
      brandName:    tenant.siteName     || 'SaaS News Platform',
      supportEmail: tenant.contactEmail || '',
      resource,
      percentage,
      plan,
      upgradeLink,
      isCritical:  percentage >= 100,
    },
  });
};

/**
 * Send article published notification to author.
 * @param {Object} news   - { title, slug }
 * @param {Object} tenant - { siteName, contactEmail, clientUrl }
 * @param {Object} author - { name, email }
 */
const sendNewsPublishedNotification = (news, tenant, author) => {
  const articleUrl = `${tenant.clientUrl || config.clientUrl}/news/${news.slug}`;

  return enqueueEmailJob({
    to:           author.email,
    subject:      `Your article "${news.title}" is now live!`,
    templateName: 'newsPublished',
    variables: {
      brandName:    tenant.siteName     || 'SaaS News Platform',
      supportEmail: tenant.contactEmail || '',
      authorName:   author.name,
      title:        news.title,
      publishDate:  new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      articleUrl,
    },
  });
};

/**
 * Resolves the client URL dynamically.
 * Supports prepending subdomains to localhost or production root URL, or using customDomain.
 * Catches .vercel.app default domains and falls back to root (no wildcard subdomain support).
 * @param {Object} client - The Client model instance
 * @param {string} baseClientUrl - The configured base client URL
 * @returns {string} The resolved client URL
 */
const getClientUrl = (client, baseClientUrl) => {
  if (!client) return baseClientUrl;

  if (client.customDomain) {
    const protocol = baseClientUrl.startsWith('https') ? 'https' : 'http';
    return `${protocol}://${client.customDomain}`;
  }

  try {
    const url = new URL(baseClientUrl);
    // Vercel default domains do not support wildcard subdomains, so fall back to root
    if (url.hostname.endsWith('.vercel.app')) {
      return baseClientUrl;
    }
    url.hostname = `${client.subdomain}.${url.hostname}`;
    return url.origin;
  } catch (err) {
    return baseClientUrl;
  }
};

module.exports = {
  renderTemplate,
  sendEmail,
  enqueueEmailJob,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendSubscriptionExpiryWarning,
  sendUsageWarning,
  sendNewsPublishedNotification,
  getClientUrl,
  TOKEN_EXPIRY_MINUTES,
};
