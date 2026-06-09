const Joi = require('joi');
const httpStatus = require('../constants/httpStatus');
const AppError = require('../utils/appError');

const validate = (schema) => (req, res, next) => {
  const validKeys = ['params', 'query', 'body'];
  const object = {};
  
  validKeys.forEach((key) => {
    if (schema[key] && req[key] && Object.keys(req[key]).length > 0) {
      object[key] = req[key];
    }
  });

  const schemaToValidate = {};
  validKeys.forEach((key) => {
    if (schema[key]) {
      schemaToValidate[key] = schema[key];
    }
  });

  const { value, error } = Joi.compile(schemaToValidate)
    .prefs({ errors: { label: 'key' }, abortEarly: false })
    .validate(object);

  if (error) {
    const errorMessage = error.details.map((details) => details.message).join(', ');
    return next(new AppError(httpStatus.BAD_REQUEST, errorMessage));
  }
  
  Object.assign(req, value);
  return next();
};

module.exports = validate;
