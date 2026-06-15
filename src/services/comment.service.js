const Comment = require('../models/Comment');
const News = require('../models/News');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

/**
 * Simulated AI Moderation check for Toxicity, Profanity, and Spam.
 * - Toxic -> 'rejected' (Auto Reject)
 * - Suspicious/Spam -> 'spam' or 'pending' (Flagged / Pending Review)
 * - Safe -> 'approved' (Auto Approve)
 */
/**
 * Run AI Moderation check for Toxicity, Profanity, and Spam.
 * Uses real AI API (OpenRouter/Gemini/OpenAI) if keys are present,
 * and falls back to a rule-based regex engine matching the system prompt instructions.
 */
const runAIModeration = async (content) => {
  const lowercase = content.toLowerCase();

  const systemPrompt = `You are an AI Comment Moderation System for a professional News Website.

Your job is to moderate comments written in:
* English
* Urdu
* Pashto
* Roman Urdu
* Roman Pashto
* Mixed Urdu + English
* Mixed Pashto + English
* Mixed Urdu + Pashto + English

Examples:
Urdu: "یہ خبر غلط ہے"
Pashto: "دا خبر سمه نه ده"
Roman Urdu: "ye khabar theek nahi hai"
Roman Pashto: "da khabara sahi na da"
Mixed: "ye article da sahi na da"

---

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "status": "APPROVED | PENDING | SPAM",
  "reason": "short_reason",
  "confidence": 0.95
}

No explanations.
No markdown.
No extra text.

---

## APPROVED

Approve comments containing:
* Opinions
* Criticism
* Negative feedback
* Positive feedback
* Questions
* Discussions
* Personal experiences
* Disagreement with article
* Disagreement with author
* Disagreement with website
* Product reviews
* Political opinions without abuse

Examples:
"This article is wrong"
"I disagree with this news"
"Not a good website"
"This medicine did not work for me"
"یہ خبر درست نہیں لگتی"
"مجھے اس خبر سے اتفاق نہیں"
"دا خبر سمه نه ده"
"ستا مقاله زما خوښه نه شوه"
"da website kha na da"
"da article sahi na da"

These are NOT spam.

---

## PENDING

Send for human review if comment contains:
* Medical claims
* Health claims
* Legal accusations
* Criminal allegations
* Financial advice
* Defamation risks
* Political conspiracy claims
* Serious misinformation
* Claims requiring verification

Examples:
"This medicine killed people"
"This company steals money"
"The government is hiding evidence"
"دا دوا خلک وژني"
"یہ کمپنی لوگوں کو لوٹ رہی ہے"

Return:
{
  "status":"PENDING",
  "reason":"medical_claim",
  "confidence":0.85
}

---

## SPAM

Mark as SPAM if comment contains:
* Profanity
* Abusive language
* Personal attacks
* Harassment
* Hate speech
* Racism
* Religious hatred
* Threats
* Scam promotion
* Gambling promotion
* Fake giveaways
* Malware links
* Adult content
* Excessive advertising
* Repeated messages
* Bot-like comments

Examples:
"You are an idiot"
"All writers are stupid"
"Click here and earn money"
"Free crypto giveaway"
"Visit my casino website"
Repeated message posted many times

---

## IMPORTANT RULES

DO NOT mark a comment as SPAM merely because it is:
* Negative
* Critical
* Disagrees with the article
* Disagrees with the website
* Disagrees with the author
* Complains about a product
* Complains about a company
* Complains about the government

Negative opinions are allowed.

Examples that MUST be APPROVED:
"Not good website"
"This article is incorrect"
"I don't trust this news"
"دا ويب سايټ ښه نه دی"
"ye article ghalat hai"
"da khabara sahi na da"

---

## ROMAN PASHTO SUPPORT

Understand common Roman Pashto patterns such as:
da, sta, zma, khabara, sahi, na da, der kha, der kharab, maloomigi, wala, yama, yam, de, daase, hagha, taaso
Moderate based on meaning, not spelling.

---

## ROMAN URDU SUPPORT

Understand common Roman Urdu patterns such as:
ye, khabar, theek, nahi, acha, ghalat, bewaqoof, fraud, dhoka, sahi, galat
Moderate based on meaning, not spelling.

---

## FINAL RULE

When uncertain:
Return PENDING instead of SPAM.
Human moderators should review uncertain cases.

Comment to moderate:
"${content}"`;

  const aiService = require('./ai.service');
  const config = require('../config/config');

  let provider = 'openrouter';
  let hasRealKey = false;

  if (config.ai.openrouterKey && !config.ai.openrouterKey.startsWith('placeholder')) {
    provider = 'openrouter';
    hasRealKey = true;
  } else if (config.ai.geminiKey && !config.ai.geminiKey.startsWith('placeholder')) {
    provider = 'gemini';
    hasRealKey = true;
  } else if (config.ai.openaiKey && !config.ai.openaiKey.startsWith('placeholder')) {
    provider = 'openai';
    hasRealKey = true;
  }

  if (hasRealKey) {
    try {
      let resultText = '';
      if (provider === 'openrouter') {
        resultText = await aiService.callOpenRouter(systemPrompt);
      } else if (provider === 'gemini') {
        resultText = await aiService.callGemini(systemPrompt);
      } else if (provider === 'openai') {
        resultText = await aiService.callOpenAI(systemPrompt);
      }

      // Try parsing JSON format
      const jsonStart = resultText.indexOf('{');
      const jsonEnd = resultText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonString = resultText.slice(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonString);
        if (parsed && parsed.status) {
          const cleanStatus = parsed.status.trim().toUpperCase();
          if (['APPROVED', 'PENDING', 'SPAM'].includes(cleanStatus)) {
            return cleanStatus.toLowerCase();
          }
        }
      }

      // Fallback clean-text checks
      const cleanResult = resultText.trim().toUpperCase();
      if (cleanResult.includes('APPROVED')) return 'approved';
      if (cleanResult.includes('PENDING')) return 'pending';
      if (cleanResult.includes('SPAM')) return 'spam';
    } catch (err) {
      logger.error(`[AI Comment Moderation Error] Provider ${provider} failed: ${err.message}. Using fallback regex.`);
    }
  }

  // Fallback Rule-Based Regex matching the user rules for multilingual comments
  // 1. Strict check for SPAM indicators (abusive words, scams, crypto giveaways, gambling)
  const spamTerms = [
    /fuck/i, /shit/i, /bitch/i, /asshole/i, /cunt/i, /stupid/i, /loser/i, /garbage/i, /idiot/i, /bastard/i, /retard/i,
    /kamina/i, /harami/i, /bewaqoof/i, /gand/i, /gandu/i, /lodu/i, /madarchod/i, /behenchod/i, /chutiya/i,
    /khabees/i, /shetaan/i, /dushman/i,
    /kill/i, /suicide/i, /die/i, /murder/i, /threat/i, /mram/i, /wazham/i, /marr/i, /maro/i,
    /casino/i, /poker/i, /betting/i, /lottery/i, /viagra/i, /free cash/i, /make money/i, /earn \$[0-9]+/i, /click here/i,
    /free crypto/i, /giveaway/i, /paisa kama/i, /paisa kamayein/i, /visit my website/i, /cheap/i, /buy cheap/i, /spamlink/i,
    /dangerous/i, /scam/i, /fraud/i, /fake/i, /cheat/i, /phishing/i
  ];
  const isSpam = spamTerms.some(term => term.test(lowercase));
  if (isSpam) {
    return 'spam';
  }

  // 2. Check for PENDING indicators (Medical/health claims, financial claims, political conspiracy, serious accusations, legal claims)
  const pendingTerms = [
    /medicine/i, /cure/i, /doctor/i, /vaccine/i, /illness/i, /dawa/i, /ilaj/i, /shifa/i, /daroo/i,
    /government/i, /politician/i, /minister/i, /hukumat/i, /wazir/i, /corrupt/i, /bribe/i, /rishwat/i,
    /conspiracy/i, /hiding/i, /steals money/i, /stole/i, /stolen/i, /loot/i, /looting/i,
    /finance/i, /stock/i, /invest/i, /trading/i, /crypto/i,
    /misinformation/i, /fake news/i, /lie/i, /lying/i, /jhooth/i, /drogh/i, /darogh/i,
    /court/i, /police/i, /criminal/i, /illegal/i, /arrest/i
  ];
  const isPending = pendingTerms.some(term => term.test(lowercase));
  if (isPending) {
    return 'pending';
  }

  // 3. Otherwise APPROVED
  return 'approved';
};

