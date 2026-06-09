const express = require('express');
const jobService = require('../../services/job.service');
const config = require('../../config/config');
const AppError = require('../../utils/appError');
const httpStatus = require('../../constants/httpStatus');

const router = express.Router();

/**
 * Endpoint to trigger scheduled publishing (Vercel compatible cron target)
 */
router.get('/publish-scheduled', async (req, res, next) => {
  try {
    const isVercelCron = req.headers['x-vercel-cron'] === 'true';
    const authHeader = req.headers.authorization;
    const isBearerAuth = authHeader === `Bearer ${config.cronSecret}`;

    // Security Gate check
    if (!isVercelCron && !isBearerAuth) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized: Invalid cron job credentials.');
    }

    const summary = await jobService.publishScheduledArticles();
    return res.success(summary, 'Scheduled publishing trigger executed successfully.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
