'use strict';

const { planByCode } = require('../domain/subscription-plans.cjs');
const { isoDate } = require('../domain/subscription-lifecycle.cjs');

const INVOICE_STATUSES = Object.freeze(['draft', 'issued', 'paid', 'void']);

function identifier(value, field) {
  const result = String(value || '').trim();
  if (!result || result.length > 120) {
    throw new TypeError(`${field} is required.`);
  }
  return result;
}

function minorAmount(value, field) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0) {
    throw new TypeError(`${field} must be a non-negative minor-unit amount.`);
  }
  return amount;
}

function normalizeLineItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    throw new TypeError('Invoice line items are required.');
  }
  return Object.freeze(
    items.map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitAmount = minorAmount(item.unitAmount, 'unitAmount');
      return Object.freeze({
        label: identifier(item.label, 'line item label').slice(0, 160),
        quantity,
        unitAmount,
        totalAmount: unitAmount * quantity,
      });
    }),
  );
}

/**
 * Invoice amounts use minor currency units (for INR, paise). This model does
 * not create or verify payments.
 */
function normalizeInvoiceRecord(input, planOptions) {
  const plan = planByCode(input?.planCode, planOptions);
  if (!plan) throw new TypeError('A valid invoice plan is required.');
  const status = String(input?.status || 'issued').trim().toLowerCase();
  if (!INVOICE_STATUSES.includes(status)) {
    throw new TypeError('A valid invoice status is required.');
  }
  const lineItems = normalizeLineItems(input.lineItems);
  const subtotalAmount = lineItems.reduce(
    (total, item) => total + item.totalAmount,
    0,
  );
  const discountAmount = minorAmount(
    input.discountAmount || 0,
    'discountAmount',
  );
  if (discountAmount > subtotalAmount) {
    throw new TypeError('Invoice discount cannot exceed its subtotal.');
  }

  return Object.freeze({
    invoiceId: identifier(input.invoiceId, 'invoiceId'),
    invoiceNumber: identifier(input.invoiceNumber, 'invoiceNumber'),
    subscriptionId: identifier(input.subscriptionId, 'subscriptionId'),
    ownerId: identifier(input.ownerId, 'ownerId'),
    planCode: plan.code,
    status,
    currency: String(input.currency || 'INR').trim().toUpperCase().slice(0, 3),
    lineItems,
    subtotalAmount,
    discountAmount,
    totalAmount: subtotalAmount - discountAmount,
    notes: String(input.notes || '').trim().slice(0, 500),
    issuedAt: isoDate(input.issuedAt),
    dueAt: input.dueAt ? isoDate(input.dueAt) : null,
    paidAt: input.paidAt ? isoDate(input.paidAt) : null,
    createdAt: isoDate(input.createdAt),
    updatedAt: isoDate(input.updatedAt),
  });
}

module.exports = {
  INVOICE_STATUSES,
  normalizeInvoiceRecord,
};
