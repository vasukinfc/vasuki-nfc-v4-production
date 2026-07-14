'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mongoDocument(result) {
  if (!result) return null;
  return Object.prototype.hasOwnProperty.call(result, 'value')
    ? result.value
    : result;
}

/**
 * MongoDB-first media metadata repository with atomic JSON development
 * fallback. Existing JSON metadata is seeded into MongoDB per owner on first
 * access so enabling MongoDB does not orphan previously uploaded local media.
 */
function createProfileMediaRepository({
  dataFile,
  getDatabase = () => null,
}) {
  let indexInitialization;
  let writeQueue = Promise.resolve();

  async function databaseCollection() {
    const database = await getDatabase();
    if (!database) return null;
    const collection = database.collection('profile_media');
    if (!indexInitialization) {
      indexInitialization = collection
        .createIndex({ ownerId: 1 }, { unique: true })
        .catch((error) => {
          indexInitialization = undefined;
          throw error;
        });
    }
    await indexInitialization;
    return collection;
  }

  async function readStore() {
    try {
      const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      return {
        version: 1,
        media: Array.isArray(parsed.media) ? parsed.media : [],
        videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, media: [], videos: [] };
    }
  }

  async function writeStore(store) {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(
      temporaryFile,
      `${JSON.stringify(store, null, 2)}\n`,
      'utf8',
    );
    await fs.rename(temporaryFile, dataFile);
  }

  function queueWrite(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function localOwnerRecord(ownerId) {
    await writeQueue;
    const store = await readStore();
    return {
      media: store.media.filter((item) => item.ownerId === ownerId),
      videos: store.videos.filter((item) => item.ownerId === ownerId),
    };
  }

  async function ensureMongoOwner(collection, ownerId) {
    let document = await collection.findOne({ ownerId });
    if (document) return document;
    const local = await localOwnerRecord(ownerId);
    await collection.updateOne(
      { ownerId },
      {
        $setOnInsert: {
          ownerId,
          version: 1,
          media: local.media,
          videos: local.videos,
        },
      },
      { upsert: true },
    );
    document = await collection.findOne({ ownerId });
    return document || { ownerId, version: 1, media: [], videos: [] };
  }

  async function list(ownerId) {
    const collection = await databaseCollection();
    if (collection) {
      const document = await ensureMongoOwner(collection, ownerId);
      return {
        media: clone(Array.isArray(document.media) ? document.media : []),
        videos: clone(Array.isArray(document.videos) ? document.videos : []),
      };
    }
    return clone(await localOwnerRecord(ownerId));
  }

  async function findMedia(ownerId, mediaId) {
    const result = await list(ownerId);
    return result.media.find((item) => item.mediaId === mediaId) || null;
  }

  async function insertMedia(record) {
    const collection = await databaseCollection();
    if (collection) {
      await ensureMongoOwner(collection, record.ownerId);
      await collection.updateOne(
        { ownerId: record.ownerId },
        { $push: { media: record } },
      );
      return clone(record);
    }
    return queueWrite(async () => {
      const store = await readStore();
      store.media.push(record);
      await writeStore(store);
      return clone(record);
    });
  }

  async function replaceMedia(ownerId, mediaId, record) {
    const collection = await databaseCollection();
    if (collection) {
      await ensureMongoOwner(collection, ownerId);
      const result = mongoDocument(
        await collection.findOneAndUpdate(
          { ownerId, 'media.mediaId': mediaId },
          { $set: { 'media.$': record } },
          { returnDocument: 'after' },
        ),
      );
      return result ? clone(record) : null;
    }
    return queueWrite(async () => {
      const store = await readStore();
      const index = store.media.findIndex(
        (item) => item.ownerId === ownerId && item.mediaId === mediaId,
      );
      if (index < 0) return null;
      store.media[index] = record;
      await writeStore(store);
      return clone(record);
    });
  }

  async function deleteMedia(ownerId, mediaId) {
    const collection = await databaseCollection();
    if (collection) {
      await ensureMongoOwner(collection, ownerId);
      const before = mongoDocument(
        await collection.findOneAndUpdate(
          { ownerId, 'media.mediaId': mediaId },
          { $pull: { media: { mediaId } } },
          { returnDocument: 'before' },
        ),
      );
      const removed = before?.media?.find((item) => item.mediaId === mediaId);
      return removed ? clone(removed) : null;
    }
    return queueWrite(async () => {
      const store = await readStore();
      const index = store.media.findIndex(
        (item) => item.ownerId === ownerId && item.mediaId === mediaId,
      );
      if (index < 0) return null;
      const [removed] = store.media.splice(index, 1);
      await writeStore(store);
      return clone(removed);
    });
  }

  async function insertVideo(record) {
    const collection = await databaseCollection();
    if (collection) {
      await ensureMongoOwner(collection, record.ownerId);
      await collection.updateOne(
        { ownerId: record.ownerId },
        { $push: { videos: record } },
      );
      return clone(record);
    }
    return queueWrite(async () => {
      const store = await readStore();
      store.videos.push(record);
      await writeStore(store);
      return clone(record);
    });
  }

  async function updateVideo(ownerId, videoId, nextRecord) {
    const collection = await databaseCollection();
    if (collection) {
      await ensureMongoOwner(collection, ownerId);
      const result = mongoDocument(
        await collection.findOneAndUpdate(
          { ownerId, 'videos.videoId': videoId },
          { $set: { 'videos.$': nextRecord } },
          { returnDocument: 'after' },
        ),
      );
      return result ? clone(nextRecord) : null;
    }
    return queueWrite(async () => {
      const store = await readStore();
      const index = store.videos.findIndex(
        (item) => item.ownerId === ownerId && item.videoId === videoId,
      );
      if (index < 0) return null;
      store.videos[index] = nextRecord;
      await writeStore(store);
      return clone(nextRecord);
    });
  }

  async function deleteVideo(ownerId, videoId) {
    const collection = await databaseCollection();
    if (collection) {
      await ensureMongoOwner(collection, ownerId);
      const before = mongoDocument(
        await collection.findOneAndUpdate(
          { ownerId, 'videos.videoId': videoId },
          { $pull: { videos: { videoId } } },
          { returnDocument: 'before' },
        ),
      );
      const removed = before?.videos?.find((item) => item.videoId === videoId);
      return removed ? clone(removed) : null;
    }
    return queueWrite(async () => {
      const store = await readStore();
      const index = store.videos.findIndex(
        (item) => item.ownerId === ownerId && item.videoId === videoId,
      );
      if (index < 0) return null;
      const [removed] = store.videos.splice(index, 1);
      await writeStore(store);
      return clone(removed);
    });
  }

  return Object.freeze({
    deleteMedia,
    deleteVideo,
    findMedia,
    insertMedia,
    insertVideo,
    list,
    replaceMedia,
    updateVideo,
  });
}

module.exports = {
  createProfileMediaRepository,
};
