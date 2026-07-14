export class AdminCrmApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminCrmApiError';
    this.status = status;
  }
}

async function request(base, path = '', options = {}) {
  const response = await fetch(`${base}${path}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminCrmApiError(payload.error || 'Admin CRM request failed.', response.status);
  }
  return payload;
}

function toQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listCustomers(filters) {
  return request('/api/admin/v1/customers', toQuery(filters));
}

export function loadCustomer(customerId) {
  return request('/api/admin/v1/customers', `/${encodeURIComponent(customerId)}`);
}

export function createCustomer(input) {
  return request('/api/admin/v1/customers', '', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCustomer(customerId, input) {
  return request('/api/admin/v1/customers', `/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function archiveCustomer(customerId, input) {
  return request('/api/admin/v1/customers', `/${encodeURIComponent(customerId)}`, {
    method: 'DELETE',
    body: JSON.stringify(input),
  });
}

export function listOrders(filters) {
  return request('/api/admin/v1/orders', toQuery(filters));
}

export function loadOrder(orderId) {
  return request('/api/admin/v1/orders', `/${encodeURIComponent(orderId)}`);
}

export function updateOrderStatus(orderId, input) {
  return request('/api/admin/v1/orders', `/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
