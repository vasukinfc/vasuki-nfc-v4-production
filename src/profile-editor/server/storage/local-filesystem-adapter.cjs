'use strict';

const fs = require('fs');
const fileSystem = fs.promises;
const path = require('path');

function storageError(message, code = 'MEDIA_STORAGE_KEY_INVALID') {
  const error = new Error(message);
  error.code = code;
  error.status = 500;
  return error;
}

function normalizeObjectKey(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || normalized.length > 1024 || normalized.startsWith('/')) {
    throw storageError('Media storage key is invalid.');
  }
  const segments = normalized.split('/');
  if (
    segments.some(
      (segment) =>
        !segment
        || segment === '.'
        || segment === '..'
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(segment),
    )
  ) {
    throw storageError('Media storage key is invalid.');
  }
  return segments.join('/');
}

function createLocalFilesystemAdapter({ rootDirectory }) {
  const root = path.resolve(rootDirectory);

  function localPath(key) {
    const normalized = normalizeObjectKey(key);
    const resolved = path.resolve(root, ...normalized.split('/'));
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw storageError('Media storage path is invalid.');
    }
    return resolved;
  }

  async function ensureParent(key) {
    await fileSystem.mkdir(path.dirname(localPath(key)), { recursive: true });
  }

  async function putObject({ key, body, immutable = true }) {
    if (!Buffer.isBuffer(body)) {
      throw storageError(
        'Media storage accepts Buffer content only.',
        'MEDIA_STORAGE_BODY_INVALID',
      );
    }
    await ensureParent(key);
    await fileSystem.writeFile(
      localPath(key),
      body,
      immutable ? { flag: 'wx' } : undefined,
    );
    return Object.freeze({ key: normalizeObjectKey(key) });
  }

  async function copyObject({ sourceKey, destinationKey, immutable = true }) {
    await ensureParent(destinationKey);
    await fileSystem.copyFile(
      localPath(sourceKey),
      localPath(destinationKey),
      immutable ? fs.constants.COPYFILE_EXCL : 0,
    );
    return Object.freeze({ key: normalizeObjectKey(destinationKey) });
  }

  async function deleteObject(key) {
    await fileSystem.rm(localPath(key), { force: true });
  }

  async function deletePrefix(prefix) {
    await fileSystem.rm(localPath(prefix), { recursive: true, force: true });
  }

  async function getObject(key) {
    return fileSystem.readFile(localPath(key));
  }

  async function resolveObject(key) {
    const filePath = localPath(key);
    await fileSystem.access(filePath, fs.constants.R_OK);
    return Object.freeze({ type: 'file', filePath });
  }

  return Object.freeze({
    provider: 'local',
    rootDirectory: root,
    copyObject,
    deleteObject,
    deletePrefix,
    getObject,
    localPath,
    putObject,
    resolveObject,
  });
}

module.exports = {
  createLocalFilesystemAdapter,
  normalizeObjectKey,
};
