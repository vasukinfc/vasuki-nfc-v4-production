'use strict';

const express = require('express');
const path = require('path');
const { getSubscriptionConfig } = require('./config.cjs');
const {
  createSubscriptionRepository,
} = require('./repositories/subscription-repository.cjs');
const {
  createSubscriptionService,
} = require('./services/subscription-service.cjs');
const {
  createCustomerSubscriptionRouter,
} = require('./routes/customer-subscription-routes.cjs');

/**
 * Composes the non-mounted Phase 5A subscription foundation.
 *
 * This function creates no routes and changes no existing application
 * behavior. A later approved phase can mount APIs behind the feature flag.
 */
function createSubscriptionFoundation({
  environment = process.env,
  getDatabase = () => null,
  dataFile = path.resolve('data', 'subscriptions.json'),
  clock,
} = {}) {
  const config = getSubscriptionConfig(environment);
  const repository = createSubscriptionRepository({
    getDatabase,
    dataFile,
  });
  const service = createSubscriptionService({
    repository,
    config,
    ...(clock ? { clock } : {}),
  });
  return Object.freeze({ config, repository, service });
}

/**
 * Mounts the Phase 5B customer subscription dashboard behind its feature flag.
 *
 * Only read-only customer APIs are exposed in this phase.
 */
function mountSubscriptionModule(app, options = {}) {
  const foundation = createSubscriptionFoundation({
    environment: options.environment || process.env,
    getDatabase:
      typeof options.getDatabase === 'function'
        ? options.getDatabase
        : () => null,
    dataFile: options.dataFile,
  });
  if (!foundation.config.enabled) return false;
  if (typeof options.requireCustomerAuth !== 'function') {
    throw new TypeError('Customer authentication middleware is required.');
  }

  const clientDirectory = path.resolve(__dirname, '..', 'client');
  app.use(
    '/subscription/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );
  app.get(['/subscription', '/subscription/'], (request, response) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.sendFile(path.join(clientDirectory, 'index.html'));
  });
  app.use(
    '/api/subscriptions',
    createCustomerSubscriptionRouter({
      requireCustomerAuth: options.requireCustomerAuth,
      subscriptionService: foundation.service,
      config: foundation.config,
    }),
  );
  return true;
}

module.exports = {
  createSubscriptionFoundation,
  mountSubscriptionModule,
};
