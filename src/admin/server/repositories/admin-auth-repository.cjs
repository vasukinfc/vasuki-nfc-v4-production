'use strict';

class AdminDatabaseUnavailableError extends Error {
  constructor() {
    super('Admin database is unavailable.');
    this.name = 'AdminDatabaseUnavailableError';
    this.code = 'ADMIN_DATABASE_UNAVAILABLE';
    this.status = 503;
  }
}

/**
 * MongoDB repository for administrator identities and sessions.
 *
 * @param {{getDatabase: () => unknown | Promise<unknown>}} dependencies
 */
function createAdminAuthRepository({ getDatabase }) {
  let indexInitialization;

  async function getCollections() {
    const database = await getDatabase();
    if (!database) throw new AdminDatabaseUnavailableError();

    return {
      adminUsers: database.collection('admin_users'),
      adminSessions: database.collection('admin_sessions'),
    };
  }

  async function ensureIndexes() {
    if (indexInitialization) return indexInitialization;

    indexInitialization = getCollections()
      .then(({ adminUsers, adminSessions }) =>
        Promise.all([
          adminUsers.createIndex({ adminId: 1 }, { unique: true }),
          adminUsers.createIndex({ emailLower: 1 }, { unique: true }),
          adminUsers.createIndex({ role: 1, status: 1 }),
          adminSessions.createIndex({ sessionId: 1 }, { unique: true }),
          adminSessions.createIndex({ tokenHash: 1 }, { unique: true }),
          adminSessions.createIndex({ adminId: 1 }),
          adminSessions.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0 },
          ),
        ]),
      )
      .catch((error) => {
        indexInitialization = undefined;
        throw error;
      });

    return indexInitialization;
  }

  async function findAdminByEmail(emailLower) {
    const { adminUsers } = await getCollections();
    return adminUsers.findOne({ emailLower });
  }

  async function findAdminById(adminId) {
    const { adminUsers } = await getCollections();
    return adminUsers.findOne({ adminId });
  }

  async function createAdmin(admin) {
    await ensureIndexes();
    const { adminUsers } = await getCollections();
    await adminUsers.insertOne(admin);
    return admin;
  }

  async function recordSuccessfulLogin(adminId, loggedInAt) {
    const { adminUsers } = await getCollections();
    await adminUsers.updateOne(
      { adminId },
      { $set: { lastLoginAt: loggedInAt, updatedAt: loggedInAt } },
    );
  }

  async function createSession(session) {
    await ensureIndexes();
    const { adminSessions } = await getCollections();
    await adminSessions.insertOne(session);
    return session;
  }

  async function findSessionByTokenHash(tokenHash) {
    const { adminSessions } = await getCollections();
    return adminSessions.findOne({ tokenHash, revokedAt: null });
  }

  async function touchSession(sessionId, lastSeenAt) {
    const { adminSessions } = await getCollections();
    await adminSessions.updateOne(
      { sessionId, revokedAt: null },
      { $set: { lastSeenAt } },
    );
  }

  async function revokeSession(tokenHash, revokedAt = new Date()) {
    const { adminSessions } = await getCollections();
    await adminSessions.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt } },
    );
  }

  return Object.freeze({
    ensureIndexes,
    findAdminByEmail,
    findAdminById,
    createAdmin,
    recordSuccessfulLogin,
    createSession,
    findSessionByTokenHash,
    touchSession,
    revokeSession,
  });
}

module.exports = {
  AdminDatabaseUnavailableError,
  createAdminAuthRepository,
};
