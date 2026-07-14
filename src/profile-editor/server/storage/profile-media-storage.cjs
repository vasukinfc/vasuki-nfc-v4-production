'use strict';

const crypto = require('crypto');
const {
  assertStorageAdapter,
} = require('./adapter-contract.cjs');
const {
  createLocalFilesystemAdapter,
} = require('./local-filesystem-adapter.cjs');

function createProfileMediaStorage({ adapter, rootDirectory }) {
  const namespace = adapter ? 'profiles/' : '';
  const storageAdapter = assertStorageAdapter(
    adapter || createLocalFilesystemAdapter({ rootDirectory }),
  );

  function ownerKey(ownerId) {
    return crypto
      .createHash('sha256')
      .update(String(ownerId))
      .digest('hex')
      .slice(0, 32);
  }

  function safeStorageName(storageName) {
    const value = String(storageName || '');
    if (!/^[a-f0-9-]{32,64}\.(png|jpg|webp|pdf)$/.test(value)) {
      const error = new Error('Stored media path is invalid.');
      error.status = 500;
      throw error;
    }
    return value;
  }

  function objectKey(ownerId, storageName) {
    return `${namespace}${ownerKey(ownerId)}/${safeStorageName(storageName)}`;
  }

  function filePath(ownerId, storageName) {
    if (typeof storageAdapter.localPath !== 'function') {
      const error = new Error('This storage provider does not expose file paths.');
      error.code = 'MEDIA_FILE_PATH_UNAVAILABLE';
      error.status = 500;
      throw error;
    }
    return storageAdapter.localPath(objectKey(ownerId, storageName));
  }

  async function write(ownerId, buffer, extension) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const storageName = `${crypto.randomUUID()}.${extension}`;
      try {
        await storageAdapter.putObject({
          key: objectKey(ownerId, storageName),
          body: buffer,
          immutable: true,
        });
        return Object.freeze({
          filePath:
            typeof storageAdapter.localPath === 'function'
              ? filePath(ownerId, storageName)
              : null,
          storageName,
        });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }

    const error = new Error('Unable to allocate media storage.');
    error.status = 500;
    throw error;
  }

  async function remove(ownerId, storageName) {
    await storageAdapter.deleteObject(objectKey(ownerId, storageName));
  }

  async function resolve(ownerId, storageName) {
    return storageAdapter.resolveObject(objectKey(ownerId, storageName));
  }

  async function read(ownerId, storageName) {
    return storageAdapter.getObject(objectKey(ownerId, storageName));
  }

  return Object.freeze({
    adapter: storageAdapter,
    filePath,
    objectKey,
    read,
    remove,
    resolve,
    write,
  });
}

module.exports = {
  createProfileMediaStorage,
};
