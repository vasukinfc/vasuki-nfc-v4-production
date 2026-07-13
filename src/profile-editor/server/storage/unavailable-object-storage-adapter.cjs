'use strict';

const OBJECT_STORAGE_PROVIDERS = Object.freeze([
  's3',
  'r2',
  'firebase',
]);

class ObjectStorageNotEnabledError extends Error {
  constructor(provider) {
    super(
      `${provider.toUpperCase()} media storage is prepared but not enabled. `
      + 'Use MEDIA_STORAGE_PROVIDER=local until its cloud adapter is activated.',
    );
    this.name = 'ObjectStorageNotEnabledError';
    this.code = 'OBJECT_STORAGE_NOT_ENABLED';
  }
}

function assertObjectStorageEnabled(provider) {
  throw new ObjectStorageNotEnabledError(provider);
}

/**
 * Contract-complete placeholders for the next integration phase. They make
 * provider boundaries testable now without accepting or losing real media.
 */
function createUnavailableObjectStorageAdapter(provider) {
  if (!OBJECT_STORAGE_PROVIDERS.includes(provider)) {
    throw new TypeError(`Unknown object storage provider: ${provider}`);
  }
  const unavailable = async () => assertObjectStorageEnabled(provider);
  return Object.freeze({
    provider,
    copyObject: unavailable,
    deleteObject: unavailable,
    deletePrefix: unavailable,
    getObject: unavailable,
    putObject: unavailable,
    resolveObject: unavailable,
  });
}

module.exports = {
  OBJECT_STORAGE_PROVIDERS,
  ObjectStorageNotEnabledError,
  assertObjectStorageEnabled,
  createUnavailableObjectStorageAdapter,
};
