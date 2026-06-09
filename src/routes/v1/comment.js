const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const commentValidator = require('../../validators/comment.validator');
const commentController = require('../../controllers/comment.controller');
const tokenUtil = require('../../utils/token');
const userRepository = require('../../repositories/user.repository');

const router = express.Router();

// Strict rate limiter for public comment posting: Max 10 comment submissions per 15 minutes per IP
const commentPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many comments submitted from this IP. Please try again after 15 minutes.'
});

// Middleware to optionally authenticate a public user
const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Guest visitor comment
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = tokenUtil.verifyAccessToken(token);
    const user = await userRepository.findById(decoded.id);
    
    if (user && user.status === 'active') {
      req.user = {
        _id: user._id,
        id: user._id,
        role: user.role,
        clientId: user.clientId
      };
    }
  } catch (err) {
    // If token is invalid/expired, fall back to guest commentary
  }
  return next();
};

// ─── Public Endpoints ────────────────────────────────────────────────────────

/**
 * POST /api/v1/comments
 * Submit a comment or nested reply.
 */
router.post(
  '/',
  commentPostLimiter,
  optionalAuthenticate,
  validate(commentValidator.createComment),
  commentController.createComment
);

/**
 * GET /api/v1/comments/article/:newsId
 * Retrieve approved nested comments tree for an article.
 */
router.get(
  '/article/:newsId',
  validate(commentValidator.getCommentsForArticle),
  commentController.getCommentsForArticle
);

// ─── Admin/Editor Endpoints ──────────────────────────────────────────────────

// All administrative routes require active credentials and editor/admin access
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

/**
 * GET /api/v1/comments/admin/pending
 * Retrieve pending comments.
 */
router.get(
  '/admin/pending',
  commentController.getPendingComments
);

/**
 * PATCH /api/v1/comments/admin/:commentId/status
 * Moderate status of a comment (approve, reject, flag).
 */
router.patch(
  '/admin/:commentId/status',
  validate(commentValidator.moderateComment),
  commentController.moderateComment
);

/**
 * DELETE /api/v1/comments/admin/:commentId
 * Soft delete a comment and its replies.
 */
router.delete(
  '/admin/:commentId',
  commentController.deleteComment
);

module.exports = router;
