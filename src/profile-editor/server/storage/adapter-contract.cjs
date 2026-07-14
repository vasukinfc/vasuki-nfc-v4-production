'use strict';

const REQUIRED_OPERATIONS = Object.freeze([
  'copyObject',
  'deleteObject',
  'deletePrefix',
  'getObject',
  'putObject',
  'resolveObject',
]);

/**
 * Runtime guard for the provider-neutral media storage contract.
 *
 * An adapter stores opaque object keys and resolves them to a delivery
 * descriptor. Local storage returns a file descriptor; future cloud adapters
 * may return a signed redirect or readable stream without changing callers.
 */
function assertStorageAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('A media storage adapter is required.');
  }
  for (const operation of REQUIRED_OPERATIONS) {
    if (typeof adapter[operation] !== 'function') {
      throw new TypeError(
        `Media storage adapter is missing ${operation}().`,
      );
    }
  }
  if (!String(adapter.provider || '').trim()) {
    throw new TypeError('Media storage adapter must identify its provider.');
  }
  return adapter;
}

function sendStorageObject(response, descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new TypeError('Stored media delivery descriptor is invalid.');
  }
  if (descriptor.type === 'file' && descriptor.filePath) {
    return response.sendFile(descriptor.filePath);
  }
  if (descriptor.type === 'redirect' && descriptor.url) {
    return response.redirect(302, descriptor.url);
  }
  if (descriptor.type === 'buffer' && Buffer.isBuffer(descriptor.buffer)) {
    return response.send(descriptor.buffer);
  }
  if (
    descriptor.type === 'stream'
    && descriptor.stream
    && typeof descriptor.stream.pipe === 'function'
  ) {
    descriptor.stream.on('error', (error) => response.destroy(error));
    descriptor.stream.pipe(response);
    return response;
  }
  throw new TypeError('Stored media delivery type is unsupported.');
}

module.exports = {
  assertStorageAdapter,
  sendStorageObject,
};
