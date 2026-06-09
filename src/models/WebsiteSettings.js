const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const socialLinksSchema = new mongoose.Schema({
  facebook: { type: String, default: '' },
  twitter: { type: String, default: '' },
  instagram: { type: String, default: '' },
  youtube: { type: String, default: '' }
}, { _id: false });

const websiteSettingsSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      unique: true, // One setting configuration document per tenant
      index: true
    },
    siteName: {
      type: String,
      required: true,
      default: 'My News Portal'
    },
    logo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media',
      default: null
    },
    favicon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media',
      default: null
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: ''
    },
    contactPhone: {
      type: String,
      default: ''
    },
    tagline: {
      type: String,
      default: ''
    },
    primaryColor: {
      type: String,
      default: '#6366f1'
    },
    socialLinks: {
      type: socialLinksSchema,
      default: () => ({})
    },
    features: {
      aiStudioEnabled: {
        type: Boolean,
        default: true
      },
      commentsApprovalRequired: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true
  }
);

// Mongoose schema transforms to automatically map structures for the frontend
const transformFn = function (doc, ret) {
  if (ret.logo && typeof ret.logo === 'object' && ret.logo.url) {
    ret.logo = ret.logo.url;
  }
  if (ret.favicon && typeof ret.favicon === 'object' && ret.favicon.url) {
    ret.favicon = ret.favicon.url;
  }
  ret.name = ret.siteName; // Map siteName to name for frontend compatibility
  
  // Set social URLs for frontend compatibility
  ret.facebookUrl = ret.socialLinks?.facebook || '';
  ret.twitterUrl = ret.socialLinks?.twitter || '';
  
  return ret;
};

websiteSettingsSchema.set('toJSON', { transform: transformFn });
websiteSettingsSchema.set('toObject', { transform: transformFn });

websiteSettingsSchema.plugin(softDeletePlugin);

const WebsiteSettings = mongoose.model('WebsiteSettings', websiteSettingsSchema);

module.exports = WebsiteSettings;
