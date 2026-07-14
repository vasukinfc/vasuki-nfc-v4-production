/**
 * Customer Dashboard controller.
 *
 * This module reuses the existing customer bearer token and APIs. It does not
 * change authentication, require MongoDB, or introduce a second source of
 * customer data.
 */

const AUTH_TOKEN_KEY = 'vasukiAuthToken';
const USER_STORAGE_KEY = 'vasukiUser';
const LOGIN_RETURN_KEY = 'vasukiReturnAfterLogin';

const elements = {
  loading: document.getElementById('dashboardLoading'),
  content: document.getElementById('dashboardContent'),
  error: document.getElementById('dashboardError'),
  errorMessage: document.getElementById('dashboardErrorMessage'),
  retryButton: document.getElementById('retryButton'),
  refreshButton: document.getElementById('refreshButton'),
  logoutButton: document.getElementById('logoutButton'),
  avatar: document.getElementById('customerAvatar'),
  welcomeTitle: document.getElementById('welcomeTitle'),
  customerContact: document.getElementById('customerContact'),
  totalOrders: document.getElementById('totalOrders'),
  totalSpent: document.getElementById('totalSpent'),
  activeOrders: document.getElementById('activeOrders'),
  latestStatus: document.getElementById('latestStatus'),
  ordersList: document.getElementById('ordersList'),
  ordersEmpty: document.getElementById('ordersEmpty'),
  accountName: document.getElementById('accountName'),
  accountEmail: document.getElementById('accountEmail'),
  accountMobile: document.getElementById('accountMobile'),
  referralCode: document.getElementById('referralCode'),
  copyReferralButton: document.getElementById('copyReferralButton'),
  shareReferralButton: document.getElementById('shareReferralButton'),
  referralFeedback: document.getElementById('referralFeedback'),
  currentYear: document.getElementById('currentYear'),
};
const optionalFeaturePanels = [
  ...document.querySelectorAll('[data-platform-feature]'),
];

class CustomerApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CustomerApiError';
    this.status = status;
  }
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function clearCustomerSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(LOGIN_RETURN_KEY);
}

function redirectToLogin() {
  localStorage.setItem(LOGIN_RETURN_KEY, '/dashboard.html');
  window.location.replace('/login.html');
}

async function customerRequest(path) {
  const token = getAuthToken();
  if (!token) {
    throw new CustomerApiError('Customer login required.', 401);
  }

  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new CustomerApiError(
      data.error || 'Unable to load account information.',
      response.status,
    );
  }
  return data;
}

