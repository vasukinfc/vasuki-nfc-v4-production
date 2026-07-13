'use strict';

const express = require('express');
const path = require('path');
const { getNotificationConfig } = require('./config.cjs');
const {
  createNotificationRepository,
} = require('./repositories/notification-repository.cjs');
const {
  createNotificationService,
} = require('./services/notification-service.cjs');
const {
  createCustomerNotificationRouter,
} = require('./routes/customer-notification-routes.cjs');
const {
  createSubscriptionRepository,
} = require('../../subscription/server/repositories/subscription-repository.cjs');
const {
  getSubscriptionConfig,
} = require('../../subscription/server/config.cjs');

function createNotificationFoundation({
  environment = process.env,
  getDatabase = () => null,
  dataFile = path.resolve('data', 'notifications.json'),
  subscriptionDataFile = path.resolve('data', 'subscriptions.json'),
  clock,
} = {}) {
  const config = getNotificationConfig(environment);
  const subscriptionConfig = getSubscriptionConfig(environment);
  const repository = createNotificationRepository({
    getDatabase,
    dataFile,
  });
  const subscriptionRepository = createSubscriptionRepository({
    getDatabase,
    dataFile: subscriptionDataFile,
  });
  const service = createNotificationService({
    repository,
    subscriptionRepository,
    notificationConfig: config,
    subscriptionConfig,
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
 * Mounts the protected customer Notification Center.
 */
function mountCustomerNotificationModule(app, {
  foundation,
  requireCustomerAuth,
}) {
  if (!foundation?.config?.enabled) return false;
  if (typeof requireCustomerAuth !== 'function') {
    throw new TypeError('Customer authentication middleware is required.');
  }
  const clientDirectory = path.resolve(__dirname, '..', 'client');
  app.use(
    '/notifications/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );
  app.get(['/notifications', '/notifications/'], (request, response) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.sendFile(path.join(clientDirectory, 'index.html'));
  });
  app.use(
    '/api/notifications',
    createCustomerNotificationRouter({
      requireCustomerAuth,
      notificationService: foundation.service,
    }),
  );
  return true;
}

module.exports = {
  createNotificationFoundation,
  mountCustomerNotificationModule,
};
