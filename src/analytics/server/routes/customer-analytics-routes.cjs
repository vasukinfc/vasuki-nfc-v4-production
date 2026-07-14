'use strict';

const express = require('express');

function createCustomerAnalyticsRouter({
  requireCustomerAuth,
  analyticsService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(requireCustomerAuth);

  router.get('/me/dashboard', async (request, response) => {
    try {
      return response.json(
        await analyticsService.customerDashboard(request.user?.id),
      );
    } catch (error) {
      const status = Number(error.status) || 500;
      return response.status(status).json({
        error:
          status >= 500
            ? 'Unable to load customer analytics.'
            : error.message,
        code: error.code,
      });
    }
  });

  return router;
}

module.exports = {
  createCustomerAnalyticsRouter,
};
