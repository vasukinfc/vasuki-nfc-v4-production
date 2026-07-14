'use strict';

const express = require('express');
const path = require('path');
const { getProfileEditorConfig } = require('./config.cjs');
const {
  createProfileRepository,
} = require('./repositories/profile-repository.cjs');
const {
  createProfileService,
} = require('./services/profile-service.cjs');
const {
  createProfileMediaRepository,
} = require('./repositories/profile-media-repository.cjs');
const {
  createProfileMediaStorage,
} = require('./storage/profile-media-storage.cjs');
const {
  createPublishedProfileStorage,
} = require('./storage/published-profile-storage.cjs');
const {
  createProfileMediaService,
} = require('./services/profile-media-service.cjs');
const {
  createProfilePublishService,
} = require('./services/profile-publish-service.cjs');
const { createProfileRouter } = require('./routes/profile-routes.cjs');
const {
  createProfileMediaRouter,
} = require('./routes/profile-media-routes.cjs');

/**
 * Mounts the feature-gated Customer Profile Editor foundation.
 *
 * @param {import('express').Express} app
 * @param {{
 *   environment?: NodeJS.ProcessEnv | Record<string, unknown>,
 *   requireCustomerAuth: import('express').RequestHandler,
 *   getDatabase?: () => unknown | Promise<unknown>,
 *   dataFile: string,
 *   mediaDataFile: string,
 *   storageAdapter?: object,
 *   mediaStorageDirectory: string,
 *   publishedStorageDirectory: string,
 *   publicCardsDataFile: string
 * }} options
 */
function mountProfileEditorModule(app, options) {
  const config = getProfileEditorConfig(options.environment || process.env);
  if (!config.enabled) return false;

  if (typeof options.requireCustomerAuth !== 'function') {
    throw new TypeError('Customer authentication middleware is required.');
  }

  const clientDirectory = path.resolve(__dirname, '..', 'client');
  const repository = createProfileRepository({
    getDatabase:
      typeof options.getDatabase === 'function'
        ? options.getDatabase
        : () => null,
    dataFile: options.dataFile,
  });
  const profileService = createProfileService({ repository });
  const profileMediaRepository = createProfileMediaRepository({
    dataFile: options.mediaDataFile,
    getDatabase:
      typeof options.getDatabase === 'function'
        ? options.getDatabase
        : () => null,
  });
  const profileMediaStorage = createProfileMediaStorage({
    adapter: options.storageAdapter,
    rootDirectory: options.mediaStorageDirectory,
  });
  const profileMediaService = createProfileMediaService({
    repository: profileMediaRepository,
    storage: profileMediaStorage,
  });
  const publishedProfileStorage = createPublishedProfileStorage({
    adapter: options.storageAdapter,
    rootDirectory: options.publishedStorageDirectory,
  });
  const profilePublishService = createProfilePublishService({
    profileRepository: repository,
    mediaRepository: profileMediaRepository,
    sourceMediaStorage: profileMediaStorage,
    publishedStorage: publishedProfileStorage,
    publicCardsDataFile: options.publicCardsDataFile,
  });

  app.use(
    '/profile-editor/assets',
    express.static(clientDirectory, {
      dotfiles: 'deny',
      index: false,
      fallthrough: true,
    }),
  );

  app.get(['/profile-editor', '/profile-editor/'], (request, response) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    response.sendFile(path.join(clientDirectory, 'index.html'));
  });

  app.use(
    '/api/profile-editor',
    createProfileRouter({
      requireCustomerAuth: options.requireCustomerAuth,
      profilePublishService,
      profileService,
    }),
  );
  app.use(
    '/api/profile-editor',
    createProfileMediaRouter({
      requireCustomerAuth: options.requireCustomerAuth,
      profileMediaService,
    }),
  );

  return true;
}

module.exports = {
  mountProfileEditorModule,
};
