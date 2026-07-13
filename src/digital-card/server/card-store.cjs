'use strict';

const fs = require('fs').promises;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Composite public-card reader.
 *
 * Existing demo cards remain file-backed. Customer cards are read from the
 * immutable published snapshot stored on their profile record.
 */
function createPublicCardStore({
  dataFile,
  profileDataFile,
  getDatabase = () => null,
  publishedStorage,
}) {
  let demoCache = {
    modifiedAt: -1,
    cardsBySlug: new Map(),
  };
  let profileCache = {
    modifiedAt: -1,
    cardsBySlug: new Map(),
  };

  async function loadDemoCards() {
    const stats = await fs.stat(dataFile);
    if (demoCache.modifiedAt === stats.mtimeMs) return demoCache.cardsBySlug;
    const document = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    const cardsBySlug = new Map();
    for (const card of Array.isArray(document.cards) ? document.cards : []) {
      const slug = String(card?.slug || '').trim().toLowerCase();
      if (!SLUG_PATTERN.test(slug) || card?.published !== true) continue;
      cardsBySlug.set(
        slug,
        Object.freeze({
          ...card,
          slug,
          analyticsOwnerId: `demo:${slug}`,
        }),
      );
    }
    demoCache = { modifiedAt: stats.mtimeMs, cardsBySlug };
    return cardsBySlug;
  }

  async function loadLocalProfileCards() {
    if (!profileDataFile) return new Map();
    let stats;
    try {
      stats = await fs.stat(profileDataFile);
    } catch (error) {
      if (error.code === 'ENOENT') return new Map();
      throw error;
    }
    if (profileCache.modifiedAt === stats.mtimeMs) {
      return profileCache.cardsBySlug;
    }
    const document = JSON.parse(await fs.readFile(profileDataFile, 'utf8'));
    const cardsBySlug = new Map();
    for (const profile of Array.isArray(document.profiles)
      ? document.profiles
      : []) {
      const slug = String(profile?.slug || '').trim().toLowerCase();
      if (
        !SLUG_PATTERN.test(slug) ||
        profile?.status !== 'published' ||
        !profile?.published
      ) {
        continue;
      }
      cardsBySlug.set(
        slug,
        Object.freeze({
          ...clone(profile.published),
          analyticsOwnerId: profile.ownerId,
        }),
      );
    }
    profileCache = { modifiedAt: stats.mtimeMs, cardsBySlug };
    return cardsBySlug;
  }

  async function findProfileSnapshot(slug) {
    const database = await getDatabase();
    if (database) {
      const record = await database.collection('digital_profiles').findOne({
        slug,
        status: 'published',
        published: { $ne: null },
      });
      return record?.published
        ? {
            ...clone(record.published),
            analyticsOwnerId: record.ownerId,
          }
        : null;
    }
    return (await loadLocalProfileCards()).get(slug) || null;
  }

  async function findPublishedCard(slug) {
    const normalizedSlug = String(slug || '').trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalizedSlug)) return null;
    const demo = (await loadDemoCards()).get(normalizedSlug);
    if (demo) return demo;
    return findProfileSnapshot(normalizedSlug);
  }

  function publicMediaUrl(card, mediaId) {
    const version = encodeURIComponent(card.snapshotId || card.updatedAt || '');
    return `/api/public-cards/${encodeURIComponent(card.slug)}/media/${encodeURIComponent(mediaId)}?v=${version}`;
  }

  function toPublicCard(card) {
    const result = clone(card);
    const assets = Array.isArray(card.mediaAssets) ? card.mediaAssets : [];
    const publicAssets = assets.map((asset) => ({
      mediaId: asset.mediaId,
      kind: asset.kind,
      originalName: asset.originalName,
      mime: asset.mime,
      size: asset.size,
      url: publicMediaUrl(card, asset.mediaId),
    }));
    const assetUrl = (mediaId) =>
      publicAssets.find((asset) => asset.mediaId === mediaId)?.url || '';

    result.mediaAssets = publicAssets;
    delete result.mediaStorageKey;
    delete result.analyticsOwnerId;
    if (result.logoMediaId) result.logo = assetUrl(result.logoMediaId);
    if (result.coverMediaId) result.coverImage = assetUrl(result.coverMediaId);
    if (result.seo?.imageMediaId) {
      result.seo.image = assetUrl(result.seo.imageMediaId);
    }
    return Object.freeze(result);
  }

  async function findMediaFile(card, mediaId) {
    if (!card?.mediaStorageKey || !publishedStorage) return null;
    const asset = (Array.isArray(card.mediaAssets) ? card.mediaAssets : []).find(
      (candidate) => candidate.mediaId === String(mediaId),
    );
    if (!asset) return null;
    return Object.freeze({
      asset,
      delivery: await publishedStorage.resolve(
        card.mediaStorageKey,
        asset.storageName,
      ),
    });
  }

  return Object.freeze({
    findMediaFile,
    findPublishedCard,
    toPublicCard,
  });
}

module.exports = {
  createPublicCardStore,
};
