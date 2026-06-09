/**
 * queueNames.js
 * -------------------------------------------
 * Centralized registry of BullMQ queue names.
 * Always use these constants instead of raw strings
 * to prevent typos and make future renames trivial.
 */

const QUEUES = {
  EMAIL:    'email-queue',
  ACTIVITY: 'activity-queue',
};

module.exports = { QUEUES };
