const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const config = require('./config/config');
const connectDB = require('./config/db');
const responseFormatter = require('./middleware/responseFormatter');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/appError');
const httpStatus = require('./constants/httpStatus');
const logger = require('./config/logger');
const sanitizeInput = require('./middleware/sanitize');
const { resolveDomain } = require('./tenants/domainResolver');

const app = express();

// Establish MongoDB Connection
connectDB();

// 1. Logging Setup (Morgan piped to Winston)
const morganFormat = ':method :url :status :res[content-length] - :response-time ms';

const successLogHandler = morgan(morganFormat, {
  skip: (req, res) => res.statusCode >= 400,
  stream: { write: (message) => logger.info(message.trim()) }
});

const errorLogHandler = morgan(morganFormat, {
  skip: (req, res) => res.statusCode < 400,
  stream: { write: (message) => logger.error(message.trim()) }
});

if (config.env !== 'test') {
  app.use(successLogHandler);
  app.use(errorLogHandler);
}

// 2. Security Middlewares
app.use(helmet()); // Secure HTTP response headers
app.use(cookieParser()); // Parse Cookie headers (useful for JWT refresh tokens)

// Configure Dynamic Tenant CORS Origin Resolution
const ALLOWED_ORIGINS = [
  'https://news-saas-website-frontend.vercel.app',
  'https://news-saas-website-frontend-35ny.vercel.app',
  'https://saasnews.com',
];

const corsOptions = {
  origin: async (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    // Allow localhost in development
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }

    // Allow explicitly whitelisted production origins
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    try {
      const host = origin.replace(/^https?:\/\//, '');
      const client = await resolveDomain(host);

      if (client) {
        callback(null, true);
      } else {
        callback(new AppError(httpStatus.FORBIDDEN, 'CORS policy blocked access from this origin.'));
      }
    } catch (err) {
      callback(new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'CORS resolution error.'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

// Inbound receiver: mounted BEFORE json body parser (uses raw body for Stripe sig)
app.use('/api/v1/webhooks/inbound', require('./routes/v1/inbound'));

// Parse body requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Data Sanitization against NoSQL injection
app.use(mongoSanitize());

// HTTP Parameter Pollution protection
app.use(hpp());

// XSS Sanitization Middleware
app.use(sanitizeInput);

// Global General Rate Limiter (IP + User ID hybrid)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP/User to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `${req.user._id}` : req.ip;
  },
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(limiter);

// Brute-force auth Rate Limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit to 15 attempts
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? `${req.user._id}` : req.ip;
  },
  message: 'Too many login attempts, please try again after 15 minutes'
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);


// 3. Response Custom Formatting Middleware
app.use(responseFormatter);

// Mount Multi-Tenant Resolver Middleware
const resolveTenant = require('./middleware/tenant');
app.use(resolveTenant);

// Mount Global Admin API Request Tracking and Plan Limits Middleware
const { trackAndLimitApiRequests } = require('./middleware/usage');
app.use(trackAndLimitApiRequests);

// 4. API Endpoints (Versioned v1)
app.use('/api/v1/health', require('./routes/v1/health'));
app.use('/api/v1/auth', require('./routes/v1/auth'));
app.use('/api/v1/platform', require('./routes/v1/platform'));
app.use('/api/v1/admin', require('./routes/v1/admin'));
app.use('/api/v1/admin/contacts', require('./routes/v1/contact'));
app.use('/api/v1/news', require('./routes/v1/news'));
app.use('/api/v1/ai', require('./routes/v1/ai'));
app.use('/api/v1/categories', require('./routes/v1/category'));
app.use('/api/v1/media', require('./routes/v1/media'));
app.use('/api/v1/advertisements', require('./routes/v1/advertisement'));
app.use('/api/v1/analytics', require('./routes/v1/analytics'));
app.use('/api/v1/public', require('./routes/v1/public'));
app.use('/api/v1/search', require('./routes/v1/search'));
app.use('/api/v1/notifications', require('./routes/v1/notification'));
app.use('/api/v1/jobs', require('./routes/v1/job'));
app.use('/api/v1/admin/subscription', require('./routes/v1/subscription'));
app.use('/api/v1/payments', require('./routes/v1/payment'));
app.use('/api/v1/webhooks', require('./routes/v1/webhook'));
app.use('/api/v1/email', require('./routes/v1/email'));
app.use('/api/v1/comments', require('./routes/v1/comment'));
app.use('/api/v1/newsletter', require('./routes/v1/newsletter'));

// Root health-check route — returned when backend URL is visited directly
app.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'News SaaS API is running.' });
});

