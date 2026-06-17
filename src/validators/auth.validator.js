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

const verifyResetOtp = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    otp: Joi.string().required().length(6).pattern(/^\d+$/).messages({
      'string.length': 'OTP must be exactly 6 digits',
      'string.pattern.base': 'OTP must contain only digits'
    })
  })
};

const resetPassword = {
  body: Joi.object().keys({
    resetToken: Joi.string().required(),
    newPassword: Joi.string().required().min(6).messages({
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

const updateProfile = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    email: Joi.string().required().lowercase().trim().email(),
    profileImage: Joi.string().allow('', null).optional()
  })
};

module.exports = {
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  changePassword,
  updateProfile
};
