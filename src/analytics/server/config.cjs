'use strict';

const {
  boundedInteger,
  explicitBoolean,
} = require('../../platform/server/config-utils.cjs');

/**
 * Central Phase 7A analytics configuration.
 *
 * Analytics is disabled unless explicitly enabled. Visitor identifiers are
 * always HMAC-hashed before persistence and the source identifier is never
 * stored.
 */
function getAnalyticsConfig(environment = process.env) {
  return Object.freeze({
    enabled: explicitBoolean(environment.ANALYTICS_PLATFORM_ENABLED),
    hashSecret: String(
      environment.ANALYTICS_HASH_SECRET ||
        environment.AUTH_SECRET ||
        'vasuki-analytics-development-secret',
    ),
    maximumReportEvents: boundedInteger(
      environment.ANALYTICS_MAX_REPORT_EVENTS,
      100000,
      1000,
      500000,
    ),
  });
}

module.exports = {
  getAnalyticsConfig,
};
