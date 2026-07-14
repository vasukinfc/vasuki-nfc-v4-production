'use strict';

const CUSTOMER_STATUSES = new Set(['active', 'pending', 'suspended', 'archived']);

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function cleanPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function validateCustomerInput(input = {}, { partial = false } = {}) {
  const output = {};
  if (!partial || Object.hasOwn(input, 'fullName')) {
    const fullName = String(input.fullName || '').trim().slice(0, 120);
    if (!partial && fullName.length < 2) {
      const error = new Error('Customer name is required.');
      error.status = 400;
      throw error;
    }
    if (fullName) output.fullName = fullName;
  }
  if (Object.hasOwn(input, 'email')) {
    const email = normalizeEmail(input.email).slice(0, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const error = new Error('Enter a valid customer email address.');
      error.status = 400;
      throw error;
    }
    output.email = email;
  }
  if (!partial || Object.hasOwn(input, 'mobile')) {
    const mobile = cleanPhone(input.mobile).slice(0, 15);
    if (!partial && !/^[6-9]\d{9}$/.test(mobile)) {
      const error = new Error('Enter a valid 10 digit customer mobile number.');
      error.status = 400;
      throw error;
    }
    if (mobile) output.mobile = mobile;
  }
  if (Object.hasOwn(input, 'status')) {
    const status = String(input.status || '').trim().toLowerCase();
    if (!CUSTOMER_STATUSES.has(status)) {
      const error = new Error('Unsupported customer status.');
      error.status = 400;
      throw error;
    }
    output.status = status;
  }
  if (Object.hasOwn(input, 'adminNotes')) {
    output.adminNotes = String(input.adminNotes || '').trim().slice(0, 1000);
  }
  return output;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function createAdminCustomerService({ repository }) {
  return Object.freeze({
    list(filters) {
      return repository.listCustomers(filters);
    },
    async details(customerId) {
      const customer = await repository.getCustomer(customerId);
      if (!customer) throw notFound('Customer was not found.');
      const orders = await repository.listOrders({ search: customer.mobile || customer.email });
      return { customer, orders };
    },
    create(input) {
      return repository.createCustomer(validateCustomerInput(input));
    },
    async update(customerId, input) {
      const customer = await repository.updateCustomer(
        customerId,
        validateCustomerInput(input, { partial: true }),
      );
      if (!customer) throw notFound('Customer was not found.');
      return customer;
    },
    async archive(customerId, input = {}) {
      const customer = await repository.updateCustomer(customerId, {
        status: 'archived',
        adminNotes: String(input.adminNotes || '').trim().slice(0, 1000),
      });
      if (!customer) throw notFound('Customer was not found.');
      return customer;
    },
  });
}

module.exports = {
  createAdminCustomerService,
};
