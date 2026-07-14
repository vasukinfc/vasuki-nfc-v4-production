/**
 * Small API client for the protected profile editor.
 * Customer authentication continues to use the website's existing bearer token.
 */

const API_BASE = '/api/profile-editor';
const TOKEN_KEY = 'vasukiAuthToken';

export class ProfileApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ProfileApiError';
    this.status = status;
    this.details = details;
  }
}

function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getAuthToken();

  if (!token) {
    throw new ProfileApiError('Please sign in to edit your profile.', 401);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    },
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ProfileApiError(
      payload.error || payload.message || 'The profile request could not be completed.',
      response.status,
      payload.details || (payload.fields ? { fields: payload.fields } : null)
    );
  }

  return payload;
}

export function loadProfileDraft() {
  return request('/profile');
}

export function saveProfileDraft(profile, version) {
  return request('/profile', {
    method: 'PUT',
    body: JSON.stringify({ profile, version })
  });
}

export function loadPublicationStatus() {
  return request('/publication');
}

export function publishProfileDraft(slug, version) {
  return request('/publish', {
    method: 'POST',
    body: JSON.stringify({ slug, version })
  });
}

export function clearCustomerSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem('vasukiUser');
}
