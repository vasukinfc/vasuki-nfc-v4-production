'use strict';

const {
  boundedInteger,
  explicitBoolean,
} = require('../../platform/server/config-utils.cjs');

function reminderDays(value) {
  const source = String(value || '7,3,1')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 90);
  return Object.freeze([...new Set(source)].sort((left, right) => right - left));
}

/**
 * Central configuration for the subscription foundation.
 *
 * The feature remains disabled unless explicitly enabled in a later phase.
 * No routes or UI read this configuration during Phase 5A.
 */
function getSubscriptionConfig(environment = process.env) {
  return Object.freeze({
    enabled: explicitBoolean(environment.SUBSCRIPTION_ENGINE_ENABLED),
    freeTrialDays: boundedInteger(
      environment.SUBSCRIPTION_FREE_TRIAL_DAYS,
      14,
      1,
      90,
    ),
    gracePeriodDays: boundedInteger(
      environment.SUBSCRIPTION_GRACE_PERIOD_DAYS,
      7,
      0,
      30,
    ),
    reminderDays: reminderDays(environment.SUBSCRIPTION_REMINDER_DAYS),
    currency: String(environment.SUBSCRIPTION_CURRENCY || 'INR')
      .trim()
      .toUpperCase()
      .slice(0, 3),
  });
}

module.exports = {
  getSubscriptionConfig,
};
