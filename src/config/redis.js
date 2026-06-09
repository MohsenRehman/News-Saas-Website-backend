/**
 * src/config/redis.js
 * -------------------------------------------
 * Shared ioredis connection for BullMQ queues and workers.
 *
 * Uses connection.status === 'ready' for synchronous readiness checks
 * (avoids race conditions from async ping at startup).
 *
 * Falls back gracefully: after 3 failed connect attempts, stops retrying
 * and all queue callers fall back to synchronous execution.
 */

const Redis  = require('ioredis');
const config = require('./config');
const logger = require('./logger');

let connection = null;

if (config.redis.url) {
  connection = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Don't block on LOADING state
    retryStrategy(times) {
      if (times > 3) {
        logger.warn('[Redis] Max retries exceeded. Queue services will run in synchronous fallback mode.');
        return null; // Stop retrying
      }
      return Math.min(times * 200, 3000);
    }
  });

  connection.on('ready', () => {
    logger.info('[Redis] Connection ready. Background queues are active.');
  });

  let _errorLogged = false;
  connection.on('error', (err) => {
    if (!_errorLogged) {
      _errorLogged = true;
      logger.warn(`[Redis] Could not connect: ${err.code || err.message}. Queues will run in synchronous fallback mode once max retries are reached.`);
    }
  });

  connection.on('reconnecting', () => {
    _errorLogged = false; // Allow logging again after reconnect cycle starts
  });
} else {
  logger.info('[Redis] No REDIS_URL configured. Queues will run in synchronous fallback mode.');
}

/**
 * Synchronous check — safe to call on every request.
 * Uses ioredis .status property instead of async ping
 * so there is no await and no startup race condition.
 *
 * @returns {boolean}
 */
const isRedisReady = () => !!connection && connection.status === 'ready';

module.exports = { connection, isRedisReady };
