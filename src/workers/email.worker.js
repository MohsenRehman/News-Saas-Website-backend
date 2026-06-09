/**
 * src/workers/email.worker.js
 * -------------------------------------------
 * STANDALONE BullMQ Worker — run as a separate process:
 *   node src/workers/email.worker.js
 *   (or: npm run worker:email)
 *
 * Responsibilities:
 *  - Pull email jobs from the BullMQ email-queue
 *  - Call sendEmail() to deliver via NodeMailer
 *  - Atomically increment Campaign.stats.sent / stats.failed for newsletter jobs
 *
 * NOT imported by app.js. Workers scale independently of the API server.
 */

require('dotenv').config();

const path = require('path');
// Ensure module resolution works from this file's location
process.chdir(path.join(__dirname, '../../'));

const mongoose = require('mongoose');
const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const { sendEmail } = require('../services/email.service');
const { QUEUES } = require('../constants/queueNames');
const Campaign = require('../models/Campaign');
const config   = require('../config/config');
const logger   = require('../config/logger');

// Workers require a persistent Redis connection
if (!connection) {
  logger.error('[Email Worker] Redis is not configured. Set REDIS_URL in .env and restart.');
  process.exit(1);
}

// Connect to MongoDB for Campaign stat updates
mongoose.connect(config.mongoose.url, config.mongoose.options)
  .then(() => logger.info('[Email Worker] MongoDB connected.'))
  .catch((err) => {
    logger.error(`[Email Worker] MongoDB connection failed: ${err.message}`);
    process.exit(1);
  });

const worker = new Worker(
  QUEUES.EMAIL,
  async (job) => {
    const { campaignId, correlationId, ...emailPayload } = job.data;

    logger.info(`[Email Worker] Processing job ${job.id} | correlationId=${correlationId} | to=${emailPayload.to}`);

    let isSent = false;
    try {
      isSent = await sendEmail(emailPayload);
    } catch (err) {
      // Rethrow so BullMQ registers this as a failure and retries
      throw err;
    }

    // Update campaign delivery stats if this is a newsletter job
    if (campaignId) {
      const field = isSent ? 'stats.sent' : 'stats.failed';
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { [field]: 1 } });
    }
  },
  {
    connection,
    concurrency: 5 // Process 5 emails simultaneously
  }
);

worker.on('completed', (job) => {
  logger.info(`[Email Worker] Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  logger.error(`[Email Worker] Job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`);
});

worker.on('error', (err) => {
  logger.error(`[Email Worker] Worker error: ${err.message}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('[Email Worker] SIGTERM received. Shutting down gracefully...');
  await worker.close();
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('[Email Worker] SIGINT received. Shutting down gracefully...');
  await worker.close();
  await mongoose.connection.close();
  process.exit(0);
});

logger.info(`[Email Worker] Started. Listening on queue: "${QUEUES.EMAIL}" (concurrency: 5)`);
