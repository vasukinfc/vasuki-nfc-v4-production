'use strict';

function attachApiResponseHelpers(request, response, next) {
  response.apiSuccess = function apiSuccess(data, {
    status = 200,
    meta,
  } = {}) {
    return response.status(status).json({
      success: true,
      data,
      ...(meta ? { meta } : {}),
      requestId: response.locals.requestId,
    });
  };
  response.apiError = function apiError(message, {
    status = 500,
    code = 'INTERNAL_ERROR',
    details,
  } = {}) {
    return response.status(status).json({
      error: message,
      code,
      ...(details ? { details } : {}),
      requestId: response.locals.requestId,
    });
  };
  next();
}

module.exports = {
  attachApiResponseHelpers,
};
