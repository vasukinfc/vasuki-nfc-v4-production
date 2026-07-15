'use strict';

const {
  booleanWithDefault,
  boundedInteger,
  explicitBoolean,
} = require('./config-utils.cjs');

function trustProxy(value, production) {
  const source = String(value ?? '').trim();
  if (!source) return production ? 1 : false;
  if (/^\d+$/.test(source)) return Number(source);
  if (source.toLowerCase() === 'true') return true;
  if (source.toLowerCase() === 'false') return false;
  return source;
}

/**
 * Central application configuration for platform-wide behavior.
 *
 * Module-specific settings remain owned by their modules. This snapshot
 * centralizes startup, middleware, observability, limits, and feature status.
 */
function getApplicationConfig(environment = process.env) {
  const nodeEnvironment = String(environment.NODE_ENV || 'development')
    .trim()
    .toLowerCase();
  const production = nodeEnvironment === 'production';
  return Object.freeze({
    applicationName: 'Vasuki NFC',
    nodeEnvironment,
    production,
    port: boundedInteger(environment.PORT, 3000, 1, 65535),
    publicBaseUrl: String(environment.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    databaseConfigured: Boolean(environment.MONGODB_URI),
    trustProxy: trustProxy(environment.TRUST_PROXY, production),
    jsonBodyLimit: '15mb',
    staticAssetMaxAgeMs: boundedInteger(
      environment.STATIC_ASSET_MAX_AGE_SECONDS,
      86400,
      0,
      2592000,
    ) * 1000,
    failOnInvalidEnvironment: explicitBoolean(
      environment.FAIL_ON_INVALID_ENV,
    ),
    logging: Object.freeze({
      enabled: booleanWithDefault(
        environment.STRUCTURED_LOGGING_ENABLED,
        true,
      ),
      level: String(environment.LOG_LEVEL || 'info').trim().toLowerCase(),
    }),
    rateLimits: Object.freeze({
      customerAuth: Object.freeze({
        windowMs: 15 * 60 * 1000,
        maximum: boundedInteger(
          environment.CUSTOMER_AUTH_RATE_LIMIT,
          20,
          5,
          500,
        ),
      }),
      adminAuth: Object.freeze({
        windowMs: 15 * 60 * 1000,
        maximum: boundedInteger(
          environment.ADMIN_AUTH_RATE_LIMIT,
          10,
          3,
          200,
        ),
      }),
      publicAnalytics: Object.freeze({
        windowMs: 60 * 1000,
        maximum: boundedInteger(
          environment.PUBLIC_ANALYTICS_RATE_LIMIT,
          240,
          30,
          5000,
        ),
      }),
      orderLookup: Object.freeze({
        windowMs: 15 * 60 * 1000,
        maximum: boundedInteger(
          environment.ORDER_LOOKUP_RATE_LIMIT,
          20,
          5,
          200,
        ),
      }),
      reviewSubmission: Object.freeze({
        windowMs: 10 * 60 * 1000,
        maximum: boundedInteger(
          environment.REVIEW_SUBMISSION_RATE_LIMIT,
          5,
          1,
          100,
        ),
      }),
    }),
    featureFlags: Object.freeze({
      adminCrm: explicitBoolean(environment.ADMIN_CRM_ENABLED),
      profileEditor: explicitBoolean(environment.PROFILE_EDITOR_ENABLED),
      subscriptionEngine: explicitBoolean(
        environment.SUBSCRIPTION_ENGINE_ENABLED,
      ),
      notificationEngine: explicitBoolean(
        environment.NOTIFICATION_ENGINE_ENABLED,
      ),
      analyticsPlatform: explicitBoolean(
        environment.ANALYTICS_PLATFORM_ENABLED,
      ),
    }),
  });
}

module.exports = {
  getApplicationConfig,
};
