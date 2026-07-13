'use strict';

const crypto = require('crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

function createRequestContext({ logger }) {
  return function requestContext(request, response, next) {
    const supplied = String(request.get('x-request-id') || '').trim();
    const requestId = REQUEST_ID_PATTERN.test(supplied)
      ? supplied
      : crypto.randomUUID();
    const startedAt = process.hrtime.bigint();
    request.requestId = requestId;
    response.locals.requestId = requestId;
    response.set('X-Request-ID', requestId);
    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info('http_request_completed', {
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });
    next();
  };
}

module.exports = {
  createRequestContext,
};
