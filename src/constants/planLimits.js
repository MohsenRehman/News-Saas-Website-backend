/**
 * Plan resource limit definitions per subscription tier.
 *
 * Fields:
 *   adminCount    - maximum number of sub-admin / editor accounts
 *   newsCount     - maximum published news articles at any time
 *   storageBytes  - maximum total media storage in bytes  (0 = unlimited)
 *   aiRequests    - maximum AI-generation calls per billing period (0 = unlimited)
 *   apiRequests   - maximum API calls per billing period           (0 = unlimited)
 *
 * A value of 0 means "unlimited" for that resource.
 */
const PLAN_LIMITS = {
  basic: {
    adminCount:   2,
    newsCount:    100,
    storageUsed:  1 * 1024 * 1024 * 1024,   // 1 GB
    aiRequests:   50,
    apiRequests:  5000,
    emailSent:    5000,
  },
  professional: {
    adminCount:   10,
    newsCount:    1000,
    storageUsed:  10 * 1024 * 1024 * 1024,  // 10 GB
    aiRequests:   500,
    apiRequests:  50_000,
    emailSent:    50_000,
  },
  enterprise: {
    adminCount:   0,     // unlimited
    newsCount:    0,     // unlimited
    storageUsed:  0,     // unlimited
    aiRequests:   0,     // unlimited
    apiRequests:  0,     // unlimited
    emailSent:    0,     // unlimited
  },
};

/**
 * Mapping: Express middleware limitKey → UsageStats field name
 * Used by checkPlanLimit() to read usage and compare to the cap.
 */
const LIMIT_KEY_MAP = {
  maxUsers:       'adminCount',
  maxNews:        'newsCount',
  maxStorage:     'storageUsed',
  maxAiRequests:  'aiRequests',
  maxApiRequests: 'apiRequests',
  maxEmails:      'emailSent',
};

module.exports = { PLAN_LIMITS, LIMIT_KEY_MAP };

