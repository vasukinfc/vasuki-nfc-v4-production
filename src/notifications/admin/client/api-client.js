const API_BASE = '/api/admin/v1/notifications';

export class AdminNotificationApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AdminNotificationApiError';
    this.status = status;
  }
}

async function request(path = '', options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminNotificationApiError(
      payload.error || 'Admin notification request failed.',
      response.status,
    );
  }
  return payload;
}

export function listAdminNotifications(unreadOnly = false) {
  return request(unreadOnly ? '?unread=true' : '');
}

export function markAdminNotificationRead(notificationId) {
  return request(`/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
  });
}

export function markAllAdminNotificationsRead() {
  return request('/read-all', { method: 'POST' });
}
