/**
 * src/queues/activity.queue.js
 * -------------------------------------------
 * Activity log job enqueuer with direct MongoDB fallback.
 *
 * When Redis is unavailable (local dev or disconnected):
 *   → writes directly to ActivityLog collection (synchronous).
 * When Redis is ready:
 *   → pushes to BullMQ queue; worker batches with insertMany().
 *
 * Every job carries a correlationId for traceability and retry tracking.
 */

const { Queue } = require('bullmq');
const crypto    = require('crypto');
const { connection, isRedisReady } = require('../config/redis');
const { QUEUES } = require('../constants/queueNames');
const logger    = require('../config/logger');

const activityQueue = connection
  ? new Queue(QUEUES.ACTIVITY, {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { count: 100 }
      }
    })
  : null;

/**
 * Enqueue an activity log entry.
 *
 * Falls back to direct ActivityLog.create() when Redis is unavailable,
 * so auditing never silently drops events even without a queue.
 *
 * @param {Object} logData - ActivityLog document fields (clientId, userId, action, module, ...)
 * @returns {Promise<string|Object>} Job ID if queued, Mongoose doc if direct write
 */
const enqueueActivityLog = async (logData) => {
  const correlationId = crypto.randomUUID();
  const payload = { ...logData, correlationId };

  if (isRedisReady() && activityQueue) {
    try {
      const job = await activityQueue.add(QUEUES.ACTIVITY, payload);
      return job.id;
    } catch (err) {
      logger.error(`[Activity Queue] Enqueue failed: ${err.message}. Falling back to direct DB write.`);
    }
  }

  // Direct synchronous MongoDB write fallback
  const ActivityLog = require('../models/ActivityLog');
  try {
    return await ActivityLog.create(logData);
  } catch (dbErr) {
    logger.error(`[Activity Log Fallback] DB write failed: ${dbErr.message}`);
  }
};

module.exports = { activityQueue, enqueueActivityLog };
