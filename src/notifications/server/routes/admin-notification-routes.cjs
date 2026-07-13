'use strict';

const express = require('express');

function sendError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error:
      status >= 500
        ? 'Unable to process administrator notifications.'
        : error.message,
    code: error.code,
  });
}

function createAdminNotificationRouter({
  authenticateAdmin,
  authorizeAdmin,
  notificationService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(authenticateAdmin, authorizeAdmin);

  router.get('/', async (request, response) => {
    try {
      response.json(
        await notificationService.listAdmin(request.admin?.adminId, {
          unreadOnly: request.query.unread === 'true',
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/:notificationId/read', async (request, response) => {
    try {
      response.json(
        await notificationService.markRead({
          notificationId: request.params.notificationId,
          audience: 'admin',
          recipientId: 'admin',
          readerId: request.admin?.adminId,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/read-all', async (request, response) => {
    try {
      response.json(
        await notificationService.markAllRead({
          audience: 'admin',
          recipientId: 'admin',
          readerId: request.admin?.adminId,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

module.exports = {
  createAdminNotificationRouter,
};
