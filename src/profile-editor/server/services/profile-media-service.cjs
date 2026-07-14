'use strict';

const crypto = require('crypto');
const { MEDIA_POLICIES, validateMediaFile } = require('../media/media-policy.cjs');

function serviceError(message, status = 400, code = 'MEDIA_REQUEST_FAILED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function ownerIdFor(user) {
  const ownerId = String(user?.id || '').trim();
  if (!ownerId) {
    throw serviceError('Customer login required.', 401, 'CUSTOMER_LOGIN_REQUIRED');
  }
  return ownerId;
}

function publicMedia(record) {
  return Object.freeze({
    mediaId: record.mediaId,
    kind: record.kind,
    originalName: record.originalName,
    mime: record.mime,
    size: record.size,
    contentUrl: `/api/profile-editor/media/${encodeURIComponent(record.mediaId)}/content`,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function publicVideo(record) {
  return Object.freeze({
    videoId: record.videoId,
    title: record.title,
    url: record.url,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function cleanVideo(payload) {
  const title = String(payload?.title || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100);
  const value = String(payload?.url || '').trim().slice(0, 500);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw serviceError('Enter a valid video URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw serviceError('Video URL must begin with http:// or https://.');
  }

  return Object.freeze({ title, url: url.href });
}

function createProfileMediaService({ repository, storage }) {
  async function list(user) {
    const ownerId = ownerIdFor(user);
    const records = await repository.list(ownerId);
    return Object.freeze({
      media: records.media.map(publicMedia),
      videos: records.videos.map(publicVideo),
      policies: Object.fromEntries(
        Object.entries(MEDIA_POLICIES).map(([kind, policy]) => [
          kind,
          {
            allowedMimes: policy.allowedMimes,
            maxBytes: policy.maxBytes,
            maxItems: policy.maxItems,
          },
        ]),
      ),
    });
  }

  async function upload(user, input) {
    const ownerId = ownerIdFor(user);
    const validation = validateMediaFile(input);
    const current = await repository.list(ownerId);
    const policy = validation.policy;
    let replacing = null;

    if (input.replaceMediaId) {
      replacing = current.media.find(
        (item) => item.mediaId === input.replaceMediaId,
      );
      if (!replacing) {
        throw serviceError('Media item not found.', 404, 'MEDIA_NOT_FOUND');
      }
      if (replacing.kind !== input.kind) {
        throw serviceError(
          'Replacement must use the same media category.',
          400,
          'MEDIA_KIND_MISMATCH',
        );
      }
    } else if (policy.maxItems === 1) {
      replacing =
        current.media.find((item) => item.kind === input.kind) || null;
    }

    const kindCount = current.media.filter(
      (item) => item.kind === input.kind,
    ).length;
    if (!replacing && kindCount >= policy.maxItems) {
      throw serviceError(
        `${policy.label} limit reached. Delete an existing item first.`,
        409,
        'MEDIA_LIMIT_REACHED',
      );
    }

    const stored = await storage.write(
      ownerId,
      input.buffer,
      validation.extension,
    );
    const now = new Date().toISOString();
    const record = {
      mediaId: replacing?.mediaId || `MED-${crypto.randomUUID()}`,
      ownerId,
      kind: input.kind,
      originalName: validation.originalName,
      mime: validation.mime,
      size: validation.size,
      storageName: stored.storageName,
      createdAt: replacing?.createdAt || now,
      updatedAt: now,
    };

    try {
      if (replacing) {
        const replaced = await repository.replaceMedia(
          ownerId,
          replacing.mediaId,
          record,
        );
        if (!replaced) {
          throw serviceError('Media item not found.', 404, 'MEDIA_NOT_FOUND');
        }
        await storage.remove(ownerId, replacing.storageName).catch(() => {});
        return publicMedia(replaced);
      }

      return publicMedia(await repository.insertMedia(record));
    } catch (error) {
      await storage.remove(ownerId, stored.storageName).catch(() => {});
      throw error;
    }
  }

  async function remove(user, mediaId) {
    const ownerId = ownerIdFor(user);
    const removed = await repository.deleteMedia(ownerId, String(mediaId));
    if (!removed) {
      throw serviceError('Media item not found.', 404, 'MEDIA_NOT_FOUND');
    }
    await storage.remove(ownerId, removed.storageName).catch(() => {});
    return Object.freeze({ deleted: true, mediaId: removed.mediaId });
  }

  async function content(user, mediaId) {
    const ownerId = ownerIdFor(user);
    const record = await repository.findMedia(ownerId, String(mediaId));
    if (!record) {
      throw serviceError('Media item not found.', 404, 'MEDIA_NOT_FOUND');
    }
    return Object.freeze({
      delivery: await storage.resolve(ownerId, record.storageName),
      media: publicMedia(record),
    });
  }

  async function addVideo(user, payload) {
    const ownerId = ownerIdFor(user);
    const current = await repository.list(ownerId);
    if (current.videos.length >= 10) {
      throw serviceError(
        'Video URL limit reached. Delete an existing URL first.',
        409,
        'VIDEO_LIMIT_REACHED',
      );
    }
    const video = cleanVideo(payload);
    const now = new Date().toISOString();
    return publicVideo(
      await repository.insertVideo({
        videoId: `VID-${crypto.randomUUID()}`,
        ownerId,
        title: video.title,
        url: video.url,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async function updateVideo(user, videoId, payload) {
    const ownerId = ownerIdFor(user);
    const current = await repository.list(ownerId);
    const existing = current.videos.find(
      (item) => item.videoId === String(videoId),
    );
    if (!existing) {
      throw serviceError('Video URL not found.', 404, 'VIDEO_NOT_FOUND');
    }
    const video = cleanVideo(payload);
    const updated = await repository.updateVideo(ownerId, existing.videoId, {
      ...existing,
      title: video.title,
      url: video.url,
      updatedAt: new Date().toISOString(),
    });
    return publicVideo(updated);
  }

  async function removeVideo(user, videoId) {
    const ownerId = ownerIdFor(user);
    const removed = await repository.deleteVideo(ownerId, String(videoId));
    if (!removed) {
      throw serviceError('Video URL not found.', 404, 'VIDEO_NOT_FOUND');
    }
    return Object.freeze({ deleted: true, videoId: removed.videoId });
  }

  return Object.freeze({
    addVideo,
    content,
    list,
    remove,
    removeVideo,
    updateVideo,
    upload,
  });
}

module.exports = {
  createProfileMediaService,
};
