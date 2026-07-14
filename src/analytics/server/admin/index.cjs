'use strict';

const express = require('express');
const path = require('path');
const {
  createAdminAnalyticsRouter,
} = require('../routes/admin-analytics-routes.cjs');

/**
 * Mounts the analytics dashboard with the existing Admin CRM protection.
 */
function mountAdminAnalyticsModule(app, {
  foundation,
  authenticateAdmin,
  authenticateAdminPage,
  authorizeAdmin,
}) {
  if (!foundation?.config?.enabled) return false;
  const clientDirectory = path.resolve(
    __dirname,
    '..',
    '..',
    'admin',
    'client',
  );
  app.use(
    '/admin/analytics/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );
  app.get(
    ['/admin/analytics', '/admin/analytics/'],
    authenticateAdminPage,
    authorizeAdmin,
    (request, response) => {
      response.set({
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      response.sendFile(path.join(clientDirectory, 'index.html'));
    },
  );
  app.use(
    '/api/admin/v1/analytics',
    createAdminAnalyticsRouter({
      authenticateAdmin,
      authorizeAdmin,
      analyticsService: foundation.service,
    }),
  );
  return true;
}

module.exports = {
  mountAdminAnalyticsModule,
};
