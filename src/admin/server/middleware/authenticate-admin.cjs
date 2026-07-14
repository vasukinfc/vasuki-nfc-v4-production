'use strict';

/**
 * Creates middleware that resolves the administrator from the session cookie.
 *
 * @param {{
 *   authService: object,
 *   sessionSecurity: object,
 *   config: object,
 *   redirectToLogin?: boolean
 * }} dependencies
 * @returns {import('express').RequestHandler}
 */
function createAuthenticateAdmin({
  authService,
  sessionSecurity,
  config,
  redirectToLogin = false,
}) {
  return async function authenticateAdmin(request, response, next) {
    try {
      const sessionToken = sessionSecurity.readSessionCookie(
        request,
        config.cookieName,
      );
      const identity = await authService.authenticate(sessionToken);

      if (!identity) {
        if (redirectToLogin) return response.redirect(302, '/admin/login');
        return response.status(401).json({ error: 'Admin login required.' });
      }

      request.admin = identity.admin;
      request.adminSession = identity.session;
      return next();
    } catch (error) {
      const status = Number(error.status) || 500;
      if (redirectToLogin && status === 401) {
        return response.redirect(302, '/admin/login');
      }
      return response.status(status).json({
        error:
          status >= 500
            ? 'Admin authentication is temporarily unavailable.'
            : error.message,
      });
    }
  };
}

module.exports = {
  createAuthenticateAdmin,
};
