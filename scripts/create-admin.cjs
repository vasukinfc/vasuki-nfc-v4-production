'use strict';

const crypto = require('crypto');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const {
  createAdminAuthRepository,
} = require('../src/admin/server/repositories/admin-auth-repository.cjs');
const {
  hashAdminPassword,
} = require('../src/admin/server/security/admin-password.cjs');

async function promptForText(prompt, fallback = '') {
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(prompt);
    return answer.trim() || fallback;
  } finally {
    terminal.close();
  }
}

function promptForHiddenText(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error(
      'A terminal is required for secure password entry. ' +
        'Alternatively set ADMIN_BOOTSTRAP_PASSWORD temporarily.',
    );
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(prompt);

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    const onData = (input) => {
      for (const character of input) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Admin creation cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || '';
  const databaseName = process.env.MONGODB_DB_NAME || 'vasukinfc';
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required to create an administrator.');
  }

  const email = (
    process.env.ADMIN_BOOTSTRAP_EMAIL ||
    (await promptForText('Admin email: '))
  ).toLowerCase();
  const displayName =
    process.env.ADMIN_BOOTSTRAP_NAME ||
    (await promptForText('Display name: ', 'Super Admin'));
  const password =
    process.env.ADMIN_BOOTSTRAP_PASSWORD ||
    (await promptForHiddenText('Password (minimum 12 characters): '));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid administrator email is required.');
  }

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const database = client.db(databaseName);
    const repository = createAdminAuthRepository({
      getDatabase: () => database,
    });

    await repository.ensureIndexes();
    if (await repository.findAdminByEmail(email)) {
      throw new Error('An administrator with this email already exists.');
    }

    const now = new Date();
    await repository.createAdmin({
      adminId: `ADM-${crypto.randomUUID()}`,
      displayName,
      email,
      emailLower: email,
      password: await hashAdminPassword(password),
      role: 'super_admin',
      status: 'active',
      lastLoginAt: null,
      passwordChangedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    stdout.write(`Super admin created for ${email}.\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
