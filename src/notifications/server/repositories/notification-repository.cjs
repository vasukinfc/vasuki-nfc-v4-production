'use strict';

const fs = require('fs').promises;
const path = require('path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * MongoDB-first notification repository with an atomic JSON fallback.
 *
 * MongoDB collection: notifications
 */
function createNotificationRepository({ getDatabase, dataFile }) {
  let indexInitialization;
  let writeQueue = Promise.resolve();

  async function collection() {
    const database = await getDatabase();
    if (!database) return null;
    const notifications = database.collection('notifications');
    if (!indexInitialization) {
      indexInitialization = Promise.all([
        notifications.createIndex({ notificationId: 1 }, { unique: true }),
        notifications.createIndex({ dedupeKey: 1 }, { unique: true }),
        notifications.createIndex({
          audience: 1,
          recipientId: 1,
          createdAt: -1,
        }),
        notifications.createIndex({ 'reads.readerId': 1 }),
      ]).catch((error) => {
        indexInitialization = undefined;
        throw error;
      });
    }
    await indexInitialization;
    return notifications;
  }

  async function readStore() {
    try {
      const document = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      return {
        version: 1,
        notifications: Array.isArray(document.notifications)
          ? document.notifications
          : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, notifications: [] };
    }
  }

  async function writeStore(document) {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const temporaryFile = `${dataFile}.${process.pid}.tmp`;
    await fs.writeFile(
      temporaryFile,
      `${JSON.stringify(document, null, 2)}\n`,
      'utf8',
    );
    await fs.rename(temporaryFile, dataFile);
  }

  function queueWrite(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  async function createIfMissing(notification) {
    const notifications = await collection();
    if (notifications) {
      const result = await notifications.findOneAndUpdate(
        { dedupeKey: notification.dedupeKey },
        { $setOnInsert: notification },
        { upsert: true, returnDocument: 'after' },
      );
      return clone(result);
    }
    return queueWrite(async () => {
      const document = await readStore();
      const existing = document.notifications.find(
        (item) => item.dedupeKey === notification.dedupeKey,
      );
      if (existing) return clone(existing);
      document.notifications.push(notification);
      await writeStore(document);
      return clone(notification);
    });
  }

  function readAtFor(notification, readerId) {
    return (
      (Array.isArray(notification.reads) ? notification.reads : []).find(
        (read) => read.readerId === readerId,
      )?.readAt || null
    );
  }

  async function list({
    audience,
    recipientId,
    readerId,
    unreadOnly = false,
    limit = 200,
  }) {
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const notifications = await collection();
    let records;
    if (notifications) {
      records = await notifications
        .find({ audience, recipientId })
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .toArray();
    } else {
      await writeQueue;
      const document = await readStore();
      records = document.notifications
        .filter(
          (item) =>
            item.audience === audience && item.recipientId === recipientId,
        )
        .sort((left, right) =>
          String(right.createdAt).localeCompare(String(left.createdAt)),
        )
        .slice(0, safeLimit);
    }
    return clone(
      records
        .map((notification) => ({
          ...notification,
          readAt: readAtFor(notification, readerId),
        }))
        .filter((notification) => !unreadOnly || !notification.readAt),
    );
  }

  async function markRead({
    notificationId,
    audience,
    recipientId,
    readerId,
    readAt,
  }) {
    const notifications = await collection();
    if (notifications) {
      const result = await notifications.findOneAndUpdate(
        {
          notificationId,
          audience,
          recipientId,
          'reads.readerId': { $ne: readerId },
        },
        { $push: { reads: { readerId, readAt } } },
        { returnDocument: 'after' },
      );
      if (result) return clone(result);
      return clone(
        await notifications.findOne({
          notificationId,
          audience,
          recipientId,
        }),
      );
    }
    return queueWrite(async () => {
      const document = await readStore();
      const index = document.notifications.findIndex(
        (item) =>
          item.notificationId === notificationId &&
          item.audience === audience &&
          item.recipientId === recipientId,
      );
      if (index < 0) return null;
      const reads = Array.isArray(document.notifications[index].reads)
        ? document.notifications[index].reads
        : [];
      if (!reads.some((read) => read.readerId === readerId)) {
        reads.push({ readerId, readAt });
        document.notifications[index].reads = reads;
        await writeStore(document);
      }
      return clone(document.notifications[index]);
    });
  }

  async function markAllRead({
    audience,
    recipientId,
    readerId,
    readAt,
  }) {
    const notifications = await collection();
    if (notifications) {
      const result = await notifications.updateMany(
        {
          audience,
          recipientId,
          'reads.readerId': { $ne: readerId },
        },
        { $push: { reads: { readerId, readAt } } },
      );
      return result.modifiedCount;
    }
    return queueWrite(async () => {
      const document = await readStore();
      let modified = 0;
      document.notifications.forEach((notification) => {
        if (
          notification.audience !== audience ||
          notification.recipientId !== recipientId
        ) {
          return;
        }
        const reads = Array.isArray(notification.reads)
          ? notification.reads
          : [];
        if (!reads.some((read) => read.readerId === readerId)) {
          reads.push({ readerId, readAt });
          notification.reads = reads;
          modified += 1;
        }
      });
      if (modified) await writeStore(document);
      return modified;
    });
  }

  return Object.freeze({
    createIfMissing,
    list,
    markAllRead,
    markRead,
  });
}

module.exports = {
  createNotificationRepository,
};
