'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(value) {
  const date = validDate(value);
  if (!date) throw new TypeError('A valid date is required.');
  return date.toISOString();
}

function addUtcMonths(value, months) {
  const source = validDate(value);
  if (!source) throw new TypeError('A valid start date is required.');
  const result = new Date(source.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function addDays(value, days) {
  const result = validDate(value);
  if (!result) throw new TypeError('A valid start date is required.');
  result.setUTCDate(result.getUTCDate() + Number(days));
  return result;
}

/**
 * Adds a plan duration using calendar months and years, avoiding fixed
 * 30/365-day approximations.
 */
function expiryForPlan(startAt, plan) {
  if (!plan || plan.kind === 'lifetime') return null;
  const { unit, value } = plan.duration || {};
  if (unit === 'days') return addDays(startAt, value).toISOString();
  if (unit === 'months') return addUtcMonths(startAt, value).toISOString();
  if (unit === 'years') return addUtcMonths(startAt, value * 12).toISOString();
  throw new TypeError('Unsupported subscription plan duration.');
}

function graceEndForExpiry(expiresAt, gracePeriodDays) {
  if (!expiresAt) return null;
  return addDays(expiresAt, gracePeriodDays).toISOString();
}

function daysRemaining(target, now) {
  const targetDate = validDate(target);
  const nowDate = validDate(now);
  if (!targetDate || !nowDate) return 0;
  return Math.max(0, Math.ceil((targetDate - nowDate) / DAY_MS));
}

/**
 * Computes the effective state without mutating the stored subscription.
 */
function evaluateSubscription(subscription, now = new Date(), reminderDays = [7, 3, 1]) {
  if (!subscription) {
    return Object.freeze({
      status: 'none',
      phase: 'none',
      badge: 'No subscription',
      remainingDays: 0,
      graceRemainingDays: 0,
      inGracePeriod: false,
      reminderDue: false,
      access: Object.freeze({ allowed: false, reason: 'subscription_required' }),
    });
  }

  if (subscription.status === 'suspended') {
    return Object.freeze({
      status: 'suspended',
      phase: 'suspended',
      badge: 'Suspended',
      remainingDays: 0,
      graceRemainingDays: 0,
      inGracePeriod: false,
      reminderDue: false,
      access: Object.freeze({ allowed: false, reason: 'subscription_suspended' }),
    });
  }

  if (subscription.status === 'lifetime') {
    return Object.freeze({
      status: 'lifetime',
      phase: 'lifetime',
      badge: 'Lifetime',
      remainingDays: null,
      graceRemainingDays: 0,
      inGracePeriod: false,
      reminderDue: false,
      access: Object.freeze({ allowed: true, reason: 'lifetime' }),
    });
  }

  const nowDate = validDate(now) || new Date();
  const expiry = validDate(subscription.expiresAt);
  const graceEnd = validDate(subscription.graceEndsAt);

  if (expiry && nowDate < expiry) {
    const remainingDays = daysRemaining(expiry, nowDate);
    return Object.freeze({
      status: 'active',
      phase: 'active',
      badge: subscription.planCode === 'free_trial' ? 'Free Trial' : 'Active',
      remainingDays,
      graceRemainingDays: 0,
      inGracePeriod: false,
      reminderDue: reminderDays.includes(remainingDays),
      access: Object.freeze({ allowed: true, reason: 'subscription_active' }),
    });
  }

  if (graceEnd && nowDate < graceEnd) {
    return Object.freeze({
      status: 'active',
      phase: 'grace',
      badge: 'Grace Period',
      remainingDays: 0,
      graceRemainingDays: daysRemaining(graceEnd, nowDate),
      inGracePeriod: true,
      reminderDue: true,
      access: Object.freeze({ allowed: true, reason: 'grace_period' }),
    });
  }

  return Object.freeze({
    status: 'expired',
    phase: 'expired',
    badge: 'Expired',
    remainingDays: 0,
    graceRemainingDays: 0,
    inGracePeriod: false,
    reminderDue: false,
    access: Object.freeze({ allowed: false, reason: 'subscription_expired' }),
  });
}

module.exports = {
  addDays,
  evaluateSubscription,
  expiryForPlan,
  graceEndForExpiry,
  isoDate,
};
