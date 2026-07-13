'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isValidEmailFormat,
  registrationConflictMessage,
  validateRealEmail,
} = require('../src/shared/email-validation.cjs');

function dnsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

test('valid Gmail address is accepted when MX lookup succeeds', async () => {
  const resolver = {
    async resolveMx(domain) {
      assert.equal(domain, 'gmail.com');
      return [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }];
    },
    async resolve4() {
      throw new Error('A fallback should not run after usable MX records');
    },
    async resolve6() {
      throw new Error('AAAA fallback should not run after usable MX records');
    },
  };

  const email = await validateRealEmail('Valid.User@gmail.com', { resolver });
  assert.equal(email, 'valid.user@gmail.com');
});

test('invalid email syntax is rejected before DNS lookup', async () => {
  assert.equal(isValidEmailFormat('not-an-email'), false);
  await assert.rejects(
    () => validateRealEmail('not-an-email', {
      resolver: {
        async resolveMx() {
          throw new Error('DNS should not run for invalid syntax');
        },
      },
    }),
    /valid email address/,
  );
});

test('clearly nonexistent domain is rejected after MX and address lookups fail definitively', async () => {
  const resolver = {
    async resolveMx() {
      throw dnsError('ENOTFOUND');
    },
    async resolve4() {
      throw dnsError('ENOTFOUND');
    },
    async resolve6() {
      throw dnsError('ENOTFOUND');
    },
  };

  await assert.rejects(
    () => validateRealEmail('customer@definitely-not-real-vasuki-example.invalid', { resolver }),
    /real working email address/,
  );
});

test('duplicate email registration returns safe existing-account message', () => {
  assert.equal(
    registrationConflictMessage({ emailVerified: true }),
    'Account already exists. Please login.',
  );
  assert.equal(
    registrationConflictMessage({ emailVerified: false }),
    'This email or mobile is already registered but not verified. Please use Resend OTP or contact support.',
  );
});

test('transient DNS failure does not falsely reject a syntactically valid non-disposable email', async () => {
  const resolver = {
    async resolveMx() {
      throw dnsError('EAI_AGAIN');
    },
    async resolve4() {
      throw dnsError('EAI_AGAIN');
    },
    async resolve6() {
      throw dnsError('EAI_AGAIN');
    },
  };

  const email = await validateRealEmail('customer@gmail.com', { resolver });
  assert.equal(email, 'customer@gmail.com');
});

test('DNS lookup timeout is treated as transient and allows OTP verification to decide', async () => {
  const resolver = {
    async resolveMx() {
      return new Promise(() => {});
    },
    async resolve4() {
      return new Promise(() => {});
    },
    async resolve6() {
      return new Promise(() => {});
    },
  };

  const email = await validateRealEmail('customer@gmail.com', {
    resolver,
    dnsLookupTimeoutMs: 5,
  });
  assert.equal(email, 'customer@gmail.com');
});
