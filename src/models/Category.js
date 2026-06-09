const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const categorySchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    name: {
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
    description: {
      type: String,
      default: ''
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index so categories are unique per tenant but can overlap across tenants
categorySchema.index({ clientId: 1, slug: 1 }, { unique: true });

categorySchema.plugin(softDeletePlugin);

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
