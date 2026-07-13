'use strict';

const express = require('express');
const path = require('path');
const {
  createAdminSubscriptionService,
} = require('../services/admin-subscription-service.cjs');
const {
  createAdminSubscriptionRouter,
} = require('../routes/admin-subscription-routes.cjs');

/**
 * Mounts the subscription manager with middleware supplied by the existing
 * Admin CRM. This module does not create or alter administrator sessions.
 */
function mountAdminSubscriptionManager(app, {
  foundation,
  authenticateAdmin,
  authenticateAdminPage,
  authorizeAdmin,
  listCustomers,
}) {
  if (!foundation?.config?.enabled) return false;
  const clientDirectory = path.resolve(__dirname, '..', '..', 'admin', 'client');
  const shellFile = path.join(clientDirectory, 'index.html');
  const adminSubscriptionService = createAdminSubscriptionService({
    repository: foundation.repository,
    subscriptionService: foundation.service,
    config: foundation.config,
    listCustomers,
  });

  app.use(
    '/admin/subscriptions/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );
  app.get(
    ['/admin/subscriptions', '/admin/subscriptions/'],
    authenticateAdminPage,
    authorizeAdmin,
    (request, response) => {
      response.set({
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      response.sendFile(shellFile);
    },
  );
  app.use(
    '/api/admin/v1/subscriptions',
    createAdminSubscriptionRouter({
      authenticateAdmin,
      authorizeAdmin,
      adminSubscriptionService,
    }),
  );
  return true;
}

module.exports = {
  mountAdminSubscriptionManager,
};
