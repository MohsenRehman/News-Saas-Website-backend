const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const mediaSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: false,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      required: true,
      index: true
    },
    format: {
      type: String,
      default: ''
    },
    size: {
      type: Number, // in bytes
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'video', 'document'],
      default: 'image',
      index: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    mimeType: {
      type: String,
      default: ''
    },
    resourceType: {
      type: String,
      default: 'image',
      index: true
    }
  },
  {
    timestamps: true
  }
);

mediaSchema.plugin(softDeletePlugin);

const Media = mongoose.model('Media', mediaSchema);

module.exports = Media;
