const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const newsSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    shortDescription: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    featuredImage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media',
      default: null
    },
    galleryImages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Media'
      }
    ],
    videoUrl: {
      type: String,
      default: ''
    },
    tags: [
      {
        type: String,
        trim: true
      }
    ],
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'scheduled', 'archived'],
      default: 'draft',
      index: true
    },
    labels: [
      {
        type: String,
        enum: ['breaking', 'featured', 'trending', 'top_story']
      }
    ],
    publishDate: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index per tenant so slugs don't collide across clients
newsSchema.index({ clientId: 1, slug: 1 }, { unique: true });

// Index for query sorting by status and publishDate (critical for public news lists)
newsSchema.index({ clientId: 1, status: 1, publishDate: -1 });

// Compound text index for full-text search capability scoped by client ID (Phase 24)
newsSchema.index(
  { clientId: 1, title: 'text', content: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, content: 1 }, name: 'NewsCompoundTextIndex' }
);

newsSchema.plugin(softDeletePlugin);

const News = mongoose.model('News', newsSchema);

module.exports = News;