/**
 * createComment
 * -------------
 * Creates a comment or nested reply for an article.
 * Enforces depth limit, runs AI spam filters, and validates email bans.
 */
const createComment = async (clientId, { newsId, parentId, authorName, authorEmail, content, ipAddress, userId }) => {
  // 1. Verify article exists, belongs to client, and is published
  const news = await News.findOne({ _id: newsId, clientId, status: 'published', isDeleted: false });
  if (!news) {
    throw new AppError(httpStatus.NOT_FOUND, 'News article not found or not published.');
  }

  // 2. Validate email ban/mute status
  const BannedEmail = require('../models/BannedEmail');
  const banRecord = await BannedEmail.findOne({ clientId, email: authorEmail.toLowerCase().trim() });
  if (banRecord && banRecord.status === 'banned') {
    throw new AppError(httpStatus.FORBIDDEN, 'Your email address has been banned from posting comments on this platform.');
  }

  // 3. Automated AI Toxicity & Spam filter
  const moderationResult = await runAIModeration(content);
  
  // Determine initial status based on AI result & tenant settings
  let status = 'pending';
  if (moderationResult === 'spam') {
    status = 'spam';
  } else if (moderationResult === 'pending') {
    status = 'pending';
  } else if (moderationResult === 'approved') {
    const WebsiteSettings = require('../models/WebsiteSettings');
    const settings = await WebsiteSettings.findOne({ clientId, isDeleted: { $ne: true } });
    const approvalRequired = settings?.features?.commentsApprovalRequired ?? false;
    status = approvalRequired ? 'pending' : 'approved';
  }

  // If email is muted, force status to pending regardless of settings
  if (banRecord && banRecord.status === 'muted') {
    status = 'pending';
  }

  // 4. Enforce 3-level depth limit for nested comment replies
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

  // 5. Create the comment
  const comment = await Comment.create({
    clientId,
    newsId,
    parentId: parentId || null,
    authorName,
    authorEmail,
    userId: userId || null,
    content,
    ipAddress,
    status
  });

  return comment.toObject();
};

