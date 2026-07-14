'use strict';

const crypto = require('crypto');

const AUDIENCES = Object.freeze(['customer', 'admin']);
const SEVERITIES = Object.freeze(['info', 'warning', 'success', 'error']);
const CUSTOMER_TYPES = Object.freeze([
  'subscription_expiry_warning',
  'subscription_grace_period',
  'subscription_activated',
  'subscription_renewed',
  'subscription_expired',
]);
const ADMIN_TYPES = Object.freeze([
  'customer_registered',
  'subscription_expiring_today',
  'subscription_expired',
  'manual_renewal_completed',
  'lifetime_plan_activated',
]);

function requiredText(value, field, limit = 300) {
  const result = String(value || '').trim();
  if (!result) throw new TypeError(`${field} is required.`);
  return result.slice(0, limit);
}

function validDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('A valid notification date is required.');
  }
  return date.toISOString();
}

function normalizeReads(reads) {
  const readerIds = new Set();
  return Object.freeze(
    (Array.isArray(reads) ? reads : [])
      .filter((read) => {
        const readerId = String(read?.readerId || '').trim();
        if (!readerId || readerIds.has(readerId)) return false;
        readerIds.add(readerId);
        return true;
      })
      .map((read) =>
        Object.freeze({
          readerId: String(read.readerId).trim().slice(0, 120),
          readAt: validDate(read.readAt),
        }),
      ),
  );
}

/**
 * Normalizes an immutable, provider-agnostic in-app notification.
 */
function normalizeNotification(input) {
  const audience = String(input?.audience || '').trim().toLowerCase();
  if (!AUDIENCES.includes(audience)) {
    throw new TypeError('A valid notification audience is required.');
  }
  const allowedTypes =
    audience === 'customer' ? CUSTOMER_TYPES : ADMIN_TYPES;
  const type = String(input?.type || '').trim().toLowerCase();
  if (!allowedTypes.includes(type)) {
    throw new TypeError('A valid notification type is required.');
  }
  const severity = String(input?.severity || 'info').trim().toLowerCase();
  if (!SEVERITIES.includes(severity)) {
    throw new TypeError('A valid notification severity is required.');
  }
  const recipientId =
    audience === 'customer'
      ? requiredText(input.recipientId, 'recipientId', 120)
      : 'admin';

  return Object.freeze({
    notificationId:
      String(input?.notificationId || '').trim() ||
      `NOT-${crypto.randomUUID()}`,
    audience,
    recipientId,
    type,
    severity,
    title: requiredText(input.title, 'title', 120),
    message: requiredText(input.message, 'message', 500),
    entityType: String(input.entityType || '').trim().slice(0, 60),
    entityId: String(input.entityId || '').trim().slice(0, 120),
    dedupeKey: requiredText(input.dedupeKey, 'dedupeKey', 240),
    reads: normalizeReads(input.reads),
    createdAt: validDate(input.createdAt || new Date()),
  });
}

module.exports = {
  ADMIN_TYPES,
  AUDIENCES,
  CUSTOMER_TYPES,
  SEVERITIES,
  normalizeNotification,
};
