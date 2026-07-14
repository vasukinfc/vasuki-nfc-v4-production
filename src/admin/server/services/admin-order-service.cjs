'use strict';

const ORDER_STATUSES = new Set([
  'CREATED',
  'CONFIRMED',
  'PROCESSING',
  'IN_DESIGN',
  'PRINTED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function validateStatusInput(input = {}) {
  const orderStatus = String(input.orderStatus || '').trim().toUpperCase();
  if (!ORDER_STATUSES.has(orderStatus)) {
    const error = new Error('Unsupported order status.');
    error.status = 400;
    throw error;
  }
  return {
    orderStatus,
    adminStatusNote: String(input.adminStatusNote || '').trim().slice(0, 1000),
  };
}

function createAdminOrderService({ repository }) {
  return Object.freeze({
    list(filters) {
      return repository.listOrders(filters);
    },
    async details(identifier) {
      const order = await repository.getOrder(identifier);
      if (!order) throw notFound('Order was not found.');
      return order;
    },
    async updateStatus(identifier, input) {
      const order = await repository.updateOrderStatus(
        identifier,
        validateStatusInput(input),
      );
      if (!order) throw notFound('Order was not found.');
      return order;
    },
  });
}

module.exports = {
  createAdminOrderService,
  ORDER_STATUSES,
};
