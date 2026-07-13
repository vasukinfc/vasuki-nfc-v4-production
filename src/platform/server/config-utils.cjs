'use strict';

function explicitBoolean(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function booleanWithDefault(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  return explicitBoolean(value);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  booleanWithDefault,
  boundedInteger,
  explicitBoolean,
  positiveNumber,
};
