'use strict';

const express = require('express');

function sendProfileError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error:
      status >= 500
        ? 'Unable to process the profile request.'
        : error.message,
    code: error.code,
    fields: error.errors,
  });
}

/**
 * Creates the Phase 4A protected draft API.
 *
 * @param {{
 *   requireCustomerAuth: import('express').RequestHandler,
 *   profileService: object,
 *   profilePublishService: object
 * }} dependencies
 */
function createProfileRouter({
  requireCustomerAuth,
  profileService,
  profilePublishService,
}) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireCustomerAuth);

  router.get('/profile', async (request, response) => {
    try {
      response.json(await profileService.loadDraft(request.user));
    } catch (error) {
      sendProfileError(response, error);
    }
  });

  router.put('/profile', async (request, response) => {
    try {
      response.json(
        await profileService.saveDraft(request.user, request.body || {}),
      );
    } catch (error) {
      sendProfileError(response, error);
    }
  });

  router.get('/publication', async (request, response) => {
    try {
      response.json(await profilePublishService.status(request.user));
    } catch (error) {
      sendProfileError(response, error);
    }
  });

  router.post('/publish', async (request, response) => {
    try {
      response.json(
        await profilePublishService.publish(
          request.user,
          request.body || {},
        ),
      );
    } catch (error) {
      sendProfileError(response, error);
    }
  });

  return router;
}

module.exports = {
  createProfileRouter,
};
