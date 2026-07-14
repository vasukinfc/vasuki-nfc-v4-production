'use strict';

const ANALYTICS_EVENT_TYPES = Object.freeze([
  'card_view',
  'contact_save',
  'whatsapp_click',
  'call_click',
  'email_click',
  'website_click',
  'maps_click',
  'social_click',
  'product_view',
  'service_view',
  'pdf_open',
  'video_open',
  'gallery_open',
  'payment_qr_open',
  'share',
]);

const VISIT_SOURCES = Object.freeze(['direct', 'nfc', 'qr']);
const DEVICE_TYPES = Object.freeze(['mobile', 'desktop', 'unknown']);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

function cleanIdentifier(value, field, maximum = 160) {
  const result = String(value || '').trim();
  if (!result || result.length > maximum) {
    throw new TypeError(`${field} is required.`);
  }
  return result;
}

function normalizePublicAnalyticsInput(input) {
  const source =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const eventType = String(source.eventType || '').trim().toLowerCase();
  if (!ANALYTICS_EVENT_TYPES.includes(eventType)) {
    throw new TypeError('Unsupported analytics event.');
  }
  const visitSource = String(source.source || 'direct').trim().toLowerCase();
  if (!VISIT_SOURCES.includes(visitSource)) {
    throw new TypeError('Unsupported visit source.');
  }
  const deviceType = String(source.deviceType || 'unknown')
    .trim()
    .toLowerCase();
  if (!DEVICE_TYPES.includes(deviceType)) {
    throw new TypeError('Unsupported device type.');
  }

  return Object.freeze({
    eventType,
    source: eventType === 'card_view' ? visitSource : null,
    visitorId: cleanIdentifier(source.visitorId, 'visitorId'),
    sessionId: cleanIdentifier(source.sessionId, 'sessionId'),
    itemId: source.itemId
      ? cleanIdentifier(source.itemId, 'itemId', 120)
      : null,
    itemLabel: source.itemLabel
      ? cleanIdentifier(source.itemLabel, 'itemLabel', 160)
      : null,
    deviceType,
  });
}

function normalizeAnalyticsEvent(input) {
  const cardSlug = String(input?.cardSlug || '').trim().toLowerCase();
  if (!SLUG_PATTERN.test(cardSlug)) {
    throw new TypeError('A valid card slug is required.');
  }
  if (!ANALYTICS_EVENT_TYPES.includes(input?.eventType)) {
    throw new TypeError('A valid analytics event type is required.');
  }
  if (
    input.source !== null &&
    input.source !== undefined &&
    !VISIT_SOURCES.includes(input.source)
  ) {
    throw new TypeError('A valid visit source is required.');
  }
  const deviceType = String(input?.deviceType || 'unknown').toLowerCase();
  if (!DEVICE_TYPES.includes(deviceType)) {
    throw new TypeError('A valid device type is required.');
  }
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new TypeError('A valid analytics event date is required.');
  }

  return Object.freeze({
    eventId: cleanIdentifier(input.eventId, 'eventId'),
    ownerId: cleanIdentifier(input.ownerId, 'ownerId'),
    cardSlug,
    eventType: input.eventType,
    source: input.eventType === 'card_view' ? input.source || 'direct' : null,
    visitorKey: cleanIdentifier(input.visitorKey, 'visitorKey'),
    sessionKey: cleanIdentifier(input.sessionKey, 'sessionKey'),
    itemId: input.itemId ? cleanIdentifier(input.itemId, 'itemId', 120) : null,
    itemLabel: input.itemLabel
      ? cleanIdentifier(input.itemLabel, 'itemLabel', 160)
      : null,
    deviceType,
    occurredAt: occurredAt.toISOString(),
  });
}

module.exports = {
  ANALYTICS_EVENT_TYPES,
  DEVICE_TYPES,
  VISIT_SOURCES,
  normalizeAnalyticsEvent,
  normalizePublicAnalyticsInput,
};
