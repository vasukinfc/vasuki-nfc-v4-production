'use strict';

const express = require('express');
const path = require('path');
const { getAnalyticsConfig } = require('./config.cjs');
const {
  createAnalyticsRepository,
} = require('./repositories/analytics-repository.cjs');
const {
  createAnalyticsService,
} = require('./services/analytics-service.cjs');
const {
  createCustomerAnalyticsRouter,
} = require('./routes/customer-analytics-routes.cjs');
const {
  createSubscriptionRepository,
} = require('../../subscription/server/repositories/subscription-repository.cjs');

/**
 * Composes the shared Phase 7A analytics foundation without mounting routes.
 */
function createAnalyticsFoundation({
  environment = process.env,
  getDatabase = () => null,
  dataFile = path.resolve('data', 'analytics-events.json'),
  subscriptionDataFile = path.resolve('data', 'subscriptions.json'),
  listCustomers = async () => [],
  clock,
} = {}) {
  const config = getAnalyticsConfig(environment);
  const repository = createAnalyticsRepository({ getDatabase, dataFile });
  const subscriptionRepository = createSubscriptionRepository({
    getDatabase,
    dataFile: subscriptionDataFile,
  });
  const service = createAnalyticsService({
    repository,
    subscriptionRepository,
    listCustomers,
    config,
    ...(clock ? { clock } : {}),
  });
  return Object.freeze({
    config,
    repository,
    service,
    subscriptionRepository,
  });
}

/**
 * Mounts the protected customer analytics dashboard and API.
 */
function mountCustomerAnalyticsModule(app, {
  foundation,
  requireCustomerAuth,
}) {
  if (!foundation?.config?.enabled) return false;
  if (typeof requireCustomerAuth !== 'function') {
    throw new TypeError('Customer authentication middleware is required.');
  }
  const clientDirectory = path.resolve(__dirname, '..', 'client');
  app.use(
    '/analytics/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );
  app.get(['/analytics', '/analytics/'], (request, response) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.sendFile(path.join(clientDirectory, 'index.html'));
  });
  app.use(
    '/api/analytics',
    createCustomerAnalyticsRouter({
      requireCustomerAuth,
      analyticsService: foundation.service,
    }),
  );
  return true;
}

module.exports = {
  createAnalyticsFoundation,
  mountCustomerAnalyticsModule,
};
