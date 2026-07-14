'use strict';

const express = require('express');
const {
  sendStorageObject,
} = require('../storage/adapter-contract.cjs');

const uploadBody = express.raw({
  limit: '13mb',
  type: () => true,
});

function parseUploadBody(request, response, next) {
  uploadBody(request, response, (error) => {
    if (!error) return next();
    const status = error.type === 'entity.too.large' ? 413 : 400;
    return response.status(status).json({
      error:
        status === 413
          ? 'Upload exceeds the maximum supported file size.'
          : 'Unable to read the uploaded file.',
      code: status === 413 ? 'MEDIA_TOO_LARGE' : 'MEDIA_BODY_INVALID',
    });
  });
}

function decodedHeader(request, name) {
  const value = String(request.get(name) || '');
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sendMediaError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error:
      status >= 500 ? 'Unable to process profile media.' : error.message,
    code: error.code,
  });
}

function uploadInput(request, replaceMediaId = null) {
  return {
    kind: decodedHeader(request, 'X-Media-Kind'),
    originalName: decodedHeader(request, 'X-File-Name'),
    declaredMime: request.get('Content-Type'),
    buffer: request.body,
    replaceMediaId,
  };
}

function createProfileMediaRouter({
  requireCustomerAuth,
  profileMediaService,
}) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  router.use(requireCustomerAuth);

  router.get('/media', async (request, response) => {
    try {
      response.json(await profileMediaService.list(request.user));
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  router.post('/media', parseUploadBody, async (request, response) => {
    try {
      response
        .status(201)
        .json(
          await profileMediaService.upload(
            request.user,
            uploadInput(request),
          ),
        );
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  router.put(
    '/media/:mediaId',
    parseUploadBody,
    async (request, response) => {
      try {
        response.json(
          await profileMediaService.upload(
            request.user,
            uploadInput(request, request.params.mediaId),
          ),
        );
      } catch (error) {
        sendMediaError(response, error);
      }
    },
  );

  router.delete('/media/:mediaId', async (request, response) => {
    try {
      response.json(
        await profileMediaService.remove(
          request.user,
          request.params.mediaId,
        ),
      );
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  router.get('/media/:mediaId/content', async (request, response) => {
    try {
      const result = await profileMediaService.content(
        request.user,
        request.params.mediaId,
      );
      response.type(result.media.mime);
      response.set(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(result.media.originalName)}`,
      );
      return sendStorageObject(response, result.delivery);
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  router.post('/videos', async (request, response) => {
    try {
      response
        .status(201)
        .json(
          await profileMediaService.addVideo(
            request.user,
            request.body || {},
          ),
        );
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  router.put('/videos/:videoId', async (request, response) => {
    try {
      response.json(
        await profileMediaService.updateVideo(
          request.user,
          request.params.videoId,
          request.body || {},
        ),
      );
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  router.delete('/videos/:videoId', async (request, response) => {
    try {
      response.json(
        await profileMediaService.removeVideo(
          request.user,
          request.params.videoId,
        ),
      );
    } catch (error) {
      sendMediaError(response, error);
    }
  });

  return router;
}

module.exports = {
  createProfileMediaRouter,
};
