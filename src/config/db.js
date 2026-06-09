const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');

const connectDB = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    const conn = await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(`MongoDB connection established with host: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB initial connection error: ${error.message}`);
    logger.warn('Server starting with database in DISCONNECTED state. Mongoose will attempt to reconnect automatically.');
  }
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
