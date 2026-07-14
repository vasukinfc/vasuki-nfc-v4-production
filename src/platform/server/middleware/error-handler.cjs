'use strict';

function createApiNotFoundHandler() {
  return function apiNotFound(request, response, next) {
    if (!request.path.startsWith('/api/')) return next();
    return response.apiError('API endpoint not found.', {
      status: 404,
      code: 'API_NOT_FOUND',
    });
  };
}

function createErrorHandler({ logger }) {
  return function errorHandler(error, request, response, next) {
    if (response.headersSent) return next(error);
    const rawStatus = Number(error.status || error.statusCode);
    const status =
      Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
        ? rawStatus
        : 500;
    logger.error('unhandled_request_error', {
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      status,
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
      },
    });
    const message =
      status >= 500
        ? 'An unexpected server error occurred.'
        : error.message || 'The request could not be processed.';
    return response.apiError(message, {
      status,
      code:
        error.code ||
        (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'REQUEST_FAILED'),
    });
  };
}

module.exports = {
  createApiNotFoundHandler,
  createErrorHandler,
};
