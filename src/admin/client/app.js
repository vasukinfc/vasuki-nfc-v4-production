/**
 * Protected Admin CRM shell controller.
 */

import {
  AdminApiError,
  getCurrentAdmin,
  logoutAdmin,
} from './admin-session.js';

const displayName = document.getElementById('adminDisplayName');
const role = document.getElementById('adminRole');
const identity = document.getElementById('adminIdentity');
const logoutButton = document.getElementById('adminLogoutButton');
const optionalFeatureLinks = [
  ...document.querySelectorAll('[data-platform-feature]'),
];

function redirectToLogin() {
  window.location.replace('/admin/login');
}

async function loadAdminSession() {
  try {
    const { admin } = await getCurrentAdmin();
    if (displayName) displayName.textContent = admin.displayName;
    if (role) role.textContent = admin.role.replace('_', ' ');
    if (identity) identity.textContent = admin.email;
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) {
      redirectToLogin();
      return;
    }
    if (identity) {
      identity.textContent =
        error.message || 'Unable to load the administrator session.';
    }
  }
}

async function loadFeatureFlags() {
  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const data = await response.json();
    const features =
      data?.features && typeof data.features === 'object'
        ? data.features
        : {};
    optionalFeatureLinks.forEach((link) => {
      link.hidden = features[link.dataset.platformFeature] !== true;
    });
  } catch {
    // Links remain hidden when feature status cannot be verified.
  }
}

logoutButton?.addEventListener('click', async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = 'Logging out…';

  try {
    await logoutAdmin();
  } catch {
    // The server also protects the shell, so returning to login is safe even
    // when an already-expired session cannot be revoked again.
  } finally {
    redirectToLogin();
  }
});

loadAdminSession();
loadFeatureFlags();
