'use strict';

const crypto = require('crypto');
const {
  defaultDraft,
  normalizeProfileDraft,
  validateProfileDraft,
} = require('../schemas/profile-schema.cjs');

function ownerIdFor(user) {
  return String(user?.id || '').trim();
}

function clientProfile(record) {
  return Object.freeze({
    profileId: record.profileId,
    slug: record.slug || null,
    status: record.status || 'draft',
    version: Number(record.version) || 0,
    profile: normalizeProfileDraft(record.draft),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function createProfileService({ repository }) {
  async function loadDraft(user) {
    const ownerId = ownerIdFor(user);
    if (!ownerId) {
      const error = new Error('Customer login required.');
      error.status = 401;
      throw error;
    }

    const existing = await repository.findByOwnerId(ownerId);
    if (existing) return clientProfile(existing);

    const now = new Date().toISOString();
    const created = await repository.createIfMissing({
      profileId: `PRF-${crypto.randomUUID()}`,
      ownerId,
      slug: null,
      status: 'draft',
      version: 0,
      draft: defaultDraft(user),
      createdAt: now,
      updatedAt: now,
    });
    return clientProfile(created);
  }

  async function saveDraft(user, payload) {
    const ownerId = ownerIdFor(user);
    if (!ownerId) {
      const error = new Error('Customer login required.');
      error.status = 401;
      throw error;
    }

    const version = Number(payload?.version);
    if (!Number.isInteger(version) || version < 0) {
      const error = new Error('A valid draft version is required.');
      error.status = 400;
      throw error;
    }

    await loadDraft(user);
    const draft = validateProfileDraft(payload?.profile);
    const saved = await repository.saveDraft(
      ownerId,
      version,
      draft,
      new Date().toISOString(),
    );
    return clientProfile(saved);
  }

  return Object.freeze({
    loadDraft,
    saveDraft,
  });
}

module.exports = {
  createProfileService,
};
