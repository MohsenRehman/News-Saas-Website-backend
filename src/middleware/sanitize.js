const xss = require('xss');

// Fields containing rich text that should not be blindly stripped of HTML
const EDITOR_FIELDS_WHITELIST = ['content'];

/**
 * Recursively traverses inputs to sanitize string values
 * @param {any} val - Value to sanitize
 * @param {String} [key] - Object property key
 * @returns {any} Sanitized value
 */
const sanitizeValue = (val, key) => {
  if (typeof val === 'string') {
    if (EDITOR_FIELDS_WHITELIST.includes(key)) {
      // Whitelisted editor field: skip raw sanitization to preserve React Quill output formatting
      return val;
    }
    // Globally sanitize all other string fields
    return xss(val);
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item, key));
  }

  if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
    const sanitizedObj = {};
    for (const k in val) {
      if (Object.prototype.hasOwnProperty.call(val, k)) {
        sanitizedObj[k] = sanitizeValue(val[k], k);
      }
    }
    return sanitizedObj;
  }

  return val;
};

/**
 * Express middleware to sanitize body, query, and params from XSS payloads
 */
const sanitizeInput = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

module.exports = sanitizeInput;
