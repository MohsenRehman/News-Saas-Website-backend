const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    customDomain: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'deleted'],
      default: 'active',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Apply custom soft delete plugin
clientSchema.plugin(softDeletePlugin);

const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
