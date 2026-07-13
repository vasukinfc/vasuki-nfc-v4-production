'use strict';

const fs = require('fs').promises;
const path = require('path');

class SubscriptionVersionConflictError extends Error {
  constructor() {
    super('The subscription changed before this operation completed.');
    this.name = 'SubscriptionVersionConflictError';
    this.code = 'SUBSCRIPTION_VERSION_CONFLICT';
    this.status = 409;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * MongoDB-first subscription repository with an atomic JSON fallback.
 *
 * MongoDB collections:
 * - subscriptions
 * - subscription_history
 * - subscription_invoices
 */
function createSubscriptionRepository({ getDatabase, dataFile }) {
  let indexInitialization;
  let writeQueue = Promise.resolve();

  async function collections() {
    const database = await getDatabase();
    if (!database) return null;
    const result = {
      subscriptions: database.collection('subscriptions'),
      history: database.collection('subscription_history'),
      invoices: database.collection('subscription_invoices'),
    };
    if (!indexInitialization) {
      indexInitialization = Promise.all([
        result.subscriptions.createIndex({ ownerId: 1 }, { unique: true }),
        result.subscriptions.createIndex(
          { subscriptionId: 1 },
          { unique: true },
        ),
        result.subscriptions.createIndex({ status: 1, expiresAt: 1 }),
        result.history.createIndex({ historyId: 1 }, { unique: true }),
        result.history.createIndex({ ownerId: 1, occurredAt: -1 }),
        result.invoices.createIndex({ invoiceId: 1 }, { unique: true }),
        result.invoices.createIndex({ invoiceNumber: 1 }, { unique: true }),
        result.invoices.createIndex({ ownerId: 1, issuedAt: -1 }),
      ]).catch((error) => {
        indexInitialization = undefined;
        throw error;
      });
    }
    await indexInitialization;
    return result;
  }

  async function readStore() {
    try {
      const document = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      return {
        version: 1,
        subscriptions: Array.isArray(document.subscriptions)
          ? document.subscriptions
          : [],
        history: Array.isArray(document.history) ? document.history : [],
        invoices: Array.isArray(document.invoices) ? document.invoices : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, subscriptions: [], history: [], invoices: [] };
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

  async function findByOwnerId(ownerId) {
    const mongo = await collections();
    if (mongo) {
      const record = await mongo.subscriptions.findOne({ ownerId });
      return record ? clone(record) : null;
    }
    await writeQueue;
    const document = await readStore();
    const record = document.subscriptions.find(
      (candidate) => candidate.ownerId === ownerId,
    );
    return record ? clone(record) : null;
  }

  async function listAllSubscriptions(limit = 5000) {
    const safeLimit = Math.min(10000, Math.max(1, Number(limit) || 5000));
    const mongo = await collections();
    if (mongo) {
      return clone(
        await mongo.subscriptions
          .find({})
          .sort({ updatedAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.subscriptions
        .sort((left, right) =>
          String(right.updatedAt).localeCompare(String(left.updatedAt)),
        )
        .slice(0, safeLimit),
    );
  }

  async function saveSubscription(ownerId, expectedVersion, record) {
    const mongo = await collections();
    if (mongo) {
      if (expectedVersion === null) {
        try {
          await mongo.subscriptions.insertOne(record);
          return clone(record);
        } catch (error) {
          if (error?.code === 11000) {
            throw new SubscriptionVersionConflictError();
          }
          throw error;
        }
      }
      const result = await mongo.subscriptions.replaceOne(
        { ownerId, version: expectedVersion },
        record,
      );
      if (result.matchedCount !== 1) {
        throw new SubscriptionVersionConflictError();
      }
      return clone(record);
    }

    return queueWrite(async () => {
      const document = await readStore();
      const index = document.subscriptions.findIndex(
        (candidate) => candidate.ownerId === ownerId,
      );
      if (expectedVersion === null) {
        if (index >= 0) throw new SubscriptionVersionConflictError();
        document.subscriptions.push(record);
      } else {
        if (
          index < 0 ||
          Number(document.subscriptions[index].version) !== expectedVersion
        ) {
          throw new SubscriptionVersionConflictError();
        }
        document.subscriptions[index] = record;
      }
      await writeStore(document);
      return clone(record);
    });
  }

  async function appendHistory(event) {
    const mongo = await collections();
    if (mongo) {
      await mongo.history.insertOne(event);
      return clone(event);
    }
    return queueWrite(async () => {
      const document = await readStore();
      if (document.history.some((item) => item.historyId === event.historyId)) {
        return clone(event);
      }
      document.history.push(event);
      await writeStore(document);
      return clone(event);
    });
  }

  async function listHistory(ownerId, limit = 100) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const mongo = await collections();
    if (mongo) {
      return clone(
        await mongo.history
          .find({ ownerId })
          .sort({ occurredAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.history
        .filter((event) => event.ownerId === ownerId)
        .sort((left, right) =>
          String(right.occurredAt).localeCompare(String(left.occurredAt)),
        )
        .slice(0, safeLimit),
    );
  }

  async function listAllHistory(limit = 10000) {
    const safeLimit = Math.min(20000, Math.max(1, Number(limit) || 10000));
    const mongo = await collections();
    if (mongo) {
      return clone(
        await mongo.history
          .find({})
          .sort({ occurredAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.history
        .sort((left, right) =>
          String(right.occurredAt).localeCompare(String(left.occurredAt)),
        )
        .slice(0, safeLimit),
    );
  }

  async function createInvoice(invoice) {
    const mongo = await collections();
    if (mongo) {
      await mongo.invoices.insertOne(invoice);
      return clone(invoice);
    }
    return queueWrite(async () => {
      const document = await readStore();
      if (
        document.invoices.some(
          (item) =>
            item.invoiceId === invoice.invoiceId ||
            item.invoiceNumber === invoice.invoiceNumber,
        )
      ) {
        const error = new Error('Invoice identifier already exists.');
        error.code = 'INVOICE_CONFLICT';
        error.status = 409;
        throw error;
      }
      document.invoices.push(invoice);
      await writeStore(document);
      return clone(invoice);
    });
  }

  async function listInvoices(ownerId, limit = 100) {
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const mongo = await collections();
    if (mongo) {
      return clone(
        await mongo.invoices
          .find({ ownerId })
          .sort({ issuedAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.invoices
        .filter((invoice) => invoice.ownerId === ownerId)
        .sort((left, right) =>
          String(right.issuedAt).localeCompare(String(left.issuedAt)),
        )
        .slice(0, safeLimit),
    );
  }

  async function listAllInvoices(limit = 20000) {
    const safeLimit = Math.min(50000, Math.max(1, Number(limit) || 20000));
    const mongo = await collections();
    if (mongo) {
      return clone(
        await mongo.invoices
          .find({})
          .sort({ issuedAt: -1 })
          .limit(safeLimit)
          .toArray(),
      );
    }
    await writeQueue;
    const document = await readStore();
    return clone(
      document.invoices
        .sort((left, right) =>
          String(right.issuedAt).localeCompare(String(left.issuedAt)),
        )
        .slice(0, safeLimit),
    );
  }

  return Object.freeze({
    appendHistory,
    createInvoice,
    findByOwnerId,
    listAllHistory,
    listAllInvoices,
    listAllSubscriptions,
    listHistory,
    listInvoices,
    saveSubscription,
  });
}

module.exports = {
  SubscriptionVersionConflictError,
  createSubscriptionRepository,
};
