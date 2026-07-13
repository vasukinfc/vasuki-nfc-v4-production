'use strict';

const FEATURE_FLAG_NAMES = Object.freeze([
  'ADMIN_CRM_ENABLED',
  'PROFILE_EDITOR_ENABLED',
  'SUBSCRIPTION_ENGINE_ENABLED',
  'NOTIFICATION_ENGINE_ENABLED',
  'ANALYTICS_PLATFORM_ENABLED',
]);

function issue(severity, code, message) {
  return Object.freeze({ severity, code, message });
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Audits environment coherence without exposing secret values.
 */
function validateEnvironment(environment, config) {
  const issues = [];
  const authSecret = String(
    environment.AUTH_SECRET || environment.RAZORPAY_KEY_SECRET || '',
  );
  const adminSecret = String(
    environment.ADMIN_SESSION_SECRET || authSecret,
  );
  const analyticsSecret = String(
    environment.ANALYTICS_HASH_SECRET || authSecret,
  );

  if (environment.PORT && !/^\d+$/.test(String(environment.PORT))) {
    issues.push(issue('error', 'PORT_INVALID', 'PORT must be an integer.'));
  }
  if (config.publicBaseUrl) {
    const publicUrl = validUrl(config.publicBaseUrl);
    if (!publicUrl) {
      issues.push(
        issue(
          'error',
          'PUBLIC_BASE_URL_INVALID',
          'PUBLIC_BASE_URL must be an HTTP or HTTPS URL.',
        ),
      );
    } else if (config.production && publicUrl.protocol !== 'https:') {
      issues.push(
        issue(
          'warning',
          'PUBLIC_BASE_URL_INSECURE',
          'PUBLIC_BASE_URL should use HTTPS in production.',
        ),
      );
    }
  } else if (config.production) {
    issues.push(
      issue(
        'warning',
        'PUBLIC_BASE_URL_MISSING',
        'PUBLIC_BASE_URL is recommended in production.',
      ),
    );
  }
  if (config.production && authSecret.length < 32) {
    issues.push(
      issue(
        'error',
        'AUTH_SECRET_WEAK',
        'AUTH_SECRET must contain at least 32 characters in production.',
      ),
    );
  }
  if (config.featureFlags.adminCrm && adminSecret.length < 32) {
    issues.push(
      issue(
        'error',
        'ADMIN_SESSION_SECRET_WEAK',
        'Admin CRM requires a session secret of at least 32 characters.',
      ),
    );
  }
  if (config.featureFlags.analyticsPlatform && analyticsSecret.length < 32) {
    issues.push(
      issue(
        'error',
        'ANALYTICS_HASH_SECRET_WEAK',
        'Analytics requires a hashing secret of at least 32 characters.',
      ),
    );
  }
  if (!environment.MONGODB_URI) {
    issues.push(
      issue(
        'warning',
        'MONGODB_URI_MISSING',
        'MongoDB is not configured; JSON fallback storage will be used.',
      ),
    );
  }
  const hasRazorpayKey = Boolean(environment.RAZORPAY_KEY_ID);
  const hasRazorpaySecret = Boolean(environment.RAZORPAY_KEY_SECRET);
  if (hasRazorpayKey !== hasRazorpaySecret) {
    issues.push(
      issue(
        'error',
        'RAZORPAY_KEYS_INCOMPLETE',
        'Razorpay key ID and secret must be configured together.',
      ),
    );
  }
  FEATURE_FLAG_NAMES.forEach((name) => {
    const value = String(environment[name] || '').trim().toLowerCase();
    if (value && !['true', 'false'].includes(value)) {
      issues.push(
        issue(
          'warning',
          'FEATURE_FLAG_INVALID',
          `${name} must be true or false; it currently resolves to disabled.`,
        ),
      );
    }
  });

  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  return Object.freeze({
    ready: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
    issues: Object.freeze(issues),
  });
}

function enforceEnvironment(report, config) {
  if (config.failOnInvalidEnvironment && !report.ready) {
    const error = new Error(
      `Environment validation failed: ${report.errors
        .map((item) => item.code)
        .join(', ')}`,
    );
    error.code = 'ENVIRONMENT_INVALID';
    throw error;
  }
}

module.exports = {
  enforceEnvironment,
  validateEnvironment,
};
