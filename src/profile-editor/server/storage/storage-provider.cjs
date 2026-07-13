'use strict';

const path = require('path');
const {
  explicitBoolean,
} = require('../../../platform/server/config-utils.cjs');
const {
  assertStorageAdapter,
} = require('./adapter-contract.cjs');
const {
  createLocalFilesystemAdapter,
} = require('./local-filesystem-adapter.cjs');
const {
  OBJECT_STORAGE_PROVIDERS,
  assertObjectStorageEnabled,
  createUnavailableObjectStorageAdapter,
} = require('./unavailable-object-storage-adapter.cjs');

function normalizedProvider(value) {
  const provider = String(value || 'local').trim().toLowerCase();
  if (provider === 'firebase-storage') return 'firebase';
  return provider;
}

function createMediaStorageProvider({
  environment = process.env,
  defaultRootDirectory,
}) {
  const provider = normalizedProvider(environment.MEDIA_STORAGE_PROVIDER);
  if (OBJECT_STORAGE_PROVIDERS.includes(provider)) {
    assertStorageAdapter(createUnavailableObjectStorageAdapter(provider));
    assertObjectStorageEnabled(provider);
  }
  if (provider !== 'local') {
    const error = new Error(`Unsupported media storage provider: ${provider}`);
    error.code = 'MEDIA_STORAGE_PROVIDER_INVALID';
    throw error;
  }

  const configuredRoot = String(
    environment.MEDIA_STORAGE_LOCAL_ROOT || '',
  ).trim();
  const rootDirectory = path.resolve(
    configuredRoot || defaultRootDirectory,
  );
  const persistent =
    Boolean(configuredRoot)
    && explicitBoolean(environment.MEDIA_STORAGE_LOCAL_PERSISTENT);
  const production =
    String(environment.NODE_ENV || '').trim().toLowerCase() === 'production';
  const editorEnabled = explicitBoolean(environment.PROFILE_EDITOR_ENABLED);

  if (production && editorEnabled && !persistent) {
    const error = new Error(
      'Profile Editor requires durable media storage in production. '
      + 'Set MEDIA_STORAGE_LOCAL_ROOT to a mounted persistent directory and '
      + 'MEDIA_STORAGE_LOCAL_PERSISTENT=true, or keep PROFILE_EDITOR_ENABLED=false.',
    );
    error.code = 'MEDIA_STORAGE_NOT_DURABLE';
    throw error;
  }
  if (production && !persistent) {
    console.warn(
      'Media storage is using a non-persistent local development path. '
      + 'Customer media features must remain disabled until durable storage is configured.',
    );
  }

  const adapter = assertStorageAdapter(
    createLocalFilesystemAdapter({ rootDirectory }),
  );
  return Object.freeze({
    adapter,
    config: Object.freeze({
      provider,
      rootDirectory,
      persistent,
      productionReady: !production || persistent,
    }),
  });
}

module.exports = {
  createMediaStorageProvider,
};
