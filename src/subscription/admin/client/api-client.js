/**
 * Same-origin API client for the authenticated Admin Subscription Manager.
 */

const API_BASE = '/api/admin/v1/subscriptions';

export class AdminSubscriptionApiError extends Error {
  constructor(message, status, code = '') {
    super(message);
    this.name = 'AdminSubscriptionApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path = '', options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
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
    throw new AdminSubscriptionApiError(
      payload.error || 'Admin subscription request failed.',
      response.status,
      payload.code,
    );
  }
  return payload;
}

export function listSubscriptions(filters = {}) {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return request(query ? `?${query}` : '');
}

export function loadSubscription(ownerId) {
  return request(`/${encodeURIComponent(ownerId)}`);
}

export function runSubscriptionAction(ownerId, action, input) {
  return request(
    `/${encodeURIComponent(ownerId)}/actions/${encodeURIComponent(action)}`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
