'use strict';

const express = require('express');
const {
  subscriptionPlans,
} = require('../domain/subscription-plans.cjs');

function customerId(user) {
  return String(user?.id || '').trim();
}

function publicSubscription(record) {
  if (!record) return null;
  return Object.freeze({
    subscriptionId: record.subscriptionId,
    planCode: record.planCode,
    status: record.status,
    startsAt: record.startsAt,
    expiresAt: record.expiresAt,
    graceEndsAt: record.graceEndsAt,
    suspendedAt: record.suspendedAt,
    endedAt: record.endedAt,
    reason: record.reason,
  });
}

function publicHistory(event) {
  return Object.freeze({
    historyId: event.historyId,
    eventType: event.eventType,
    fromPlanCode: event.fromPlanCode,
    toPlanCode: event.toPlanCode,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason,
    actorType: event.actor?.type || 'system',
    occurredAt: event.occurredAt,
  });
}

function publicInvoice(invoice) {
  return Object.freeze({
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    planCode: invoice.planCode,
    status: invoice.status,
    currency: invoice.currency,
    lineItems: invoice.lineItems,
    subtotalAmount: invoice.subtotalAmount,
    discountAmount: invoice.discountAmount,
    totalAmount: invoice.totalAmount,
    notes: invoice.notes,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
  });
}

/**
 * Creates the Phase 5B customer-facing, read-only subscription API.
 */
function createCustomerSubscriptionRouter({
  requireCustomerAuth,
  subscriptionService,
  config,
}) {
  const router = express.Router();

  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(requireCustomerAuth);

  router.get('/me/dashboard', async (request, response) => {
    try {
      const ownerId = customerId(request.user);
      if (!ownerId) {
        return response.status(401).json({ error: 'Customer login required.' });
      }
      const [current, history, invoices] = await Promise.all([
        subscriptionService.getStatus(ownerId),
        subscriptionService.history(ownerId, 100),
        subscriptionService.invoices(ownerId, 100),
      ]);

      return response.json({
        plans: subscriptionPlans({
          freeTrialDays: config.freeTrialDays,
        }),
        current: {
          subscription: publicSubscription(current.subscription),
          lifecycle: current.lifecycle,
        },
        history: history.map(publicHistory),
        invoices: invoices.map(publicInvoice),
      });
    } catch (error) {
      console.error('Customer subscription dashboard error:', error);
      return response
        .status(500)
        .json({ error: 'Unable to load subscription details.' });
    }
  });

  return router;
}

module.exports = {
  createCustomerSubscriptionRouter,
};
