'use strict';

const express = require('express');
const { ORDER_STATUSES } = require('../services/admin-order-service.cjs');

function sendError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error: status >= 500 ? 'Unable to process the order request.' : error.message,
  });
}

function createAdminOrderRouter({
  authenticateAdmin,
  authorizeAdmin,
  adminOrderService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(authenticateAdmin, authorizeAdmin);

  router.get('/', async (request, response) => {
    try {
      response.json({
        statuses: [...ORDER_STATUSES],
        orders: await adminOrderService.list(request.query),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/:orderId', async (request, response) => {
    try {
      response.json({ order: await adminOrderService.details(request.params.orderId) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch('/:orderId/status', async (request, response) => {
    try {
      response.json({
        order: await adminOrderService.updateStatus(request.params.orderId, request.body || {}),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

module.exports = {
  createAdminOrderRouter,
};