async function loadFeatureFlags() {
  try {
    const response = await fetch('/api/health', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return {};
    const data = await response.json();
    return data?.features && typeof data.features === 'object'
      ? data.features
      : {};
  } catch {
    return {};
  }
}

function applyFeatureFlags(features) {
  optionalFeaturePanels.forEach((panel) => {
    panel.hidden = features[panel.dataset.platformFeature] !== true;
  });
}

function formatCurrency(value) {
  const amount = Number(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function normalizedStatus(value) {
  return String(value || 'processing')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ');
}

function isActiveOrder(order) {
  const status = normalizedStatus(order.status);
  return !['delivered', 'completed', 'cancelled', 'failed'].includes(status);
}

function orderItemSummary(items) {
  if (!Array.isArray(items) || !items.length) return 'Order details';

  return items
    .slice(0, 2)
    .map((item) => {
      const name = String(item?.name || 'Item');
      const quantity = Math.max(1, Number(item?.qty) || 1);
      return `${name} × ${quantity}`;
    })
    .join(', ');
}

function createOrderElement(order) {
  const article = document.createElement('article');
  article.className = 'dashboard-order';

  const details = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = String(order.token || 'Order');
  const description = document.createElement('p');
  description.textContent = `${formatDate(order.createdAt)} · ${orderItemSummary(order.items)}`;
  details.append(title, description);

  const amount = document.createElement('div');
  amount.className = 'dashboard-order-amount';
  const total = document.createElement('strong');
  total.textContent = formatCurrency(order.total);
  const status = document.createElement('span');
  const statusText = normalizedStatus(order.status);
  status.className = 'dashboard-status';
  status.dataset.status = statusText;
  status.textContent = statusText;
  amount.append(total, status);

  const trackLink = document.createElement('a');
  trackLink.className = 'dashboard-order-link';
  trackLink.textContent = 'Track order';
  trackLink.href = `/track-order.html?token=${encodeURIComponent(
    String(order.trackingToken || order.token || ''),
  )}`;

  article.append(details, amount, trackLink);
  return article;
}

function renderOrders(orders) {
  elements.ordersList.replaceChildren();
  elements.ordersEmpty.hidden = orders.length > 0;

  orders.forEach((order) => {
    elements.ordersList.append(createOrderElement(order));
  });
}

function referralMessage(user) {
  const code = String(user.referralCode || '').trim().toUpperCase();
  const link = code
    ? `https://vasukinfc.in/?ref=${encodeURIComponent(code)}#collection`
    : 'https://vasukinfc.in/';

  return [
    'I recommend VASUKI NFC smart business cards.',
    '',
    `Website: ${link}`,
    `Referral Code: ${code}`,
    '',
    'Use this code at checkout. Eligible cashback is processed after payment verification.',
  ].join('\n');
}

function renderReferral(user) {
  const code = String(user.referralCode || '').trim().toUpperCase();
  elements.referralCode.textContent = code || 'Not available';
  elements.copyReferralButton.disabled = !code;
  elements.shareReferralButton.setAttribute(
    'aria-disabled',
    code ? 'false' : 'true',
  );
  elements.shareReferralButton.href = code
    ? `https://wa.me/?text=${encodeURIComponent(referralMessage(user))}`
    : '#';

  elements.copyReferralButton.onclick = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      elements.referralFeedback.textContent = 'Referral code copied.';
    } catch {
      elements.referralFeedback.textContent = `Your code is ${code}.`;
    }
  };
}

function renderDashboard(user, orders) {
  const name = String(user.fullName || 'Customer').trim();
  const firstName = name.split(/\s+/)[0] || 'Customer';
  const sortedOrders = [...orders].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const totalSpent = sortedOrders.reduce(
    (sum, order) => sum + (Number(order.total) || 0),
    0,
  );
  const activeCount = sortedOrders.filter(isActiveOrder).length;
  const latestStatus = sortedOrders.length
    ? normalizedStatus(sortedOrders[0].status)
    : 'No orders';

  elements.avatar.textContent = firstName.charAt(0).toUpperCase() || 'V';
  elements.welcomeTitle.textContent = `Welcome back, ${firstName}`;
  elements.customerContact.textContent =
    user.email || user.mobile || 'VASUKI NFC customer';
  elements.totalOrders.textContent = String(sortedOrders.length);
  elements.totalSpent.textContent = formatCurrency(totalSpent);
  elements.activeOrders.textContent = String(activeCount);
  elements.latestStatus.textContent = latestStatus;
  elements.accountName.textContent = name;
  elements.accountEmail.textContent = user.email || 'Not provided';
  elements.accountMobile.textContent = user.mobile || 'Not provided';

  renderOrders(sortedOrders);
  renderReferral(user);
}

function showLoading() {
  elements.loading.hidden = false;
  elements.content.hidden = true;
  elements.error.hidden = true;
}

function showContent() {
  elements.loading.hidden = true;
  elements.content.hidden = false;
  elements.error.hidden = true;
}

function showError(message) {
  elements.loading.hidden = true;
  elements.content.hidden = true;
  elements.error.hidden = false;
  elements.errorMessage.textContent =
    message || 'Please try again in a moment.';
}

async function loadDashboard() {
  if (!getAuthToken()) {
    redirectToLogin();
    return;
  }

  showLoading();
  if (elements.refreshButton) {
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = 'Refreshing…';
  }

  try {
    const [accountData, orders, features] = await Promise.all([
      customerRequest('/api/me'),
      customerRequest('/api/my-orders'),
      loadFeatureFlags(),
    ]);
    const user = accountData.user || {};
    const orderList = Array.isArray(orders) ? orders : [];

    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    applyFeatureFlags(features);
    renderDashboard(user, orderList);
    showContent();
  } catch (error) {
    if (error instanceof CustomerApiError && error.status === 401) {
      clearCustomerSession();
      redirectToLogin();
      return;
    }
    showError(error.message);
  } finally {
    if (elements.refreshButton) {
      elements.refreshButton.disabled = false;
      elements.refreshButton.textContent = 'Refresh';
    }
  }
}

elements.retryButton?.addEventListener('click', loadDashboard);
elements.refreshButton?.addEventListener('click', loadDashboard);
elements.logoutButton?.addEventListener('click', () => {
  clearCustomerSession();
  window.location.replace('/');
});

if (elements.currentYear) {
  elements.currentYear.textContent = String(new Date().getFullYear());
}

loadDashboard();
