const redis = require('redis');
const config = require('../config/config');
const logger = require('../config/logger');

let redisClient = null;
const memoryCache = new Map();

// Initialize Redis if URL is present
if (config.redis.url) {
  try {
    redisClient = redis.createClient({ url: config.redis.url });
    
    let _cacheErrorLogged = false;
    redisClient.on('error', (err) => {
      if (!_cacheErrorLogged) {
        _cacheErrorLogged = true;
        logger.warn(`[Redis Cache] Could not connect: ${err.code || err.message}. Falling back to in-memory cache.`);
      }
    });

    redisClient.connect()
      .then(() => {
        logger.info('Redis connection established successfully.');
      })
      .catch((err) => {
        logger.error(`[Redis Connection Error] Failed to connect: ${err.message}. Falling back to in-memory cache.`);
        redisClient = null;
      });
  } catch (err) {
    logger.error(`[Redis Init Error] ${err.message}. Falling back to in-memory cache.`);
    redisClient = null;
  }
} else {
  logger.info('No Redis URL configured. Using local in-memory cache.');
}

/**
 * Retrieve a value from cache
 * @param {String} key 
 * @returns {Promise<any>}
 */
const get = async (key) => {
  if (redisClient && redisClient.isOpen) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      logger.error(`[Redis Get Error] ${err.message}`);
    }
  }
  
  // Memory Cache fallback
  const memData = memoryCache.get(key);
  if (memData) {
    if (memData.expiry > Date.now()) {
      return memData.value;
    }
    memoryCache.delete(key);
  }
  return null;
};

/**
 * Save a value to cache
 * @param {String} key 
 * @param {any} value 
 * @param {Number} ttlSeconds 
 */
const set = async (key, value, ttlSeconds = 300) => {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.set(key, JSON.stringify(value), {
        EX: ttlSeconds
      });
      return;
    } catch (err) {
      logger.error(`[Redis Set Error] ${err.message}`);
    }
  }
  
  // Memory Cache fallback
  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000
  });
};

/**
 * Delete a value from cache
 * @param {String} key 
 */
const del = async (key) => {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      logger.error(`[Redis Del Error] ${err.message}`);
    }
  }
  memoryCache.delete(key);
};

module.exports = {
  get,
  set,
  del
};
