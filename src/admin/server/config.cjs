'use strict';

const {
  explicitBoolean,
  positiveNumber,
} = require('../../platform/server/config-utils.cjs');

/**
 * Returns true only for an explicit ADMIN_CRM_ENABLED=true value.
 * Missing, empty, or any other value keeps the module disabled.
 *
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [environment]
 * @returns {boolean}
 */
function isAdminCrmEnabled(environment = process.env) {
  return explicitBoolean(environment.ADMIN_CRM_ENABLED);
}

/**
 * Reads the basic administrator session configuration.
 *
 * @param {NodeJS.ProcessEnv | Record<string, unknown>} [environment]
 */
function getAdminCrmConfig(environment = process.env) {
  const sessionSecret = String(
    environment.ADMIN_SESSION_SECRET || environment.AUTH_SECRET || '',
  );
  const sessionHours = positiveNumber(
    environment.ADMIN_SESSION_HOURS,
    8,
  );

  return Object.freeze({
    enabled: isAdminCrmEnabled(environment),
    cookieName: 'vasuki_admin_session',
    sessionSecret,
    sessionReady: sessionSecret.length >= 32,
    sessionDurationMs: sessionHours * 60 * 60 * 1000,
    secureCookies:
      String(environment.NODE_ENV || '').toLowerCase() === 'production',
  });
}

module.exports = {
  getAdminCrmConfig,
  isAdminCrmEnabled,
};
