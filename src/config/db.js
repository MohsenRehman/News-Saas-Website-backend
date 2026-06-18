const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

let cachedConnection = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (cachedConnection) {
    return cachedConnection;
  }

  logger.info('Connecting to MongoDB...');
  cachedConnection = mongoose.connect(config.mongoose.url, config.mongoose.options)
    .then((conn) => {
      logger.info(`MongoDB connection established with host: ${conn.connection.host}`);
      return conn;
    })
    .catch(async (error) => {
      cachedConnection = null;
      logger.error(`MongoDB initial connection error: ${error.message}`);
      
      const isNetworkError = error.message.includes('ECONNREFUSED') || 
                             error.message.includes('ENOTFOUND') || 
                             error.message.includes('querySrv') || 
                             error.message.includes('timeout');
                             
      if (isNetworkError && config.mongoose.url !== 'mongodb://127.0.0.1:27017/news-saas') {
        logger.warn('Detected network/DNS resolution connectivity issue. Attempting connection to local MongoDB fallback...');
        try {
          const localUri = 'mongodb://127.0.0.1:27017/news-saas';
          const conn = await mongoose.connect(localUri, config.mongoose.options);
          logger.info(`MongoDB connection established with local fallback host: ${conn.connection.host}`);
          return conn;
        } catch (localErr) {
          logger.error(`MongoDB local fallback connection failed: ${localErr.message}`);
          throw localErr;
        }
      }
      
      throw error;
    });

  return cachedConnection;
};

// Log Mongoose connection events
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connection status: Connected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`Mongoose connection status: Error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose connection status: Disconnected');
});

module.exports = connectDB;

