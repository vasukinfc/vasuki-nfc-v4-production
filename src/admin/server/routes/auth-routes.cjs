'use strict';

const express = require('express');

/**
 * Creates the basic Admin CRM authentication router.
 *
 * @param {{
 *   authService: object,
 *   authenticateAdmin: import('express').RequestHandler,
 *   authorizeAdmin: import('express').RequestHandler,
 *   sessionSecurity: object,
 *   config: object
 * }} dependencies
 * @returns {import('express').Router}
 */
function createAuthRouter({
  authService,
  authenticateAdmin,
  authorizeAdmin,
  sessionSecurity,
  config,
}) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/login', async (request, response) => {
    try {
      const result = await authService.login(request.body || {});
      sessionSecurity.setSessionCookie(
        response,
        result.sessionToken,
        config,
      );
      response.json({ admin: result.admin });
    } catch (error) {
      const status = Number(error.status) || 500;
      response.status(status).json({
        error:
          status >= 500
            ? 'Admin authentication is temporarily unavailable.'
            : error.message,
      });
    }
  });

  router.get(
    '/me',
    authenticateAdmin,
    authorizeAdmin,
    (request, response) => {
      response.json({ admin: request.admin });
    },
  );

  router.post(
    '/logout',
    authenticateAdmin,
    authorizeAdmin,
    async (request, response) => {
      try {
        await authService.logout(request.adminSession.tokenHash);
        sessionSecurity.clearSessionCookie(response, config);
        response.json({ success: true });
      } catch (error) {
        sessionSecurity.clearSessionCookie(response, config);
        response.status(Number(error.status) || 500).json({
          error: 'Unable to complete admin logout.',
        });
      }
    },
  );

  return router;
}

module.exports = {
  createAuthRouter,
};
