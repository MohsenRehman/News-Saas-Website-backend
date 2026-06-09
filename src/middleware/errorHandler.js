const mongoose = require('mongoose');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');
const config = require('../config/config');
const AppError = require('../utils/appError');

const errorHandler = (err, req, res, next) => {
  let error = err;

  // If the error is not an instance of custom AppError, convert it
  if (!(error instanceof AppError)) {
    const statusCode =
      error.statusCode || (error instanceof mongoose.Error
        ? httpStatus.BAD_REQUEST
        : httpStatus.INTERNAL_SERVER_ERROR);
    
    const message = error.message || 'Internal Server Error';
    error = new AppError(statusCode, message, false, err.stack);
  }

  const { statusCode, message } = error;

  // Store message for morgan / log tracking if needed
  res.locals.errorMessage = error.message;

  const response = {
    success: false,
    message,
    ...(config.env === 'development' && { stack: error.stack })
  };

  // Log details
  if (config.env === 'development') {
    logger.error(err);
  } else if (!error.isOperational) {
    logger.error(`[System Error] ${error.message} - Stack: ${error.stack}`);
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
