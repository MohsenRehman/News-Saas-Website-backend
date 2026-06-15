const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const commentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    newsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'News',
      required: true,
      index: true
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true
    },
    authorName: {
      type: String,
      required: true,
      trim: true
    },
    authorEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'spam', 'reported'],
      default: 'pending',
      index: true
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    reports: [
      {
        reason: { 
          type: String, 
          enum: ['spam', 'abuse', 'hate_speech', 'fake_information'], 
          required: true 
        },
        comment: { type: String, default: '' },
        ipAddress: { type: String, default: '' },
        reportedAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true
  }
);

commentSchema.plugin(softDeletePlugin);

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;