/**
 * getCommentsForArticle
 * ---------------------
 * Public query returning approved comments structured as a nested replies tree.
 * Filters out comments from banned email addresses.
 */
const getCommentsForArticle = async (clientId, newsId) => {
  // Fetch banned email list for client
  const BannedEmail = require('../models/BannedEmail');
  const bannedEmails = await BannedEmail.find({ clientId, status: 'banned' }).select('email').lean();
  const bannedEmailList = bannedEmails.map(b => b.email);

  // Fetch all approved comments for the article
  const comments = await Comment.find({
    clientId,
    newsId,
    status: 'approved',
    authorEmail: { $nin: bannedEmailList },
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
 * Records the admin who deleted the comment.
 */
const deleteComment = async (clientId, commentId, operatorUserId) => {
  const comment = await Comment.findOne({ _id: commentId, clientId, isDeleted: false });
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found.');
  }

  // Soft delete main comment with auditor info
  comment.deletedBy = operatorUserId;
  await comment.softDelete();

  // Cascade soft delete to nested children replies
  const cascadeDelete = async (parentId) => {
    const children = await Comment.find({ parentId, isDeleted: false });
    for (const child of children) {
      child.deletedBy = operatorUserId;
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
 * getPendingComments (For backward compatibility, delegates to getAdminComments)
 */
const getPendingComments = async (clientId, options = {}) => {
  return getAdminComments(clientId, { ...options, tab: 'pending' });
};

/**
 * getAdminComments
 * ----------------
 * Fetch comments for admin panel, categorized by tabs with text search & article filters.
 */
const getAdminComments = async (clientId, queryOptions = {}) => {
  const { page = 1, limit = 10, tab = 'all', search = '', newsId = '', authorEmail = '' } = queryOptions;
  const skip = (page - 1) * limit;

  // Build query filters
  const query = { clientId };

  if (tab === 'trash') {
    query.isDeleted = true;
  } else {
    query.isDeleted = false;
    
    if (tab === 'pending') query.status = 'pending';
    else if (tab === 'approved') query.status = 'approved';
    else if (tab === 'rejected') query.status = 'rejected';
    else if (tab === 'spam') query.status = 'spam';
    else if (tab === 'reported') query['reports.0'] = { $exists: true };
  }

  // Text search (case-insensitive regex)
  if (search) {
    query.$or = [
      { content: { $regex: search, $options: 'i' } },
      { authorName: { $regex: search, $options: 'i' } },
      { authorEmail: { $regex: search, $options: 'i' } }
    ];
  }

  // Article filter
  if (newsId) {
    query.newsId = newsId;
  }

  // Author email filter
  if (authorEmail) {
    query.authorEmail = authorEmail.toLowerCase().trim();
  }

  // Fetch comments with populated news details
  const total = await Comment.countDocuments(query);
  const results = await Comment.find(query)
    .populate('newsId', 'title slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Fetch counts for all categories dynamically to populate tab badges
  const counts = {
    all: await Comment.countDocuments({ clientId, isDeleted: false }),
    pending: await Comment.countDocuments({ clientId, status: 'pending', isDeleted: false }),
    approved: await Comment.countDocuments({ clientId, status: 'approved', isDeleted: false }),
    rejected: await Comment.countDocuments({ clientId, status: 'rejected', isDeleted: false }),
    spam: await Comment.countDocuments({ clientId, status: 'spam', isDeleted: false }),
    reported: await Comment.countDocuments({ clientId, 'reports.0': { $exists: true }, isDeleted: false }),
    trash: await Comment.countDocuments({ clientId, isDeleted: true })
  };

  return { results, total, page, limit, counts };
};

/**
 * restoreComment
 * --------------
 * Restores a soft-deleted comment from Trash, cascading to nested replies.
 */
const restoreComment = async (clientId, commentId, operatorUserId) => {
  // Query trash comments explicitly
  const comment = await Comment.findOne({ _id: commentId, clientId, isDeleted: true });
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found in Trash.');
  }

  // Restore main comment
  await comment.restore();
  comment.deletedBy = null;
  await comment.save();

  // Cascade restore to replies
  const cascadeRestore = async (parentId) => {
    const children = await Comment.find({ parentId, isDeleted: true });
    for (const child of children) {
      await child.restore();
      child.deletedBy = null;
      await child.save();
      await cascadeRestore(child._id);
    }
  };

  await cascadeRestore(comment._id);

  // Log restore action
  await ActivityLog.create({
    clientId,
    userId: operatorUserId,
    module: 'comments',
    action: 'comment_restore',
    details: { commentId: comment._id.toString() },
    ipAddress: 'system'
  }).catch((err) => {
    logger.error(`[CommentService] Failed to write activity log: ${err.message}`);
  });

  return comment.toObject();
};

/**
 * deleteCommentPermanently
 * ------------------------
 * Physically deletes a comment and its cascade replies from the DB.
 */
const deleteCommentPermanently = async (clientId, commentId, operatorUserId) => {
  // Query all comments regardless of isDeleted status
  const comment = await Comment.findOne({ _id: commentId, clientId }).where({ isDeleted: { $in: [true, false] } });
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found.');
  }

  await comment.deleteOne();

  // Cascade delete replies permanently
  const cascadeDelete = async (parentId) => {
    const children = await Comment.find({ parentId }).where({ isDeleted: { $in: [true, false] } });
    for (const child of children) {
      await child.deleteOne();
      await cascadeDelete(child._id);
    }
  };

  await cascadeDelete(comment._id);

  // Log permanent delete action
  await ActivityLog.create({
    clientId,
    userId: operatorUserId,
    module: 'comments',
    action: 'comment_permanent_delete',
    details: { commentId: commentId },
    ipAddress: 'system'
  }).catch((err) => {
    logger.error(`[CommentService] Failed to write activity log: ${err.message}`);
  });

  return { success: true };
};

/**
 * reportComment
 * -------------
 * Public flag/report submission on a comment.
 */
const reportComment = async (clientId, commentId, { reason, commentText, ipAddress }) => {
  const comment = await Comment.findOne({ _id: commentId, clientId, isDeleted: false });
  if (!comment) {
    throw new AppError(httpStatus.NOT_FOUND, 'Comment not found.');
  }

  // Append new report
  comment.reports.push({
    reason,
    comment: commentText || '',
    ipAddress: ipAddress || 'unknown',
    reportedAt: new Date()
  });

  // Flag status as reported
  comment.status = 'reported';
  await comment.save();

  return comment.toObject();
};

/**
 * moderateUser
 * ------------
 * Ban/mute user email across the platform.
 */
const moderateUser = async (clientId, { email, action, reason, operatorUserId }) => {
  const BannedEmail = require('../models/BannedEmail');
  const cleanEmail = email.toLowerCase().trim();

  if (action === 'unban' || action === 'unmute') {
    await BannedEmail.deleteOne({ clientId, email: cleanEmail });
    
    await ActivityLog.create({
      clientId,
      userId: operatorUserId,
      module: 'comments',
      action: `user_${action}`,
      details: { email: cleanEmail },
      ipAddress: 'system'
    }).catch((err) => {});
    
    return { success: true, action };
  }

  if (action === 'ban' || action === 'mute') {
    const status = action === 'ban' ? 'banned' : 'muted';
    const record = await BannedEmail.findOneAndUpdate(
      { clientId, email: cleanEmail },
      { status, reason: reason || '', bannedBy: operatorUserId },
      { new: true, upsert: true }
    );

    await ActivityLog.create({
      clientId,
      userId: operatorUserId,
      module: 'comments',
      action: `user_${action}`,
      details: { email: cleanEmail, reason },
      ipAddress: 'system'
    }).catch((err) => {});

    return record.toObject();
  }

  throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user moderation action.');
};

module.exports = {
  createComment,
  getCommentsForArticle,
  moderateComment,
  deleteComment,
  getPendingComments,
  getAdminComments,
  restoreComment,
  deleteCommentPermanently,
  reportComment,
  moderateUser
};
