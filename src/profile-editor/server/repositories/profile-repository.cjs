'use strict';

const fs = require('fs').promises;
const path = require('path');

class ProfileVersionConflictError extends Error {
  constructor() {
    super('This draft was updated elsewhere. Reload before saving again.');
    this.name = 'ProfileVersionConflictError';
    this.code = 'PROFILE_VERSION_CONFLICT';
    this.status = 409;
  }
}

class ProfileSlugConflictError extends Error {
  constructor() {
    super('This slug is already owned by another profile.');
    this.name = 'ProfileSlugConflictError';
    this.code = 'SLUG_TAKEN';
    this.status = 409;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * MongoDB-first profile repository with an atomic JSON development fallback.
 *
 * @param {{
 *   getDatabase: () => unknown | Promise<unknown>,
 *   dataFile: string
 * }} options
 */
function createProfileRepository({ getDatabase, dataFile }) {
  let indexInitialization;
  let writeQueue = Promise.resolve();

  async function databaseCollection() {
    const database = await getDatabase();
    if (!database) return null;

    const collection = database.collection('digital_profiles');
    if (!indexInitialization) {
      indexInitialization = Promise.all([
        collection.createIndex({ ownerId: 1 }, { unique: true }),
        collection.createIndex(
          { slug: 1 },
          {
            unique: true,
            partialFilterExpression: { slug: { $type: 'string' } },
          },
        ),
      ])
        .catch((error) => {
          indexInitialization = undefined;
          throw error;
        });
    }
    await indexInitialization;
    return collection;
  }

  async function readJsonStore() {
    try {
      const document = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      return {
        version: 1,
        profiles: Array.isArray(document.profiles) ? document.profiles : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, profiles: [] };
    }
  }

  async function writeJsonStore(document) {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.${process.pid}.tmp`;
    await fs.writeFile(
      temporaryFile,
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8',
    );
    await fs.rename(temporaryFile, dataFile);
  }

  function queueJsonWrite(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function findByOwnerId(ownerId) {
    const collection = await databaseCollection();
    if (collection) {
      const profile = await collection.findOne({ ownerId });
      return profile ? clone(profile) : null;
    }

    await writeQueue;
    const document = await readJsonStore();
    const profile = document.profiles.find(
      (candidate) => candidate.ownerId === ownerId,
    );
    return profile ? clone(profile) : null;
  }

  async function findBySlug(slug) {
    const collection = await databaseCollection();
    if (collection) {
      const profile = await collection.findOne({ slug });
      return profile ? clone(profile) : null;
    }

    await writeQueue;
    const document = await readJsonStore();
    const profile = document.profiles.find(
      (candidate) => candidate.slug === slug,
    );
    return profile ? clone(profile) : null;
  }

  async function createIfMissing(profile) {
    const collection = await databaseCollection();
    if (collection) {
      await collection.updateOne(
        { ownerId: profile.ownerId },
        { $setOnInsert: profile },
        { upsert: true },
      );
      return clone(await collection.findOne({ ownerId: profile.ownerId }));
    }

    return queueJsonWrite(async () => {
      const document = await readJsonStore();
      const existing = document.profiles.find(
        (candidate) => candidate.ownerId === profile.ownerId,
      );
      if (existing) return clone(existing);

      document.profiles.push(profile);
      await writeJsonStore(document);
      return clone(profile);
    });
  }

  async function saveDraft(ownerId, expectedVersion, draft, savedAt) {
    const collection = await databaseCollection();
    const nextVersion = expectedVersion + 1;

    if (collection) {
      const result = await collection.updateOne(
        { ownerId, version: expectedVersion },
        {
          $set: {
            draft,
            version: nextVersion,
            updatedAt: savedAt,
          },
        },
      );
      if (result.matchedCount !== 1) {
        throw new ProfileVersionConflictError();
      }
      return clone(await collection.findOne({ ownerId }));
    }

    return queueJsonWrite(async () => {
      const document = await readJsonStore();
      const index = document.profiles.findIndex(
        (candidate) => candidate.ownerId === ownerId,
      );
      if (
        index < 0 ||
        Number(document.profiles[index].version) !== expectedVersion
      ) {
        throw new ProfileVersionConflictError();
      }

      document.profiles[index] = {
        ...document.profiles[index],
        draft,
        version: nextVersion,
        updatedAt: savedAt,
      };
      await writeJsonStore(document);
      return clone(document.profiles[index]);
    });
  }

  async function publishSnapshot(
    ownerId,
    expectedVersion,
    slug,
    snapshot,
    publishedAt,
  ) {
    const collection = await databaseCollection();
    if (collection) {
      try {
        const result = await collection.updateOne(
          { ownerId, version: expectedVersion },
          {
            $set: {
              slug,
              status: 'published',
              published: snapshot,
              publishedVersion: expectedVersion,
              publishedAt,
            },
          },
        );
        if (result.matchedCount !== 1) {
          throw new ProfileVersionConflictError();
        }
        return clone(await collection.findOne({ ownerId }));
      } catch (error) {
        if (error?.code === 11000) throw new ProfileSlugConflictError();
        throw error;
      }
    }

    return queueJsonWrite(async () => {
      const document = await readJsonStore();
      const index = document.profiles.findIndex(
        (candidate) => candidate.ownerId === ownerId,
      );
      if (
        index < 0 ||
        Number(document.profiles[index].version) !== expectedVersion
      ) {
        throw new ProfileVersionConflictError();
      }
      const conflict = document.profiles.some(
        (candidate) =>
          candidate.ownerId !== ownerId && candidate.slug === slug,
      );
      if (conflict) throw new ProfileSlugConflictError();

      document.profiles[index] = {
        ...document.profiles[index],
        slug,
        status: 'published',
        published: snapshot,
        publishedVersion: expectedVersion,
        publishedAt,
      };
      await writeJsonStore(document);
      return clone(document.profiles[index]);
    });
  }

  return Object.freeze({
    createIfMissing,
    findByOwnerId,
    findBySlug,
    publishSnapshot,
    saveDraft,
  });
}

module.exports = {
  ProfileSlugConflictError,
  ProfileVersionConflictError,
  createProfileRepository,
};
