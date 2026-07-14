'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});

/**
 * Creates a salted password record suitable for the admin_users collection.
 *
 * @param {string} password
 */
async function hashAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new TypeError('Admin password must contain at least 12 characters.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS,
  );

  return Object.freeze({
    algorithm: 'scrypt',
    salt,
    hash: derivedKey.toString('hex'),
    keyLength: KEY_LENGTH,
    cost: SCRYPT_OPTIONS.N,
    blockSize: SCRYPT_OPTIONS.r,
    parallelization: SCRYPT_OPTIONS.p,
  });
}

/**
 * Verifies an administrator password using timing-safe comparison.
 *
 * @param {string} password
 * @param {object} passwordRecord
 * @returns {Promise<boolean>}
 */
async function verifyAdminPassword(password, passwordRecord) {
  if (
    typeof password !== 'string' ||
    !passwordRecord ||
    passwordRecord.algorithm !== 'scrypt' ||
    typeof passwordRecord.salt !== 'string' ||
    typeof passwordRecord.hash !== 'string'
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(passwordRecord.hash, 'hex');
    const derivedKey = await scryptAsync(
      password,
      passwordRecord.salt,
      expected.length,
      {
        N: Number(passwordRecord.cost) || SCRYPT_OPTIONS.N,
        r: Number(passwordRecord.blockSize) || SCRYPT_OPTIONS.r,
        p:
          Number(passwordRecord.parallelization) ||
          SCRYPT_OPTIONS.p,
        maxmem: SCRYPT_OPTIONS.maxmem,
      },
    );

    return (
      expected.length > 0 &&
      expected.length === derivedKey.length &&
      crypto.timingSafeEqual(expected, derivedKey)
    );
  } catch {
    return false;
  }
}

module.exports = {
  hashAdminPassword,
  verifyAdminPassword,
};
