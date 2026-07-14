(function orderIdentifierSecurityFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdminOrderIdentifierSecurity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOrderIdentifierSecurity() {
  'use strict';

  const SENSITIVE_IDENTIFIER_FIELDS = new Set([
    'trackingToken',
    'paymentId',
    'razorpayOrderId',
  ]);

  const PROTECTED_PAYMENT_FIELDS = [
    'localOrderId',
    'razorpayOrderId',
    'paymentId',
    'paymentStatus',
    'verifiedAt',
    'trackingToken',
  ];

  function normalizeIdentifier(value = '') {
    return String(value || '').trim();
  }

  function maskIdentifier(value = '') {
    const text = normalizeIdentifier(value);
    if (!text) return '—';
    if (text.length <= 8) return '••••';
    const prefixLength = Math.min(6, Math.max(2, Math.floor(text.length / 4)));
    const suffixLength = Math.min(4, Math.max(2, Math.floor(text.length / 5)));
    return `${text.slice(0, prefixLength)}••••${text.slice(-suffixLength)}`;
  }

  function isSensitiveIdentifierField(fieldName = '') {
    return SENSITIVE_IDENTIFIER_FIELDS.has(String(fieldName || ''));
  }

  function paymentFieldsUnchanged(before = {}, after = {}) {
    return PROTECTED_PAYMENT_FIELDS.every((field) =>
      normalizeIdentifier(before[field]) === normalizeIdentifier(after[field]));
  }

  function publicFieldPayload(fieldName, value) {
    const original = normalizeIdentifier(value);
    return Object.freeze({
      fieldName,
      hasValue: Boolean(original),
      maskedValue: maskIdentifier(original),
      isSensitive: isSensitiveIdentifierField(fieldName),
    });
  }

  return Object.freeze({
    PROTECTED_PAYMENT_FIELDS,
    SENSITIVE_IDENTIFIER_FIELDS,
    isSensitiveIdentifierField,
    maskIdentifier,
    normalizeIdentifier,
    paymentFieldsUnchanged,
    publicFieldPayload,
  });
}));
