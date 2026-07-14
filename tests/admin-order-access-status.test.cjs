'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  createAdminOrderRouter,
} = require('../src/admin/server/routes/order-routes.cjs');
const {
  createAdminOrderService,
} = require('../src/admin/server/services/admin-order-service.cjs');

const BASE_ORDER = Object.freeze({
  localOrderId: 'LOCAL-123',
  razorpayOrderId: 'order_123',
  paymentId: 'pay_123',
  paymentStatus: 'SUCCESS',
  verifiedAt: '2026-07-13T00:00:00.000Z',
  trackingToken: 'vsk_track_123',
  fulfillmentStatus: 'CONFIRMED',
});

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

test('unauthorized users cannot access Admin Order Details', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/v1/orders', createAdminOrderRouter({
    authenticateAdmin(_request, response) {
      response.status(401).json({ error: 'Login required' });
    },
    authorizeAdmin(_request, _response, next) {
      next();
    },
    adminOrderService: {
      async list() {
        throw new Error('should not list orders');
      },
      async details() {
        throw new Error('should not load order details');
      },
      async updateStatus() {
        throw new Error('should not update orders');
      },
    },
  }));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/v1/orders/LOCAL-123`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('fulfillment update still works without changing payment fields', async () => {
  let updatedOrder;
  const service = createAdminOrderService({
    repository: {
      updateOrderStatus(identifier, patch) {
        assert.equal(identifier, 'LOCAL-123');
        assert.deepEqual(patch, {
          orderStatus: 'PROCESSING',
          adminStatusNote: 'QA fulfillment update',
        });
        updatedOrder = {
          ...BASE_ORDER,
          orderStatus: patch.orderStatus,
          fulfillmentStatus: patch.orderStatus,
          adminStatusNote: patch.adminStatusNote,
        };
        return updatedOrder;
      },
    },
  });

  const result = await service.updateStatus('LOCAL-123', {
    orderStatus: 'processing',
    adminStatusNote: 'QA fulfillment update',
  });

  assert.equal(result.orderStatus, 'PROCESSING');
  assert.equal(result.fulfillmentStatus, 'PROCESSING');
  assert.equal(result.localOrderId, BASE_ORDER.localOrderId);
  assert.equal(result.razorpayOrderId, BASE_ORDER.razorpayOrderId);
  assert.equal(result.paymentId, BASE_ORDER.paymentId);
  assert.equal(result.paymentStatus, BASE_ORDER.paymentStatus);
  assert.equal(result.verifiedAt, BASE_ORDER.verifiedAt);
  assert.equal(result.trackingToken, BASE_ORDER.trackingToken);
});
