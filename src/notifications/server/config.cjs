'use strict';

const {
  explicitBoolean,
} = require('../../platform/server/config-utils.cjs');

function warningDays(value) {
  const parsed = String(value || '30,15,7,3,1')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0 && item <= 365);
  return Object.freeze([...new Set(parsed)].sort((left, right) => right - left));
}

/**
 * Reads the Phase 6A in-app notification configuration.
 */
function getNotificationConfig(environment = process.env) {
  return Object.freeze({
    enabled:
      explicitBoolean(environment.NOTIFICATION_ENGINE_ENABLED),
    expiryWarningDays: warningDays(
      environment.NOTIFICATION_EXPIRY_WARNING_DAYS,
    ),
    historyLimit: 200,
  });
}

module.exports = {
  getNotificationConfig,
};
