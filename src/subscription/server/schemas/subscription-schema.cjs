'use strict';

const { planByCode } = require('../domain/subscription-plans.cjs');
const { isoDate } = require('../domain/subscription-lifecycle.cjs');

const SUBSCRIPTION_STATUSES = Object.freeze([
  'active',
  'expired',
  'suspended',
  'lifetime',
]);

const HISTORY_EVENT_TYPES = Object.freeze([
  'activated',
  'renewed',
  'suspended',
  'expired',
  'restored',
  'plan_assigned',
]);

function cleanIdentifier(value, field) {
  const result = String(value || '').trim();
  if (!result || result.length > 120) {
    throw new TypeError(`${field} is required.`);
  }
  return result;
}

function optionalDate(value) {
  return value ? isoDate(value) : null;
}

function normalizeActor(actor = {}) {
  const type = ['admin', 'customer', 'system'].includes(actor.type)
    ? actor.type
    : 'system';
  return Object.freeze({
    type,
    id: String(actor.id || type).trim().slice(0, 120),
  });
}

function normalizeSubscriptionRecord(input, planOptions) {
  const plan = planByCode(input?.planCode, planOptions);
  if (!plan) throw new TypeError('A valid subscription plan is required.');
  const status = String(input?.status || '').trim().toLowerCase();
  if (!SUBSCRIPTION_STATUSES.includes(status)) {
    throw new TypeError('A valid subscription status is required.');
  }

  return Object.freeze({
    subscriptionId: cleanIdentifier(input.subscriptionId, 'subscriptionId'),
    ownerId: cleanIdentifier(input.ownerId, 'ownerId'),
    planCode: plan.code,
    status,
    startsAt: isoDate(input.startsAt),
    expiresAt: plan.kind === 'lifetime' ? null : optionalDate(input.expiresAt),
    graceEndsAt:
      plan.kind === 'lifetime' ? null : optionalDate(input.graceEndsAt),
    suspendedAt: optionalDate(input.suspendedAt),
    endedAt: optionalDate(input.endedAt),
    reason: String(input.reason || '').trim().slice(0, 300),
    version: Math.max(0, Number(input.version) || 0),
    createdAt: isoDate(input.createdAt),
    updatedAt: isoDate(input.updatedAt),
  });
}

function normalizeHistoryEvent(input) {
  const eventType = String(input?.eventType || '').trim().toLowerCase();
  if (!HISTORY_EVENT_TYPES.includes(eventType)) {
    throw new TypeError('A valid subscription history event is required.');
  }
  return Object.freeze({
    historyId: cleanIdentifier(input.historyId, 'historyId'),
    subscriptionId: cleanIdentifier(
      input.subscriptionId,
      'subscriptionId',
    ),
    ownerId: cleanIdentifier(input.ownerId, 'ownerId'),
    eventType,
    fromPlanCode: input.fromPlanCode
      ? cleanIdentifier(input.fromPlanCode, 'fromPlanCode')
      : null,
    toPlanCode: input.toPlanCode
      ? cleanIdentifier(input.toPlanCode, 'toPlanCode')
      : null,
    fromStatus: input.fromStatus
      ? cleanIdentifier(input.fromStatus, 'fromStatus')
      : null,
    toStatus: cleanIdentifier(input.toStatus, 'toStatus'),
    reason: String(input.reason || '').trim().slice(0, 300),
    actor: normalizeActor(input.actor),
    occurredAt: isoDate(input.occurredAt),
  });
}

module.exports = {
  HISTORY_EVENT_TYPES,
  SUBSCRIPTION_STATUSES,
  normalizeActor,
  normalizeHistoryEvent,
  normalizeSubscriptionRecord,
};
