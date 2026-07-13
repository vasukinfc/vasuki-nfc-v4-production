'use strict';

const crypto = require('crypto');
const path = require('path');
const {
  assertStorageAdapter,
} = require('./adapter-contract.cjs');
const {
  createLocalFilesystemAdapter,
} = require('./local-filesystem-adapter.cjs');

function createPublishedProfileStorage({ adapter, rootDirectory }) {
  const namespace = adapter ? 'published/' : '';
  const storageAdapter = assertStorageAdapter(
    adapter || createLocalFilesystemAdapter({ rootDirectory }),
  );

  function safeStorageKey(storageKey) {
    const normalized = String(storageKey || '').replace(/\\/g, '/');
    if (!/^[a-f0-9]{32}\/[a-f0-9-]{36}$/.test(normalized)) {
      const error = new Error('Published media storage key is invalid.');
      error.status = 500;
      throw error;
    }
    return normalized;
  }

  function safeStorageName(storageName) {
    const value = String(storageName || '');
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(value)) {
      const error = new Error('Published media filename is invalid.');
      error.status = 500;
      throw error;
    }
    return value;
  }

  function objectKey(storageKey, storageName) {
    return `${namespace}${safeStorageKey(storageKey)}/${safeStorageName(storageName)}`;
  }

  function filePath(storageKey, storageName) {
    if (typeof storageAdapter.localPath !== 'function') {
      const error = new Error('This storage provider does not expose file paths.');
      error.code = 'MEDIA_FILE_PATH_UNAVAILABLE';
      error.status = 500;
      throw error;
    }
    return storageAdapter.localPath(objectKey(storageKey, storageName));
  }

  async function copySnapshot({
    profileId,
    ownerId,
    media,
    sourceStorage,
  }) {
    const profileKey = crypto
      .createHash('sha256')
      .update(String(profileId))
      .digest('hex')
      .slice(0, 32);
    const snapshotId = crypto.randomUUID();
    const storageKey = `${profileKey}/${snapshotId}`;
    const assets = [];

    try {
      for (const item of media) {
        const extension = path.extname(item.storageName).toLowerCase();
        if (!['.png', '.jpg', '.webp', '.pdf'].includes(extension)) continue;
        const storageName = `${crypto.randomUUID()}${extension}`;
        const destinationKey = objectKey(storageKey, storageName);
        if (sourceStorage.adapter === storageAdapter) {
          await storageAdapter.copyObject({
            sourceKey: sourceStorage.objectKey(ownerId, item.storageName),
            destinationKey,
            immutable: true,
          });
        } else {
          await storageAdapter.putObject({
            key: destinationKey,
            body: await sourceStorage.read(ownerId, item.storageName),
            immutable: true,
          });
        }
        assets.push({
          mediaId: item.mediaId,
          kind: item.kind,
          originalName: item.originalName,
          mime: item.mime,
          size: item.size,
          storageName,
        });
      }
      return Object.freeze({ assets, snapshotId, storageKey });
    } catch (error) {
      await removeSnapshot(storageKey).catch(() => {});
      throw error;
    }
  }

  async function removeSnapshot(storageKey) {
    await storageAdapter.deletePrefix(`${namespace}${safeStorageKey(storageKey)}`);
  }

  async function resolve(storageKey, storageName) {
    return storageAdapter.resolveObject(objectKey(storageKey, storageName));
  }

  return Object.freeze({
    adapter: storageAdapter,
    copySnapshot,
    filePath,
    objectKey,
    removeSnapshot,
    resolve,
  });
}

module.exports = {
  createPublishedProfileStorage,
};
