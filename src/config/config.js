const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(5000),
    MONGO_URI: Joi.string().required().description('Mongo DB connection string'),
    CLIENT_URL: Joi.string().required().description('Client URL for CORS'),
    JWT_SECRET: Joi.string().required().description('JWT access token secret key'),
    JWT_REFRESH_SECRET: Joi.string().required().description('JWT refresh token secret key'),
    CLOUDINARY_CLOUD_NAME: Joi.string().allow('').default(''),
    CLOUDINARY_API_KEY: Joi.string().allow('').default(''),
    CLOUDINARY_API_SECRET: Joi.string().allow('').default(''),
    GEMINI_API_KEY: Joi.string().allow('').default(''),
    OPENAI_API_KEY: Joi.string().allow('').default(''),
    OPENROUTER_API_KEY: Joi.string().allow('').default(''),
    SMTP_HOST: Joi.string().allow('').default(''),
    SMTP_PORT: Joi.number().default(2525),
    SMTP_USER: Joi.string().allow('').default(''),
    SMTP_PASS: Joi.string().allow('').default(''),
    MAIL_HOST: Joi.string().allow('').default(''),
    MAIL_PORT: Joi.number().default(587),
    MAIL_USERNAME: Joi.string().allow('').default(''),
    MAIL_PASSWORD: Joi.string().allow('').default(''),
    MAIL_FROM_ADDRESS: Joi.string().allow('').default(''),
    MAIL_FROM_NAME: Joi.string().allow('').default(''),
    REDIS_URL: Joi.string().allow('').default(''),
    CRON_SECRET: Joi.string().default('super_cron_secret_123'),
    WEBHOOK_ENCRYPTION_KEY: Joi.string().length(64).default('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2').description('32-byte hex key for AES-256-CBC webhook secret encryption'),
    STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
    STRIPE_PUBLISHABLE_KEY: Joi.string().allow('').default(''),
    STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
    SEARCH_PROVIDER: Joi.string().valid('atlas', 'native').default('native'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGO_URI,
    options: {},
  },
  clientUrl: envVars.CLIENT_URL,
  jwt: {
    secret: envVars.JWT_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
  },
  cloudinary: {
    cloudName: envVars.CLOUDINARY_CLOUD_NAME,
    apiKey: envVars.CLOUDINARY_API_KEY,
    apiSecret: envVars.CLOUDINARY_API_SECRET,
  },
  ai: {
    geminiKey: envVars.GEMINI_API_KEY,
    openaiKey: envVars.OPENAI_API_KEY,
    openrouterKey: envVars.OPENROUTER_API_KEY,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST || envVars.MAIL_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : envVars.MAIL_PORT,
      auth: {
        user: envVars.SMTP_USER || envVars.MAIL_USERNAME,
        pass: envVars.SMTP_PASS || envVars.MAIL_PASSWORD,
      },
    },
    from: {
      address: envVars.MAIL_FROM_ADDRESS || envVars.SMTP_USER || envVars.MAIL_USERNAME || 'noreply@saasnews.com',
      name: envVars.MAIL_FROM_NAME || 'NewsVerce'
    }
  },
  redis: {
    url: envVars.REDIS_URL,
  },
  cronSecret: envVars.CRON_SECRET,
  webhookEncryptionKey: envVars.WEBHOOK_ENCRYPTION_KEY,
  stripe: {
    secretKey: envVars.STRIPE_SECRET_KEY,
    publishableKey: envVars.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
  },
  searchProvider: envVars.SEARCH_PROVIDER,
};
