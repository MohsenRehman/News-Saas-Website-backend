const commentService = require('../services/comment.service');

/**
 * POST /api/v1/comments
 * Post a public comment or nested reply.
 */
const createComment = async (req, res, next) => {
  try {
    const { newsId, parentId, authorName, authorEmail, content } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const userId = req.user ? (req.user.id || req.user._id) : null;

    const comment = await commentService.createComment(req.clientId, {
      newsId,
      parentId,
      authorName,
      authorEmail,
      content,
      ipAddress,
      userId
    });

    return res.success(comment, 'Comment submitted successfully and is awaiting moderation.', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/comments/article/:newsId
 * Public endpoint to fetch comments as a nested tree hierarchy for an article.
 */
const getCommentsForArticle = async (req, res, next) => {
  try {
    const { newsId } = req.params;
    const commentTree = await commentService.getCommentsForArticle(req.clientId, newsId);

    return res.success(commentTree, 'Comments tree retrieved successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/comments/admin/pending
 * Fetch pending comments for tenant review (admin/editor only).
 */
const getPendingComments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const data = await commentService.getPendingComments(req.clientId, { page, limit });

    return res.success(data, 'Pending comments list retrieved.');
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/v1/comments/admin/:commentId/status
 * Moderate status of a comment (admin/editor only).
 */
const moderateComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { status } = req.body;

    const moderated = await commentService.moderateComment(req.clientId, commentId, status, req.user.id || req.user._id);

    return res.success(moderated, `Comment status successfully set to: ${status}`);
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/v1/comments/admin/:commentId
 * Soft delete a comment and its nested replies (admin/editor only).
 */
const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;

    const result = await commentService.deleteComment(req.clientId, commentId, req.user.id || req.user._id);

    return res.success(result, 'Comment and its nested replies deleted successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/comments/admin/list
 * Fetch all comments with tab filters, search, and page pagination (admin/editor only).
 */
const getAdminComments = async (req, res, next) => {
  try {
    const { page, limit, tab, search, newsId, authorEmail } = req.query;
    const data = await commentService.getAdminComments(req.clientId, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      tab: tab || 'all',
      search: search || '',
      newsId: newsId || '',
      authorEmail: authorEmail || ''
    });

    return res.success(data, 'Comments list retrieved successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/comments/admin/:commentId/restore
 * Restore a soft-deleted comment from Trash (admin/editor only).
 */
const restoreComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const restored = await commentService.restoreComment(req.clientId, commentId, req.user.id || req.user._id);

    return res.success(restored, 'Comment successfully restored from Trash.');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/comments/admin/:commentId/permanent
 * Hard delete a comment and its nested replies (admin/editor only).
 */
const deleteCommentPermanently = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const result = await commentService.deleteCommentPermanently(req.clientId, commentId, req.user.id || req.user._id);

    return res.success(result, 'Comment permanently deleted.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/comments/:commentId/report
 * Submit a public flag/report on a comment.
 */
const reportComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { reason, commentText } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const reported = await commentService.reportComment(req.clientId, commentId, {
      reason,
      commentText,
      ipAddress
    });

    return res.success(reported, 'Comment flagged successfully.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/comments/admin/user/moderate
 * Mute or ban a user email address (admin/editor only).
 */
const moderateUser = async (req, res, next) => {
  try {
    const { email, action, reason } = req.body;
    const result = await commentService.moderateUser(req.clientId, {
      email,
      action,
      reason,
      operatorUserId: req.user.id || req.user._id
    });

    return res.success(result, `User moderated successfully: ${action}`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createComment,
  getCommentsForArticle,
  getPendingComments,
  moderateComment,
  deleteComment,
  getAdminComments,
  restoreComment,
  deleteCommentPermanently,
  reportComment,
  moderateUser
};
