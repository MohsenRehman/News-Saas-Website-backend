const mongoose = require('mongoose');
const softDeletePlugin = require('../utils/softDelete');

const contactSchema = new mongoose.Schema(
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
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['unread', 'read'],
      default: 'unread',
      index: true
    }
  },
  {
    timestamps: true
  }
);

contactSchema.plugin(softDeletePlugin);

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
