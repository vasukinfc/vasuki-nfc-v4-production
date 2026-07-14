'use strict';

const { getApplicationConfig } = require('./config.cjs');
const {
  enforceEnvironment,
  validateEnvironment,
} = require('./environment-validator.cjs');
const { createLogger } = require('./logger.cjs');
const {
  attachApiResponseHelpers,
} = require('./middleware/api-response.cjs');
const {
  createApiNotFoundHandler,
  createErrorHandler,
} = require('./middleware/error-handler.cjs');
const {
  createRateLimiter,
} = require('./middleware/rate-limit.cjs');
const {
  createRequestContext,
} = require('./middleware/request-context.cjs');
const {
  createSecurityHeaders,
} = require('./middleware/security-headers.cjs');

function createPlatformFoundation(environment = process.env) {
  const config = getApplicationConfig(environment);
  const environmentReport = validateEnvironment(environment, config);
  enforceEnvironment(environmentReport, config);
  const logger = createLogger(config.logging);
  return Object.freeze({
    config,
    environmentReport,
    logger,
    rateLimiters: Object.freeze({
      customerAuth: createRateLimiter({
        ...config.rateLimits.customerAuth,
        scope: 'customer-auth',
      }),
      adminAuth: createRateLimiter({
        ...config.rateLimits.adminAuth,
        scope: 'admin-auth',
      }),
      publicAnalytics: createRateLimiter({
        ...config.rateLimits.publicAnalytics,
        scope: 'public-analytics',
      }),
      orderLookup: createRateLimiter({
        ...config.rateLimits.orderLookup,
        scope: 'order-lookup',
      }),
      reviewSubmission: createRateLimiter({
        ...config.rateLimits.reviewSubmission,
        scope: 'review-submission',
      }),
    }),
  });
}

function installPlatformMiddleware(app, foundation) {
  app.disable('x-powered-by');
  app.set('trust proxy', foundation.config.trustProxy);
  app.use(createRequestContext({ logger: foundation.logger }));
  app.use(
    createSecurityHeaders({ production: foundation.config.production }),
  );
  app.use(attachApiResponseHelpers);
}

function installFinalErrorHandling(app, foundation) {
  app.use(createApiNotFoundHandler());
  app.use(createErrorHandler({ logger: foundation.logger }));
}

module.exports = {
  createPlatformFoundation,
  installFinalErrorHandling,
  installPlatformMiddleware,
};
