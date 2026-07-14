'use strict';

const express = require('express');

function createAdminAnalyticsRouter({
  authenticateAdmin,
  authorizeAdmin,
  analyticsService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(authenticateAdmin, authorizeAdmin);

  router.get('/dashboard', async (request, response) => {
    try {
      return response.json(
        await analyticsService.adminDashboard({
          from: request.query.from,
          to: request.query.to,
        }),
      );
    } catch (error) {
      const status = Number(error.status) || 500;
      console.error('Admin analytics dashboard error:', error);
      return response.status(status).json({
        error:
          status >= 500
            ? 'Unable to load admin analytics.'
            : error.message,
        code: error.code,
      });
    }
  });

  return router;
}

module.exports = {
  createAdminAnalyticsRouter,
};
