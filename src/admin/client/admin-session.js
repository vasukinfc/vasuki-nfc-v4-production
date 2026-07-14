/**
 * Same-origin Admin CRM authentication client.
 *
 * The browser sends the HttpOnly session cookie automatically. No session
 * credential is exposed to this module or stored in localStorage.
 */

const AUTH_API_BASE = '/api/admin/v1/auth';

export class AdminApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${AUTH_API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminApiError(
      data.error || 'Admin request failed.',
      response.status,
    );
  }

  return data;
}

export function loginAdmin(credentials) {
  return request('/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export function getCurrentAdmin() {
  return request('/me');
}

export function logoutAdmin() {
  return request('/logout', { method: 'POST' });
}
