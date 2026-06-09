const httpStatus = require('../constants/httpStatus');

const responseFormatter = (req, res, next) => {
  res.success = (data = null, message = 'Success', statusCode = httpStatus.OK) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  };
  next();
};

module.exports = responseFormatter;
