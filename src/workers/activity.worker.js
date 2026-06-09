/**
 * src/workers/activity.worker.js
 * -------------------------------------------
 * STANDALONE BullMQ Worker — run as a separate process:
 *   node src/workers/activity.worker.js
 *   (or: npm run worker:activity)
 *
 * Responsibilities:
 *  - Pull activity log jobs from the BullMQ activity-queue
 *  - Buffer log entries in memory
 *  - Flush batches to MongoDB with insertMany() every 3 seconds (or when batch hits 50)
 *    This reduces per-event DB write pressure significantly for admin-heavy systems.
 *
 * NOT imported by app.js. Workers scale independently of the API server.
 */

require('dotenv').config();

const path = require('path');
process.chdir(path.join(__dirname, '../../'));

const mongoose    = require('mongoose');
const { Worker }  = require('bullmq');
const { connection } = require('../config/redis');
const { QUEUES }  = require('../constants/queueNames');
const ActivityLog = require('../models/ActivityLog');
const config      = require('../config/config');
const logger      = require('../config/logger');

// Workers require a persistent Redis connection
if (!connection) {
  logger.error('[Activity Worker] Redis is not configured. Set REDIS_URL in .env and restart.');
  process.exit(1);
}

// Connect to MongoDB for batch writes
mongoose.connect(config.mongoose.url, config.mongoose.options)
  .then(() => logger.info('[Activity Worker] MongoDB connected.'))
  .catch((err) => {
    logger.error(`[Activity Worker] MongoDB connection failed: ${err.message}`);
    process.exit(1);
  });

// ── Batch Write State ─────────────────────────────────────────────────────────
const BATCH_FLUSH_INTERVAL_MS = 3000; // Flush every 3 seconds
const BATCH_SIZE_LIMIT        = 50;   // Or immediately when 50 items accumulate

let pendingBatch = [];
let flushTimer   = null;

const flushBatch = async () => {
  if (pendingBatch.length === 0) return;

  // Grab current items and reset buffer before async write (prevents double-writes)
  const items = pendingBatch.splice(0, pendingBatch.length);

  try {
    await ActivityLog.insertMany(items, { ordered: false });
    logger.info(`[Activity Worker] Flushed ${items.length} activity log(s) via insertMany().`);
  } catch (err) {
    // ordered: false means partial success — non-failing docs ARE written
    logger.error(`[Activity Worker] insertMany() partial failure: ${err.message}`);
  }
};

const scheduledFlush = () => {
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushBatch();
  }, BATCH_FLUSH_INTERVAL_MS);
};
// ─────────────────────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUES.ACTIVITY,
  async (job) => {
    // Strip internal queue metadata — only persist actual log fields
    const { correlationId, ...logData } = job.data;

    pendingBatch.push(logData);

    // Start flush timer on first item in a new batch
    if (!flushTimer) {
      scheduledFlush();
    }

    // Immediately flush if batch is full
    if (pendingBatch.length >= BATCH_SIZE_LIMIT) {
      clearTimeout(flushTimer);
      flushTimer = null;
      await flushBatch();
    }
  },
  {
    connection,
    concurrency: 10 // Accept up to 10 concurrent log jobs
  }
);

worker.on('failed', (job, err) => {
  logger.error(`[Activity Worker] Job ${job.id} failed: ${err.message}`);
});

worker.on('error', (err) => {
  logger.error(`[Activity Worker] Worker error: ${err.message}`);
});

// Graceful shutdown — flush any pending items before exit
const gracefulShutdown = async (signal) => {
  logger.info(`[Activity Worker] ${signal} received. Flushing remaining batch...`);
  clearTimeout(flushTimer);
  await flushBatch();
  await worker.close();
  await mongoose.connection.close();
  logger.info('[Activity Worker] Shutdown complete.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

logger.info(`[Activity Worker] Started. Listening on queue: "${QUEUES.ACTIVITY}" | Batch flush every ${BATCH_FLUSH_INTERVAL_MS}ms or ${BATCH_SIZE_LIMIT} items.`);
