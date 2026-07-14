/**
 * Admin login page controller.
 *
 * Credentials are sent only to the same-origin admin authentication API and
 * are never written to browser storage.
 */

import {
  AdminApiError,
  getCurrentAdmin,
  loginAdmin,
} from './admin-session.js';

const loginForm = document.getElementById('adminLoginForm');
const loginButton = document.getElementById('adminLoginButton');
const message = document.getElementById('adminAuthMessage');
const currentYear = document.getElementById('adminCurrentYear');

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

async function redirectExistingSession() {
  try {
    await getCurrentAdmin();
    window.location.replace('/admin');
  } catch (error) {
    if (!(error instanceof AdminApiError) || error.status !== 401) {
      if (message) {
        message.textContent =
          error.message || 'Admin authentication is temporarily unavailable.';
        message.dataset.state = 'error';
      }
    }
  }
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = 'Signing in…';
  }
  if (message) {
    message.textContent = '';
    message.dataset.state = '';
  }

  try {
    await loginAdmin({ email, password });
    loginForm.reset();
    window.location.replace('/admin');
  } catch (error) {
    if (message) {
      message.textContent =
        error.message || 'Unable to sign in. Please try again.';
      message.dataset.state = 'error';
    }
  } finally {
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) passwordInput.value = '';
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = 'Sign in';
    }
  }
});

redirectExistingSession();
