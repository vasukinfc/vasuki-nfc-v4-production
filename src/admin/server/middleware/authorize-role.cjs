'use strict';

/**
 * Restricts a route to the supplied administrator roles.
 *
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function authorizeRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return function authorizeRole(request, response, next) {
    if (!request.admin) {
      return response.status(401).json({ error: 'Admin login required.' });
    }
    if (!allowed.has(request.admin.role)) {
      return response.status(403).json({ error: 'Admin access denied.' });
    }
    return next();
  };
}

module.exports = {
  authorizeRoles,
};
