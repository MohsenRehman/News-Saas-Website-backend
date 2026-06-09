/**
 * Enum of all platform events that can trigger outbound webhook notifications.
 * Use these constants everywhere — in emitEvent() calls, registration validation,
 * and the frontend event-picker dropdown.
 */
const WEBHOOK_EVENTS = {
  // ── Content ────────────────────────────────────────────────────────────────
  NEWS_PUBLISHED:         'news.published',
  NEWS_UPDATED:           'news.updated',
  NEWS_DELETED:           'news.deleted',
  NEWS_SCHEDULED:         'news.scheduled',

  // ── Users / Admins ─────────────────────────────────────────────────────────
  USER_CREATED:           'user.created',
  USER_STATUS_CHANGED:    'user.status_changed',
  USER_DELETED:           'user.deleted',

  // ── Subscription ───────────────────────────────────────────────────────────
  SUBSCRIPTION_UPGRADED:  'subscription.upgraded',
  SUBSCRIPTION_EXPIRED:   'subscription.expired',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',

  // ── Media ──────────────────────────────────────────────────────────────────
  MEDIA_UPLOADED:         'media.uploaded',
  MEDIA_DELETED:          'media.deleted',

  // ── Inbound (received from external systems) ───────────────────────────────
  PAYMENT_RECEIVED:       'payment.received',
  PAYMENT_FAILED:         'payment.failed',
};

/** Set version for fast O(1) event-name validation */
const WEBHOOK_EVENT_SET = new Set(Object.values(WEBHOOK_EVENTS));

module.exports = { WEBHOOK_EVENTS, WEBHOOK_EVENT_SET };
