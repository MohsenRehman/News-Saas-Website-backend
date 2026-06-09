const Joi = require('joi');

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required()
  })
};

const forgotPassword = {
  body: Joi.object().keys({
    email: Joi.string().required().email()
  })
};

const resetPassword = {
  query: Joi.object().keys({
    token: Joi.string().required()
  }),
  body: Joi.object().keys({
    password: Joi.string().required().min(6).messages({
      'string.min': 'Password must be at least 6 characters long'
    })
  })
};

const changePassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().min(6).messages({
      'string.min': 'New password must be at least 6 characters long'
    })
  })
};

module.exports = {
  login,
  forgotPassword,
  resetPassword,
  changePassword
};
