'use strict';

const express = require('express');

function safeSubscription(record) {
  if (!record) return null;
  return {
    subscriptionId: record.subscriptionId,
    ownerId: record.ownerId,
    planCode: record.planCode,
    status: record.status,
    startsAt: record.startsAt,
    expiresAt: record.expiresAt,
    graceEndsAt: record.graceEndsAt,
    suspendedAt: record.suspendedAt,
    endedAt: record.endedAt,
    reason: record.reason,
    version: record.version,
    updatedAt: record.updatedAt,
  };
}

function safeHistory(event) {
  return {
    historyId: event.historyId,
    eventType: event.eventType,
    fromPlanCode: event.fromPlanCode,
    toPlanCode: event.toPlanCode,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason,
    actor: event.actor,
    occurredAt: event.occurredAt,
  };
}

function safeInvoice(invoice) {
  return {
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    planCode: invoice.planCode,
    status: invoice.status,
    currency: invoice.currency,
    subtotalAmount: invoice.subtotalAmount,
    discountAmount: invoice.discountAmount,
    totalAmount: invoice.totalAmount,
    notes: invoice.notes,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
  };
}

function safeRow(row) {
  return {
    customer: row.customer,
    subscription: safeSubscription(row.subscription),
    lifecycle: row.lifecycle,
  };
}

function sendError(response, error) {
  const status = Number(error.status) || 500;
  response.status(status).json({
    error:
      status >= 500
        ? 'Unable to process the subscription request.'
        : error.message,
    code: error.code,
  });
}

/**
 * Creates authenticated Admin CRM subscription routes.
 */
function createAdminSubscriptionRouter({
  authenticateAdmin,
  authorizeAdmin,
  adminSubscriptionService,
}) {
  const router = express.Router();
  router.use((request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    next();
  });
  router.use(authenticateAdmin, authorizeAdmin);

  router.get('/', async (request, response) => {
    try {
      const result = await adminSubscriptionService.list(request.query);
      response.json({
        plans: result.plans,
        rows: result.rows.map(safeRow),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/:ownerId', async (request, response) => {
    try {
      const result = await adminSubscriptionService.details(
        request.params.ownerId,
      );
      response.json({
        plans: result.plans,
        ...safeRow(result),
        history: result.history.map(safeHistory),
        invoices: result.invoices.map(safeInvoice),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/:ownerId/actions/:action', async (request, response) => {
    try {
      const result = await adminSubscriptionService.action(
        request.params.ownerId,
        request.params.action,
        request.body || {},
        request.admin,
      );
      response.json({
        plans: result.plans,
        ...safeRow(result),
        history: result.history.map(safeHistory),
        invoices: result.invoices.map(safeInvoice),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

module.exports = {
  createAdminSubscriptionRouter,
};
