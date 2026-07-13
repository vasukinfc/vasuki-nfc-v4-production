'use strict';

const fs = require('fs').promises;
const {
  validateProfileDraft,
} = require('../schemas/profile-schema.cjs');

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

function publishError(message, status = 400, code = 'PUBLISH_FAILED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function ownerIdFor(user) {
  const ownerId = String(user?.id || '').trim();
  if (!ownerId) {
    throw publishError('Customer login required.', 401, 'CUSTOMER_LOGIN_REQUIRED');
  }
  return ownerId;
}

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function nameParts(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function socialType(platform) {
  return String(platform || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

function latestContentUpdate(records) {
  return [...records.media, ...records.videos].reduce((latest, item) => {
    const time = new Date(item.updatedAt || item.createdAt || 0).getTime();
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
}

function createProfilePublishService({
  profileRepository,
  mediaRepository,
  sourceMediaStorage,
  publishedStorage,
  publicCardsDataFile,
}) {
  let demoCache = { modifiedAt: -1, slugs: new Set() };

  async function demoSlugs() {
    const stats = await fs.stat(publicCardsDataFile);
    if (stats.mtimeMs === demoCache.modifiedAt) return demoCache.slugs;
    const document = JSON.parse(await fs.readFile(publicCardsDataFile, 'utf8'));
    const slugs = new Set(
      (Array.isArray(document.cards) ? document.cards : [])
        .filter((card) => card?.published === true)
        .map((card) => normalizeSlug(card.slug))
        .filter((slug) => SLUG_PATTERN.test(slug)),
    );
    demoCache = { modifiedAt: stats.mtimeMs, slugs };
    return slugs;
  }

  function publicStatus(record, mediaRecords) {
    const published = Boolean(record?.published && record?.slug);
    const publishedAt = record?.publishedAt || null;
    const mediaChangedAt = latestContentUpdate(mediaRecords);
    const hasUnpublishedChanges =
      published &&
      (Number(record.version) !== Number(record.publishedVersion) ||
        (publishedAt &&
          mediaChangedAt > new Date(publishedAt).getTime()));
    return Object.freeze({
      status: published ? 'published' : 'unpublished',
      slug: published ? record.slug : null,
      publicUrl: published ? `/card/${encodeURIComponent(record.slug)}` : null,
      publishedAt,
      draftVersion: Number(record?.version) || 0,
      publishedVersion:
        record?.publishedVersion === null ||
        record?.publishedVersion === undefined
          ? null
          : Number(record.publishedVersion),
      hasUnpublishedChanges,
    });
  }

  function buildSnapshot({
    record,
    draft,
    slug,
    mediaRecords,
    copied,
    publishedAt,
  }) {
    const displayName = draft.name || draft.businessName;
    const names = nameParts(displayName);
    const assetIds = new Set(copied.assets.map((asset) => asset.mediaId));
    const mediaByKind = (kind) =>
      copied.assets.filter((asset) => asset.kind === kind);
    const firstMediaId = (kind) => mediaByKind(kind)[0]?.mediaId || null;
    const validMediaId = (value) => (assetIds.has(value) ? value : null);
    const seoImageMediaId =
      firstMediaId('coverImage') || firstMediaId('logo') || null;

    return Object.freeze({
      snapshotId: copied.snapshotId,
      profileId: record.profileId,
      slug,
      published: true,
      publishedAt,
      updatedAt: publishedAt,
      name: displayName,
      firstName: names.firstName,
      lastName: names.lastName,
      title: draft.designation,
      company: draft.businessName,
      tagline: draft.designation,
      bio: '',
      phone: draft.phone,
      phoneValue: String(draft.phone || '').replace(/[^\d+]/g, ''),
      whatsapp: String(draft.whatsapp || '').replace(/\D/g, ''),
      email: draft.email,
      website: draft.website,
      address: draft.address,
      locationUrl: draft.googleMaps,
      template: 'obsidian-gold',
      theme: 'luxury',
      logoMediaId: firstMediaId('logo'),
      coverMediaId: firstMediaId('coverImage'),
      galleryMediaIds: mediaByKind('gallery').map((asset) => asset.mediaId),
      paymentQrMediaId: firstMediaId('paymentQr'),
      pdfCatalogMediaId: firstMediaId('pdfCatalog'),
      products: draft.products.map((item) => ({
        ...item,
        imageMediaId: validMediaId(item.imageMediaId),
      })),
      services: draft.services.map((item) => ({ ...item })),
      businessHours: draft.businessHours.map((item) => ({ ...item })),
      socialLinks: draft.socialLinks.map((item) => ({
        type: socialType(item.platform),
        label: item.platform,
        url: item.url,
      })),
      teamMembers: draft.teamMembers.map((item) => ({
        ...item,
        imageMediaId: validMediaId(item.imageMediaId),
      })),
      customButtons: draft.customButtons.map((item) => ({ ...item })),
      videos: mediaRecords.videos.map((video) => ({
        videoId: video.videoId,
        title: video.title,
        url: video.url,
      })),
      mediaStorageKey: copied.storageKey,
      mediaAssets: copied.assets,
      seo: {
        title: `${draft.businessName || displayName} | Digital Business Card`,
        description:
          draft.designation ||
          `Connect with ${draft.businessName || displayName}.`,
        imageMediaId: seoImageMediaId,
      },
    });
  }

  async function status(user) {
    const ownerId = ownerIdFor(user);
    const record = await profileRepository.findByOwnerId(ownerId);
    const mediaRecords = await mediaRepository.list(ownerId);
    return publicStatus(record, mediaRecords);
  }

  async function publish(user, payload) {
    const ownerId = ownerIdFor(user);
    const record = await profileRepository.findByOwnerId(ownerId);
    if (!record) {
      throw publishError('Profile draft not found.', 404, 'PROFILE_NOT_FOUND');
    }

    const expectedVersion = Number(payload?.version);
    if (
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 0 ||
      expectedVersion !== Number(record.version)
    ) {
      throw publishError(
        'The draft changed before publishing. Reload and try again.',
        409,
        'PUBLISH_VERSION_CONFLICT',
      );
    }

    const requestedSlug = normalizeSlug(payload?.slug);
    if (!SLUG_PATTERN.test(requestedSlug)) {
      throw publishError(
        'Slug must use 2–64 lowercase letters, numbers or hyphens.',
        400,
        'SLUG_INVALID',
      );
    }
    if (record.slug && record.slug !== requestedSlug) {
      throw publishError(
        'A published slug is locked to preserve the existing card URL.',
        409,
        'SLUG_LOCKED',
      );
    }
    if ((await demoSlugs()).has(requestedSlug)) {
      throw publishError(
        'This slug is reserved. Choose another.',
        409,
        'SLUG_RESERVED',
      );
    }

    const ownedSlug = await profileRepository.findBySlug(requestedSlug);
    if (ownedSlug && ownedSlug.ownerId !== ownerId) {
      throw publishError(
        'This slug is already owned by another profile.',
        409,
        'SLUG_TAKEN',
      );
    }

    const draft = validateProfileDraft(record.draft);
    if (!draft.name && !draft.businessName) {
      throw publishError(
        'Add a name or business name before publishing.',
        400,
        'PUBLISH_IDENTITY_REQUIRED',
      );
    }

    const mediaRecords = await mediaRepository.list(ownerId);
    const copied = await publishedStorage.copySnapshot({
      profileId: record.profileId,
      ownerId,
      media: mediaRecords.media,
      sourceStorage: sourceMediaStorage,
    });
    const publishedAt = new Date().toISOString();
    const snapshot = buildSnapshot({
      record,
      draft,
      slug: requestedSlug,
      mediaRecords,
      copied,
      publishedAt,
    });

    try {
      const updated = await profileRepository.publishSnapshot(
        ownerId,
        expectedVersion,
        requestedSlug,
        snapshot,
        publishedAt,
      );
      // A committed snapshot is immutable. Republishing writes a new snapshot
      // key and leaves the previous committed object set untouched.
      return publicStatus(updated, mediaRecords);
    } catch (error) {
      await publishedStorage.removeSnapshot(copied.storageKey).catch(() => {});
      throw error;
    }
  }

  return Object.freeze({
    publish,
    status,
  });
}

module.exports = {
  createProfilePublishService,
};
