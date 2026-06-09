const Comment = require('../models/Comment');
const News = require('../models/News');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

/**
 * Helper to check if a comment's content contains profanity or spam terms.
 */
const containsProfanityOrSpam = (text) => {
  const forbiddenPatterns = [
    /viagra/i, /casino/i, /lottery/i, /poker/i, /betting/i,
    /buy cheap/i, /make money fast/i, /free cash/i,
    /spamlink/i, /http:/i, /https:/i, // link blockers
    /badword1/i, /badword2/i
  ];
  return forbiddenPatterns.some(pattern => pattern.test(text));
};

/**
 * createComment
 * -------------
 * Creates a comment or nested reply for an article.
 * Enforces a maximum reply nesting depth of 3 levels.
 * Detects profanity/spam, storing comments as 'rejected' in the DB while throwing an error.
 */
const createComment = async (clientId, { newsId, parentId, authorName, authorEmail, content, ipAddress, userId }) => {
  // 1. Verify article exists, belongs to client, and is published
  const news = await News.findOne({ _id: newsId, clientId, status: 'published', isDeleted: false });
  if (!news) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found or not published.');
  }

  // 2. Automated profanity/spam checking
  if (containsProfanityOrSpam(content)) {
    // Audit/persist spam comments as 'rejected' for abuse tracking before throwing
    await Comment.create({
      clientId,
      newsId,
      parentId: parentId || null,
      authorName,
      authorEmail,
      userId: userId || null,
      content,
      ipAddress,
      status: 'rejected'
    });

    throw new AppError(httpStatus.BAD_REQUEST, 'Comment was rejected by automated spam filters.');
  }

  // 3. Enforce 3-level depth limit for nested comment replies
  if (parentId) {
    const parentComment = await Comment.findOne({ _id: parentId, clientId, isDeleted: false });
    if (!parentComment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Parent comment not found.');
    }

    let depth = 1;
    let currParent = parentComment;

    while (currParent.parentId) {
      depth++;
      if (depth >= 3) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Maximum reply nesting depth of 3 levels reached.');
      }
      
      currParent = await Comment.findOne({ _id: currParent.parentId, clientId, isDeleted: false });
      if (!currParent) break;
    }
  }

  // 4. Create the comment (default status is pending)
  const comment = await Comment.create({
    clientId,
    newsId,
    parentId: parentId || null,
    authorName,
    authorEmail,
    userId: userId || null,
    content,
    ipAddress,
    status: 'pending'
  });

  return comment.toObject();
};

/**
 * getCommentsForArticle
 * ---------------------
 * Public query returning approved comments structured as a nested replies tree.
 */
const getCommentsForArticle = async (clientId, newsId) => {
  // Fetch all approved comments for the article
  const comments = await Comment.find({
    clientId,
    newsId,
    status: 'approved',
    isDeleted: false
  })
    .sort({ createdAt: 1 })
    .lean();

  const commentMap = {};
  const roots = [];

  // Map each comment by string ID and prepare replies array
  comments.forEach(comment => {
    comment.replies = [];
    commentMap[comment._id.toString()] = comment;
  });

  // Nest children replies inside parents
  comments.forEach(comment => {
    if (comment.parentId) {
      const parent = commentMap[comment.parentId.toString()];
      if (parent) {
        parent.replies.push(comment);
      } else {
        // Parent not found or not approved — treat as top-level root fallback
        roots.push(comment);
      }
    } else {
      roots.push(comment);
    }
  });

  return roots;
};

/**
 * moderateComment
 * ----------------
 * Tenant admin/editor action to moderate (approve, reject, flag) comments.
 */
const moderateComment = async (clientId, commentId, status, operatorUserId) => {
  const comment = await Comment.findOne({ _id: commentId, clientId, isDeleted: false });
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found.');
  }

  comment.status = status;
  await comment.save();

  // Log moderator action
  await ActivityLog.create({
    clientId,
    userId: operatorUserId,
    module: 'comments',
    action: `comment_${status}`,
    details: { commentId: comment._id.toString(), status },
    ipAddress: 'system'
  }).catch((err) => {
    logger.error(`[CommentService] Failed to write activity log: ${err.message}`);
  });

  return comment.toObject();
};

/**
 * deleteComment
 * -------------
 * Soft deletes a comment and recursively cascades deletions to all nested replies.
 */
const deleteComment = async (clientId, commentId, operatorUserId) => {
  const comment = await Comment.findOne({ _id: commentId, clientId, isDeleted: false });
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found.');
  }

  // Soft delete main comment
  await comment.softDelete();

  // Cascade soft delete to nested children replies
  const cascadeDelete = async (parentId) => {
    const children = await Comment.find({ parentId, isDeleted: false });
    for (const child of children) {
      await child.softDelete();
      await cascadeDelete(child._id); // Recurse
    }
  };

  await cascadeDelete(comment._id);

  // Log delete action
  await ActivityLog.create({
    clientId,
    userId: operatorUserId,
    module: 'comments',
    action: 'comment_delete',
    details: { commentId: comment._id.toString() },
    ipAddress: 'system'
  }).catch((err) => {
    logger.error(`[CommentService] Failed to write activity log: ${err.message}`);
  });

  return { success: true };
};

/**
 * getPendingComments (For admin dashboard review)
 */
const getPendingComments = async (clientId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const total = await Comment.countDocuments({ clientId, status: 'pending', isDeleted: false });
  const results = await Comment.find({ clientId, status: 'pending', isDeleted: false })
    .populate('newsId', 'title slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return { results, total, page, limit };
};

module.exports = {
  createComment,
  getCommentsForArticle,
  moderateComment,
  deleteComment,
  getPendingComments
};
