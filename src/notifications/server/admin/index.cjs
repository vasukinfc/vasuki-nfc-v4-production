'use strict';

const express = require('express');
const path = require('path');
const {
  createAdminNotificationRouter,
} = require('../routes/admin-notification-routes.cjs');

/**
 * Mounts the Admin Notification Center with the existing Admin CRM middleware.
 */
function mountAdminNotificationModule(app, {
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
    '/admin/notifications/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );
  app.get(
    ['/admin/notifications', '/admin/notifications/'],
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
    '/api/admin/v1/notifications',
    createAdminNotificationRouter({
      authenticateAdmin,
      authorizeAdmin,
      notificationService: foundation.service,
    }),
  );
  return true;
}

module.exports = {
  mountAdminNotificationModule,
};
