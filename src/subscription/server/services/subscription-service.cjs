'use strict';

const crypto = require('crypto');
const {
  evaluateSubscription,
  expiryForPlan,
  graceEndForExpiry,
  isoDate,
} = require('../domain/subscription-lifecycle.cjs');
const { planByCode } = require('../domain/subscription-plans.cjs');
const {
  normalizeHistoryEvent,
  normalizeSubscriptionRecord,
} = require('../schemas/subscription-schema.cjs');
const {
  normalizeInvoiceRecord,
} = require('../schemas/invoice-schema.cjs');

function serviceError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requiredOwnerId(value) {
  const ownerId = String(value || '').trim();
  if (!ownerId) {
    throw serviceError('Subscription owner is required.', 400, 'OWNER_REQUIRED');
  }
  return ownerId;
}

function createSubscriptionService({ repository, config, clock = () => new Date() }) {
  const planOptions = { freeTrialDays: config.freeTrialDays };

  function nowIso() {
    return isoDate(clock());
  }

  async function recordChange(previous, next, eventType, actor, reason) {
    const event = normalizeHistoryEvent({
      historyId: `HIS-${crypto.randomUUID()}`,
      subscriptionId: next.subscriptionId,
      ownerId: next.ownerId,
      eventType,
      fromPlanCode: previous?.planCode || null,
      toPlanCode: next.planCode,
      fromStatus: previous?.status || null,
      toStatus: next.status,
      reason,
      actor,
      occurredAt: next.updatedAt,
    });
    await repository.appendHistory(event);
    return event;
  }

  function subscriptionView(record, now = clock()) {
    return Object.freeze({
      subscription: record,
      lifecycle: evaluateSubscription(record, now, config.reminderDays),
    });
  }

  async function getStatus(ownerId) {
    const record = await repository.findByOwnerId(requiredOwnerId(ownerId));
    return subscriptionView(record);
  }

  async function activate({
    ownerId,
    planCode,
    startsAt,
    gracePeriodDays = config.gracePeriodDays,
    actor,
    reason = '',
  }) {
    const normalizedOwnerId = requiredOwnerId(ownerId);
    const plan = planByCode(planCode, planOptions);
    if (!plan) {
      throw serviceError('Subscription plan not found.', 400, 'PLAN_INVALID');
    }
    const previous = await repository.findByOwnerId(normalizedOwnerId);
    if (plan.code === 'free_trial' && previous) {
      throw serviceError(
        'The free trial has already been used.',
        409,
        'FREE_TRIAL_ALREADY_USED',
      );
    }
    const updatedAt = nowIso();
    const start = isoDate(startsAt || updatedAt);
    const expiresAt = expiryForPlan(start, plan);
    const next = normalizeSubscriptionRecord(
      {
        subscriptionId:
          previous?.subscriptionId || `SUB-${crypto.randomUUID()}`,
        ownerId: normalizedOwnerId,
        planCode: plan.code,
        status: plan.kind === 'lifetime' ? 'lifetime' : 'active',
        startsAt: start,
        expiresAt,
        graceEndsAt: graceEndForExpiry(expiresAt, gracePeriodDays),
        suspendedAt: null,
        endedAt: null,
        reason,
        version: previous ? Number(previous.version) + 1 : 0,
        createdAt: previous?.createdAt || updatedAt,
        updatedAt,
      },
      planOptions,
    );
    const saved = await repository.saveSubscription(
      normalizedOwnerId,
      previous ? Number(previous.version) : null,
      next,
    );
    await recordChange(previous, saved, 'activated', actor, reason);
    return subscriptionView(saved);
  }

  async function renew({
    ownerId,
    planCode,
    gracePeriodDays = config.gracePeriodDays,
    actor,
    reason = '',
  }) {
    const normalizedOwnerId = requiredOwnerId(ownerId);
    const previous = await repository.findByOwnerId(normalizedOwnerId);
    if (!previous) {
      throw serviceError(
        'Subscription not found.',
        404,
        'SUBSCRIPTION_NOT_FOUND',
      );
    }
    if (previous.planCode === 'lifetime') {
      throw serviceError(
        'Lifetime subscriptions do not require renewal.',
        409,
        'LIFETIME_RENEWAL_NOT_REQUIRED',
      );
    }
    const plan = planByCode(planCode || previous.planCode, planOptions);
    if (!plan || plan.code === 'free_trial') {
      throw serviceError('Renewal plan is invalid.', 400, 'PLAN_INVALID');
    }
    const updatedAt = nowIso();
    const currentLifecycle = evaluateSubscription(
      previous,
      updatedAt,
      config.reminderDays,
    );
    const startsAt =
      currentLifecycle.phase === 'active' && previous.expiresAt
        ? previous.expiresAt
        : updatedAt;
    const expiresAt = expiryForPlan(startsAt, plan);
    const next = normalizeSubscriptionRecord(
      {
        ...previous,
        planCode: plan.code,
        status: plan.kind === 'lifetime' ? 'lifetime' : 'active',
        startsAt,
        expiresAt,
        graceEndsAt: graceEndForExpiry(expiresAt, gracePeriodDays),
        suspendedAt: null,
        endedAt: null,
        reason,
        version: Number(previous.version) + 1,
        updatedAt,
      },
      planOptions,
    );
    const saved = await repository.saveSubscription(
      normalizedOwnerId,
      Number(previous.version),
      next,
    );
    await recordChange(previous, saved, 'renewed', actor, reason);
    return subscriptionView(saved);
  }

  async function assignPlan({
    ownerId,
    planCode,
    startsAt,
    gracePeriodDays = config.gracePeriodDays,
    actor,
    reason = '',
  }) {
    const normalizedOwnerId = requiredOwnerId(ownerId);
    const previous = await repository.findByOwnerId(normalizedOwnerId);
    if (!previous) {
      return activate({
        ownerId: normalizedOwnerId,
        planCode,
        startsAt,
        gracePeriodDays,
        actor,
        reason,
      });
    }
    const plan = planByCode(planCode, planOptions);
    if (!plan || plan.code === 'free_trial') {
      throw serviceError(
        'Assigned plan is invalid.',
        400,
        'PLAN_INVALID',
      );
    }
    const updatedAt = nowIso();
    const start = isoDate(startsAt || updatedAt);
    const expiresAt = expiryForPlan(start, plan);
    const next = normalizeSubscriptionRecord(
      {
        ...previous,
        planCode: plan.code,
        status: plan.kind === 'lifetime' ? 'lifetime' : 'active',
        startsAt: start,
        expiresAt,
        graceEndsAt: graceEndForExpiry(expiresAt, gracePeriodDays),
        suspendedAt: null,
        endedAt: null,
        reason,
        version: Number(previous.version) + 1,
        updatedAt,
      },
      planOptions,
    );
    const saved = await repository.saveSubscription(
      normalizedOwnerId,
      Number(previous.version),
      next,
    );
    await recordChange(previous, saved, 'plan_assigned', actor, reason);
    return subscriptionView(saved);
  }

  async function suspend({ ownerId, actor, reason = '' }) {
    return changeStatus(ownerId, 'suspended', 'suspended', actor, reason);
  }

  async function restore({ ownerId, actor, reason = '' }) {
    const normalizedOwnerId = requiredOwnerId(ownerId);
    const previous = await repository.findByOwnerId(normalizedOwnerId);
    if (!previous) {
      throw serviceError(
        'Subscription not found.',
        404,
        'SUBSCRIPTION_NOT_FOUND',
      );
    }
    if (previous.status !== 'suspended') {
      throw serviceError(
        'Only a suspended subscription can be restored.',
        409,
        'SUBSCRIPTION_NOT_SUSPENDED',
      );
    }
    const updatedAt = nowIso();
    const next = normalizeSubscriptionRecord(
      {
        ...previous,
        status:
          previous.planCode === 'lifetime' ? 'lifetime' : 'active',
        suspendedAt: null,
        reason,
        version: Number(previous.version) + 1,
        updatedAt,
      },
      planOptions,
    );
    const saved = await repository.saveSubscription(
      normalizedOwnerId,
      Number(previous.version),
      next,
    );
    await recordChange(previous, saved, 'restored', actor, reason);
    return subscriptionView(saved);
  }

  async function expire({ ownerId, actor, reason = '' }) {
    return changeStatus(ownerId, 'expired', 'expired', actor, reason, true);
  }

  async function changeStatus(
    ownerId,
    status,
    eventType,
    actor,
    reason,
    endImmediately = false,
  ) {
    const normalizedOwnerId = requiredOwnerId(ownerId);
    const previous = await repository.findByOwnerId(normalizedOwnerId);
    if (!previous) {
      throw serviceError(
        'Subscription not found.',
        404,
        'SUBSCRIPTION_NOT_FOUND',
      );
    }
    const updatedAt = nowIso();
    const next = normalizeSubscriptionRecord(
      {
        ...previous,
        status,
        expiresAt: endImmediately ? updatedAt : previous.expiresAt,
        graceEndsAt: endImmediately ? updatedAt : previous.graceEndsAt,
        suspendedAt: status === 'suspended' ? updatedAt : null,
        endedAt: status === 'expired' ? updatedAt : null,
        reason,
        version: Number(previous.version) + 1,
        updatedAt,
      },
      planOptions,
    );
    const saved = await repository.saveSubscription(
      normalizedOwnerId,
      Number(previous.version),
      next,
    );
    await recordChange(previous, saved, eventType, actor, reason);
    return subscriptionView(saved);
  }

  async function history(ownerId, limit) {
    return repository.listHistory(requiredOwnerId(ownerId), limit);
  }

  async function createInvoice({
    ownerId,
    planCode,
    lineItems,
    discountAmount = 0,
    notes = '',
    status = 'issued',
    dueAt = null,
  }) {
    const normalizedOwnerId = requiredOwnerId(ownerId);
    const subscription = await repository.findByOwnerId(normalizedOwnerId);
    if (!subscription) {
      throw serviceError(
        'Subscription not found.',
        404,
        'SUBSCRIPTION_NOT_FOUND',
      );
    }
    const timestamp = nowIso();
    const suffix = crypto.randomUUID().split('-')[0].toUpperCase();
    const invoice = normalizeInvoiceRecord(
      {
        invoiceId: `INV-${crypto.randomUUID()}`,
        invoiceNumber: `VSK-${timestamp.slice(0, 10).replace(/-/g, '')}-${suffix}`,
        subscriptionId: subscription.subscriptionId,
        ownerId: normalizedOwnerId,
        planCode: planCode || subscription.planCode,
        status,
        currency: config.currency,
        lineItems,
        discountAmount,
        notes,
        issuedAt: timestamp,
        dueAt,
        paidAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      planOptions,
    );
    return repository.createInvoice(invoice);
  }

  async function invoices(ownerId, limit) {
    return repository.listInvoices(requiredOwnerId(ownerId), limit);
  }

  return Object.freeze({
    activate,
    assignPlan,
    createInvoice,
    expire,
    getStatus,
    history,
    invoices,
    renew,
    restore,
    suspend,
  });
}

module.exports = {
  createSubscriptionService,
};
