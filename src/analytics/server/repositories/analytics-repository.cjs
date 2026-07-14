'use strict';

const fs = require('fs').promises;
const path = require('path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * MongoDB-first analytics event repository with an atomic JSON fallback.
 *
 * MongoDB collection: analytics_events
 */
function createAnalyticsRepository({ getDatabase, dataFile }) {
  let indexInitialization;
  let writeQueue = Promise.resolve();

  async function collection() {
    const database = await getDatabase();
    if (!database) return null;
    const events = database.collection('analytics_events');
    if (!indexInitialization) {
      indexInitialization = Promise.all([
        events.createIndex({ eventId: 1 }, { unique: true }),
        events.createIndex({ ownerId: 1, occurredAt: -1 }),
        events.createIndex({ cardSlug: 1, occurredAt: -1 }),
        events.createIndex({
          ownerId: 1,
          visitorKey: 1,
          sessionKey: 1,
        }),
      ]).catch((error) => {
        indexInitialization = undefined;
        throw error;
      });
    }
    await indexInitialization;
    return events;
  }

  async function readStore() {
    try {
      const document = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      return {
        version: 1,
        events: Array.isArray(document.events) ? document.events : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, events: [] };
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

  async function append(event) {
    const events = await collection();
    if (events) {
      try {
        await events.insertOne(event);
        return clone(event);
      } catch (error) {
        if (error?.code === 11000) return clone(event);
        throw error;
      }
    }
    return queueWrite(async () => {
      const document = await readStore();
      if (document.events.some((item) => item.eventId === event.eventId)) {
        return clone(event);
      }
      document.events.push(event);
      await writeStore(document);
      return clone(event);
    });
  }

  async function listByOwner(
    ownerId,
    { from = null, to = null, limit = 100000 } = {},
  ) {
    const safeLimit = Math.min(500000, Math.max(1, Number(limit) || 100000));
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from).toISOString();
    if (to) dateQuery.$lte = new Date(to).toISOString();
    const query = { ownerId };
    if (Object.keys(dateQuery).length) query.occurredAt = dateQuery;

    const events = await collection();
    if (events) {
      return clone(
        await events
          .find(query)
          .sort({ occurredAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.events
        .filter((event) => {
          if (event.ownerId !== ownerId) return false;
          if (dateQuery.$gte && event.occurredAt < dateQuery.$gte) return false;
          if (dateQuery.$lte && event.occurredAt > dateQuery.$lte) return false;
          return true;
        })
        .sort((left, right) =>
          String(right.occurredAt).localeCompare(String(left.occurredAt)),
        )
        .slice(0, safeLimit),
    );
  }

  async function listAll(
    { from = null, to = null, limit = 100000 } = {},
  ) {
    const safeLimit = Math.min(500000, Math.max(1, Number(limit) || 100000));
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from).toISOString();
    if (to) dateQuery.$lte = new Date(to).toISOString();
    const query = Object.keys(dateQuery).length
      ? { occurredAt: dateQuery }
      : {};
    const events = await collection();
    if (events) {
      return clone(
        await events
          .find(query)
          .sort({ occurredAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.events
        .filter((event) => {
          if (dateQuery.$gte && event.occurredAt < dateQuery.$gte) return false;
          if (dateQuery.$lte && event.occurredAt > dateQuery.$lte) return false;
          return true;
        })
        .sort((left, right) =>
          String(right.occurredAt).localeCompare(String(left.occurredAt)),
        )
        .slice(0, safeLimit),
    );
  }

  return Object.freeze({
    append,
    listAll,
    listByOwner,
  });
}

module.exports = {
  createAnalyticsRepository,
};
