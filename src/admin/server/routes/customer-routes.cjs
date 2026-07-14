'use strict';

const express = require('express');

function sendError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error: status >= 500 ? 'Unable to process the customer request.' : error.message,
  });
}

function createAdminCustomerRouter({
  authenticateAdmin,
  authorizeAdmin,
  adminCustomerService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(authenticateAdmin, authorizeAdmin);

  router.get('/', async (request, response) => {
    try {
      response.json({ customers: await adminCustomerService.list(request.query) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/', async (request, response) => {
    try {
      response.status(201).json({ customer: await adminCustomerService.create(request.body || {}) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/:customerId', async (request, response) => {
    try {
      response.json(await adminCustomerService.details(request.params.customerId));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch('/:customerId', async (request, response) => {
    try {
      response.json({ customer: await adminCustomerService.update(request.params.customerId, request.body || {}) });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete('/:customerId', async (request, response) => {
    try {
      response.json({ customer: await adminCustomerService.archive(request.params.customerId, request.body || {}) });
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

module.exports = {
  createAdminCustomerRouter,
};
