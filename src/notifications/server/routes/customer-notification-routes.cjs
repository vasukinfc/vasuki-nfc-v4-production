'use strict';

const express = require('express');

function sendError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error:
      status >= 500
        ? 'Unable to process notifications.'
        : error.message,
    code: error.code,
  });
}

function createCustomerNotificationRouter({
  requireCustomerAuth,
  notificationService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(requireCustomerAuth);

  router.get('/me', async (request, response) => {
    try {
      response.json(
        await notificationService.listCustomer(request.user?.id, {
          unreadOnly: request.query.unread === 'true',
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/me/:notificationId/read', async (request, response) => {
    try {
      response.json(
        await notificationService.markRead({
          notificationId: request.params.notificationId,
          audience: 'customer',
          recipientId: request.user?.id,
          readerId: request.user?.id,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/me/read-all', async (request, response) => {
    try {
      response.json(
        await notificationService.markAllRead({
          audience: 'customer',
          recipientId: request.user?.id,
          readerId: request.user?.id,
        }),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

module.exports = {
  createCustomerNotificationRouter,
};
