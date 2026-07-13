'use strict';

const crypto = require('crypto');

const ALLOWED_ADMIN_ROLES = new Set(['super_admin', 'admin']);

class AdminAuthError extends Error {
  constructor(message, status = 401, code = 'ADMIN_AUTH_FAILED') {
    super(message);
    this.name = 'AdminAuthError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Exposes only safe administrator fields to routes and browser code.
 *
 * @param {object} admin
 */
function publicAdmin(admin) {
  return Object.freeze({
    adminId: admin.adminId,
    displayName: admin.displayName,
    email: admin.email,
    role: admin.role,
  });
}

/**
 * Creates the basic admin authentication service.
 *
 * @param {{
 *   repository: object,
 *   passwordSecurity: object,
 *   sessionSecurity: object,
 *   config: object
 * }} dependencies
 */
function createAdminAuthService({
  repository,
  passwordSecurity,
  sessionSecurity,
  config,
}) {
  function assertSessionConfiguration() {
    if (!config.sessionReady) {
      throw new AdminAuthError(
        'Admin session configuration is unavailable.',
        503,
        'ADMIN_SESSION_NOT_CONFIGURED',
      );
    }
  }

  async function login({ email, password }) {
    assertSessionConfiguration();

    const emailLower = String(email || '').trim().toLowerCase();
    if (!emailLower || typeof password !== 'string' || !password) {
      throw new AdminAuthError('Invalid email or password.');
    }

    await repository.ensureIndexes();
    const admin = await repository.findAdminByEmail(emailLower);
    const validPassword =
      admin &&
      (await passwordSecurity.verifyAdminPassword(
        password,
        admin.password,
      ));

    if (
      !admin ||
      !validPassword ||
      admin.status !== 'active' ||
      !ALLOWED_ADMIN_ROLES.has(admin.role)
    ) {
      throw new AdminAuthError('Invalid email or password.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.sessionDurationMs);
    const sessionToken = sessionSecurity.createSessionToken();
    const tokenHash = sessionSecurity.hashSessionToken(
      sessionToken,
      config.sessionSecret,
    );

    await repository.createSession({
      sessionId: crypto.randomUUID(),
      adminId: admin.adminId,
      tokenHash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null,
    });
    await repository.recordSuccessfulLogin(admin.adminId, now);

    return {
      admin: publicAdmin(admin),
      sessionToken,
    };
  }

  async function authenticate(sessionToken) {
    assertSessionConfiguration();
    if (!sessionToken) return null;

    const tokenHash = sessionSecurity.hashSessionToken(
      sessionToken,
      config.sessionSecret,
    );
    const session = await repository.findSessionByTokenHash(tokenHash);
    if (!session) return null;

    const now = new Date();
    if (!(session.expiresAt instanceof Date) || session.expiresAt <= now) {
      await repository.revokeSession(tokenHash, now);
      return null;
    }

    const admin = await repository.findAdminById(session.adminId);
    if (
      !admin ||
      admin.status !== 'active' ||
      !ALLOWED_ADMIN_ROLES.has(admin.role)
    ) {
      await repository.revokeSession(tokenHash, now);
      return null;
    }

    await repository.touchSession(session.sessionId, now);

    return {
      admin: publicAdmin(admin),
      session: Object.freeze({
        sessionId: session.sessionId,
        tokenHash,
        expiresAt: session.expiresAt,
      }),
    };
  }

  async function logout(tokenHash) {
    if (!tokenHash) return;
    await repository.revokeSession(tokenHash, new Date());
  }

  return Object.freeze({
    login,
    authenticate,
    logout,
  });
}

module.exports = {
  AdminAuthError,
  createAdminAuthService,
  publicAdmin,
};
