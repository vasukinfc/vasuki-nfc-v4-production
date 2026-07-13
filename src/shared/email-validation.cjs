'use strict';

const dns = require('dns').promises;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'fakeinbox.com',
  'throwawaymail.com', 'maildrop.cc', 'dispostable.com', 'moakt.com', 'mintemail.com',
  'tempmail.net', 'temp-mail.com', 'temporary-mail.net', 'emailondeck.com', 'mailnesia.com',
  'mailcatch.com', 'mail.tm', 'inboxkitten.com', 'tempmailo.com', '1secmail.com',
  '1secmail.net', '1secmail.org', 'burnermail.io', 'anonaddy.com', 'simplelogin.com',
]);

const TRANSIENT_DNS_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ETIMEOUT',
  'ESERVFAIL',
  'SERVFAIL',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

const DEFAULT_DNS_LOOKUP_TIMEOUT_MS = 2500;

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

function isValidEmailFormat(email = '') {
  const value = normalizeEmail(email);
  if (!value || value.length > 254) return false;
  if (value.includes('..')) return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value);
}

function isTransientDnsError(error) {
  return TRANSIENT_DNS_ERROR_CODES.has(String(error?.code || '').toUpperCase());
}

function hasUsableMxRecord(records) {
  return Array.isArray(records)
    && records.some((record) => String(record?.exchange || '').trim() && record.exchange !== '.');
}

function dnsTimeout(timeoutMs) {
  const error = new Error('DNS lookup timed out');
  error.code = 'ETIMEOUT';
  return error;
}

async function withLookupTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(dnsTimeout(timeoutMs)), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWithRetry(operation, attempts = 2, timeoutMs = DEFAULT_DNS_LOOKUP_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withLookupTimeout(operation(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isTransientDnsError(error)) throw error;
    }
  }
  throw lastError;
}

async function hasAddressRecord(domain, resolver, timeoutMs) {
  let transientFailure = false;
  for (const method of ['resolve4', 'resolve6']) {
    if (typeof resolver[method] !== 'function') continue;
    try {
      const records = await resolveWithRetry(() => resolver[method](domain), 2, timeoutMs);
      if (Array.isArray(records) && records.length > 0) return true;
    } catch (error) {
      if (isTransientDnsError(error)) {
        transientFailure = true;
      }
    }
  }
  return transientFailure ? null : false;
}

/**
 * Validates a customer email without turning temporary DNS resolver failures
 * into false "fake email" rejections. Registration still requires OTP delivery
 * before account activation, so allowing a transiently unverifiable domain is
 * safer than blocking valid customers during DNS outages.
 */
async function validateRealEmail(email = '', {
  resolver = dns,
  dnsLookupTimeoutMs = DEFAULT_DNS_LOOKUP_TIMEOUT_MS,
} = {}) {
  const emailLower = normalizeEmail(email);
  if (!isValidEmailFormat(emailLower)) throw new Error('Please enter a valid email address');

  const domain = emailLower.split('@')[1];
  if (!domain || DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    throw new Error('Temporary or fake email addresses are not allowed');
  }

  let transientFailure = false;
  try {
    const mxRecords = await resolveWithRetry(
      () => resolver.resolveMx(domain),
      2,
      dnsLookupTimeoutMs,
    );
    if (hasUsableMxRecord(mxRecords)) return emailLower;
  } catch (error) {
    if (isTransientDnsError(error)) {
      transientFailure = true;
    }
  }

  const hasAddress = await hasAddressRecord(domain, resolver, dnsLookupTimeoutMs);
  if (hasAddress === true) return emailLower;
  if (hasAddress === null || transientFailure) return emailLower;

  throw new Error('Please enter a real working email address');
}

function registrationConflictMessage(existing) {
  if (!existing) return '';
  if (existing.emailVerified === true) return 'Account already exists. Please login.';
  return 'This email or mobile is already registered but not verified. Please use Resend OTP or contact support.';
}

module.exports = {
  DISPOSABLE_EMAIL_DOMAINS,
  DEFAULT_DNS_LOOKUP_TIMEOUT_MS,
  isTransientDnsError,
  isValidEmailFormat,
  normalizeEmail,
  registrationConflictMessage,
  validateRealEmail,
};
