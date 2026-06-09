/**
 * src/queues/email.queue.js
 * -------------------------------------------
 * Email job enqueuer with synchronous fallback.
 *
 * Design principles:
 *  - NO dependency on email.service (breaks circular dep)
 *  - Fallback requires email.service inside the function body (lazy require)
 *  - Every job gets a correlationId for traceability
 *  - If Redis is down, sendEmail() is called directly and synchronously
 */

const { Queue } = require('bullmq');
const crypto    = require('crypto');
const { connection, isRedisReady } = require('../config/redis');
const { QUEUES } = require('../constants/queueNames');
const logger    = require('../config/logger');

const emailQueue = connection
  ? new Queue(QUEUES.EMAIL, {
      connection,
      defaultJobOptions: {
        attempts:  3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 }
      }
    })
  : null;

/**
 * Enqueue an email delivery job.
 *
 * Falls back to direct synchronous sendEmail() when Redis is unavailable,
 * ensuring local development and non-Redis deployments work without changes.
 *
 * @param {Object} jobData
 * @param {string}  jobData.to            - Recipient address
 * @param {string}  jobData.subject       - Email subject
 * @param {string}  jobData.templateName  - Handlebars template name
 * @param {Object}  jobData.variables     - Template variables
 * @param {string} [jobData.from]         - Sender override
 * @param {string} [jobData.clientId]     - Tenant context (for email limit tracking)
 * @param {string} [jobData.campaignId]   - Newsletter campaign ID (for stat updates)
 * @returns {Promise<string|boolean>}       Job ID if queued, sendEmail() result if sync
 */
const enqueueEmailJob = async (jobData) => {
  const correlationId = crypto.randomUUID();

  if (isRedisReady() && emailQueue) {
    try {
      const job = await emailQueue.add(
        QUEUES.EMAIL,
        { ...jobData, correlationId },
      );
      logger.info(`[Email Queue] Job ${job.id} enqueued. correlationId=${correlationId}`);
      return job.id;
    } catch (err) {
      logger.error(`[Email Queue] Enqueue failed: ${err.message}. Falling back to synchronous send.`);
    }
  }

  // Lazy require prevents circular dependency:
  // email.service → enqueueEmailJob (from this file)
  // this file → sendEmail (from email.service, imported lazily here)
  const { sendEmail } = require('../services/email.service');
  return sendEmail(jobData);
};

module.exports = { emailQueue, enqueueEmailJob };
