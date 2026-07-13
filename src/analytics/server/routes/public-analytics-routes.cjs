'use strict';

const express = require('express');

function createPublicAnalyticsRouter({
  analyticsService,
  resolveCardOwnerId,
}) {
  const router = express.Router();

  router.post('/:slug/events', async (request, response) => {
    try {
      const ownerId = await resolveCardOwnerId(request.params.slug);
      if (!ownerId) {
        return response.status(404).json({ error: 'Digital card not found.' });
      }
      const result = await analyticsService.recordPublicEvent({
        ownerId,
        cardSlug: request.params.slug,
        input: request.body,
      });
      response.set('Cache-Control', 'no-store');
      return response.status(202).json(result);
    } catch (error) {
      const status = Number(error.status) || 500;
      return response.status(status).json({
        error:
          status >= 500
            ? 'Unable to record analytics event.'
            : error.message,
        code: error.code,
      });
    }
  });

  return router;
}

module.exports = {
  createPublicAnalyticsRouter,
};
