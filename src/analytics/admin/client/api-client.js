const API_BASE = '/api/admin/v1/analytics';

export class AdminAnalyticsApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminAnalyticsApiError';
    this.status = status;
  }
}

async function jsonRequest(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminAnalyticsApiError(
      payload.error || 'Admin analytics request failed.',
      response.status,
    );
  }
  return payload;
}

export function getAdminIdentity() {
  return jsonRequest('/api/admin/v1/auth/me');
}

export function getAdminAnalytics(filters = {}) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return jsonRequest(`${API_BASE}/dashboard${suffix}`);
}