// 5. 404 Route Not Found Middleware — skip socket.io paths (handled by Socket.IO server, not Express)
app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  next(new AppError(httpStatus.NOT_FOUND, `Route not found: ${req.originalUrl}`));
});

// 6. Global Error Handler Boundary
app.use(errorHandler);

// Server startup listener
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port} in [${config.env}] environment`);
  });
  // Initialize Socket.IO Server
  const socketService = require('./config/socket');
  socketService.init(server);

  // Initialize Background Workers inline for single-process environments (local dev)
  if (config.redis.url) {
    const { Worker } = require('bullmq');
    const { connection } = require('./config/redis');
    const { sendEmail } = require('./services/email.service');
    const { QUEUES } = require('./constants/queueNames');
    const Campaign = require('./models/Campaign');
    const ActivityLog = require('./models/ActivityLog');

    // 1. Email worker
    const emailWorker = new Worker(
      QUEUES.EMAIL,
      async (job) => {
        const { campaignId, correlationId, ...emailPayload } = job.data;
        logger.info(`[Inline Email Worker] Processing job ${job.id} | correlationId=${correlationId} | to=${emailPayload.to}`);
        try {
          const isSent = await sendEmail(emailPayload);
          if (campaignId) {
            const field = isSent ? 'stats.sent' : 'stats.failed';
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { [field]: 1 } });
          }
        } catch (err) {
          logger.error(`[Inline Email Worker] Failed to send email for job ${job.id}: ${err.message}`);
          throw err;
        }
      },
      { connection, concurrency: 5 }
    );

    emailWorker.on('completed', (job) => {
      logger.info(`[Inline Email Worker] Job ${job.id} completed.`);
    });
    emailWorker.on('failed', (job, err) => {
      logger.error(`[Inline Email Worker] Job ${job.id} failed: ${err.message}`);
    });
    emailWorker.on('error', (err) => {
      logger.error(`[Inline Email Worker] Worker error: ${err.message}`);
    });

    // 2. Activity worker
    const BATCH_FLUSH_INTERVAL_MS = 3000;
    const BATCH_SIZE_LIMIT        = 50;
    let pendingBatch = [];
    let flushTimer   = null;

    const flushBatch = async () => {
      if (pendingBatch.length === 0) return;
      const items = pendingBatch.splice(0, pendingBatch.length);
      try {
        await ActivityLog.insertMany(items, { ordered: false });
        logger.info(`[Inline Activity Worker] Flushed ${items.length} activity log(s).`);
      } catch (err) {
        logger.error(`[Inline Activity Worker] insertMany failed: ${err.message}`);
      }
    };

    const scheduledFlush = () => {
      flushTimer = setTimeout(async () => {
        flushTimer = null;
        await flushBatch();
      }, BATCH_FLUSH_INTERVAL_MS);
    };

    const activityWorker = new Worker(
      QUEUES.ACTIVITY,
      async (job) => {
        const { correlationId, ...logData } = job.data;
        pendingBatch.push(logData);
        if (!flushTimer) {
          scheduledFlush();
        }
        if (pendingBatch.length >= BATCH_SIZE_LIMIT) {
          clearTimeout(flushTimer);
          flushTimer = null;
          await flushBatch();
        }
      },
      { connection, concurrency: 10 }
    );

    activityWorker.on('failed', (job, err) => {
      logger.error(`[Inline Activity Worker] Job ${job.id} failed: ${err.message}`);
    });
    activityWorker.on('error', (err) => {
      logger.error(`[Inline Activity Worker] Worker error: ${err.message}`);
    });

    // Clean up worker connections on exit
    process.on('SIGTERM', async () => {
      logger.info('[Inline Workers] Cleaning up worker connections...');
      await emailWorker.close();
      clearTimeout(flushTimer);
      await flushBatch();
      await activityWorker.close();
    });
    process.on('SIGINT', async () => {
      logger.info('[Inline Workers] Cleaning up worker connections...');
      await emailWorker.close();
      clearTimeout(flushTimer);
      await flushBatch();
      await activityWorker.close();
    });

    logger.info('[Inline Workers] Email and Activity workers initialized and listening to queues.');
  }
}

// Graceful shut down / Error handling triggers
const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server connection closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error('Unexpected error encountered:', error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

module.exports = app;
