'use strict';

function createSecurityHeaders({ production }) {
  return function securityHeaders(request, response, next) {
    response.set({
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), usb=()',
    });
    if (production && request.secure) {
      response.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  };
}

module.exports = {
  createSecurityHeaders,
};
