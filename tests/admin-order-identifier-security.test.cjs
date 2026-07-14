'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isSensitiveIdentifierField,
  maskIdentifier,
  normalizeIdentifier,
  paymentFieldsUnchanged,
  publicFieldPayload,
} = require('../src/admin/client/order-identifier-security.js');

test('identifiers are masked by default helper output', () => {
  const original = 'pay_TEST_IDENTIFIER_1234567890';
  const masked = maskIdentifier(original);

  assert.notEqual(masked, original);
  assert.equal(masked.includes('••••'), true);
  assert.equal(masked.includes('TEST_IDENTIFIER'), false);
});

test('only tracking, Razorpay order, and payment identifiers are classified sensitive', () => {
  assert.equal(isSensitiveIdentifierField('trackingToken'), true);
  assert.equal(isSensitiveIdentifierField('paymentId'), true);
  assert.equal(isSensitiveIdentifierField('razorpayOrderId'), true);
  assert.equal(isSensitiveIdentifierField('localOrderId'), false);
  assert.equal(isSensitiveIdentifierField('paymentStatus'), false);
  assert.equal(isSensitiveIdentifierField('fulfillmentStatus'), false);
});

test('public field payload exposes masked value without mutating original backend value', () => {
  const original = 'order_TEST_IDENTIFIER_1234567890';
  const payload = publicFieldPayload('razorpayOrderId', original);

  assert.equal(payload.isSensitive, true);
  assert.equal(payload.maskedValue, maskIdentifier(original));
  assert.equal(normalizeIdentifier(original), original);
});

test('reveal and copy flows can use the underlying identifier only after intentional action', () => {
  const original = 'vsk_track_TEST_IDENTIFIER_1234567890';
  const displayedBeforeReveal = maskIdentifier(original);
  const revealedAfterAction = normalizeIdentifier(original);
  const copiedAfterAction = normalizeIdentifier(original);

  assert.notEqual(displayedBeforeReveal, original);
  assert.equal(revealedAfterAction, original);
  assert.equal(copiedAfterAction, original);
});

test('payment fields remain unchanged when only fulfillment fields change', () => {
  const before = {
    localOrderId: 'LOCAL-123',
    razorpayOrderId: 'order_123',
    paymentId: 'pay_123',
    paymentStatus: 'SUCCESS',
    verifiedAt: '2026-07-13T00:00:00.000Z',
    trackingToken: 'vsk_track_123',
    fulfillmentStatus: 'CONFIRMED',
  };
  const after = {
    ...before,
    orderStatus: 'PROCESSING',
    fulfillmentStatus: 'PROCESSING',
    adminStatusNote: 'QA status update',
  };

  assert.equal(paymentFieldsUnchanged(before, after), true);
});

test('payment field mutation is detected', () => {
  const before = {
    localOrderId: 'LOCAL-123',
    razorpayOrderId: 'order_123',
    paymentId: 'pay_123',
    paymentStatus: 'SUCCESS',
    verifiedAt: '2026-07-13T00:00:00.000Z',
    trackingToken: 'vsk_track_123',
  };
  const after = {
    ...before,
    paymentId: 'pay_changed',
  };

  assert.equal(paymentFieldsUnchanged(before, after), false);
});
