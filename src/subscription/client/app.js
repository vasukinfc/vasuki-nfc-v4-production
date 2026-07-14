/**
 * Read-only customer subscription dashboard.
 *
 * Upgrade and renewal controls intentionally provide guidance only. No
 * payment or subscription mutation request is sent in Phase 5B.
 */

const TOKEN_KEY = 'vasukiAuthToken';
const RETURN_KEY = 'vasukiReturnAfterLogin';

const elements = {
  loading: document.querySelector('#subscription-loading'),
  error: document.querySelector('#subscription-error'),
  errorMessage: document.querySelector('#subscription-error-message'),
  retry: document.querySelector('#subscription-retry'),
  content: document.querySelector('#subscription-content'),
  badge: document.querySelector('#subscription-badge'),
  planTitle: document.querySelector('#current-plan-title'),
  planSummary: document.querySelector('#current-plan-summary'),
  remainingDays: document.querySelector('#remaining-days'),
  expiryDate: document.querySelector('#expiry-date'),
  graceStatus: document.querySelector('#grace-status'),
  renewalStatus: document.querySelector('#renewal-status'),
  featureAccess: document.querySelector('#feature-access'),
  planGrid: document.querySelector('#plan-grid'),
  historyList: document.querySelector('#history-list'),
  historyEmpty: document.querySelector('#history-empty'),
  invoiceList: document.querySelector('#invoice-list'),
  invoicesEmpty: document.querySelector('#invoices-empty'),
  upgradeButton: document.querySelector('#upgrade-button'),
  renewButton: document.querySelector('#renew-button'),
  notice: document.querySelector('#subscription-notice'),
};

let dashboardData = null;

function redirectToLogin() {
  localStorage.setItem(RETURN_KEY, '/subscription');
  window.location.replace('/login.html');
}

function planName(code) {
  return (
    dashboardData?.plans.find((plan) => plan.code === code)?.name ||
    String(code || 'Unknown plan')
  );
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
  }).format((Number(amount) || 0) / 100);
}

function durationLabel(plan) {
  if (plan.kind === 'lifetime') return 'No expiry';
  const value = plan.duration?.value || 0;
  const unit = String(plan.duration?.unit || '').replace(/s$/, '');
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function renewalLabel(lifecycle) {
  if (lifecycle.phase === 'lifetime') return 'Never required';
  if (lifecycle.phase === 'suspended') return 'Account suspended';
  if (lifecycle.phase === 'expired') return 'Renewal required';
  if (lifecycle.phase === 'grace') return 'Renew during grace period';
  if (lifecycle.reminderDue) return 'Renewal reminder active';
  return 'No action required';
}

function renderCurrent() {
  const { subscription, lifecycle } = dashboardData.current;
  elements.badge.textContent = lifecycle.badge;
  elements.badge.dataset.state = lifecycle.phase;
  elements.renewButton.disabled =
    !subscription || lifecycle.phase === 'lifetime';

  if (!subscription) {
    elements.planTitle.textContent = 'No active plan';
    elements.planSummary.textContent =
      'Your account does not have a subscription yet.';
    elements.remainingDays.textContent = '—';
    elements.expiryDate.textContent = '—';
    elements.graceStatus.textContent = 'Not active';
    elements.renewalStatus.textContent = 'Choose a plan';
    elements.featureAccess.textContent = 'Locked';
    elements.featureAccess.dataset.access = 'locked';
    return;
  }

  elements.planTitle.textContent = planName(subscription.planCode);
  elements.planSummary.textContent =
    lifecycle.phase === 'lifetime'
      ? 'Your Lifetime plan does not expire.'
      : `Subscription started ${formatDate(subscription.startsAt)}.`;
  elements.remainingDays.textContent =
    lifecycle.remainingDays === null
      ? 'Lifetime'
      : String(lifecycle.remainingDays);
  elements.expiryDate.textContent =
    lifecycle.phase === 'lifetime'
      ? 'Never'
      : formatDate(subscription.expiresAt);
  elements.graceStatus.textContent = lifecycle.inGracePeriod
    ? `${lifecycle.graceRemainingDays} day${lifecycle.graceRemainingDays === 1 ? '' : 's'} remaining`
    : subscription.graceEndsAt
      ? `Until ${formatDate(subscription.graceEndsAt)}`
      : 'Not applicable';
  elements.renewalStatus.textContent = renewalLabel(lifecycle);
  elements.featureAccess.textContent = lifecycle.access.allowed
    ? 'Available'
    : 'Locked';
  elements.featureAccess.dataset.access = lifecycle.access.allowed
    ? 'available'
    : 'locked';
}

function renderPlans() {
  elements.planGrid.replaceChildren();
  dashboardData.plans.forEach((plan) => {
    const card = document.createElement('article');
    card.className = 'plan-card';
    if (dashboardData.current.subscription?.planCode === plan.code) {
      card.dataset.current = 'true';
    }

    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = plan.name;
    const duration = document.createElement('strong');
    duration.textContent = durationLabel(plan);
    heading.append(title, duration);

    const description = document.createElement('p');
    description.textContent =
      plan.kind === 'trial'
        ? 'Explore subscription access before choosing a paid duration.'
        : plan.kind === 'lifetime'
          ? 'Permanent subscription access without a renewal date.'
          : 'Subscription access for the selected calendar duration.';

    const marker = document.createElement('span');
    marker.textContent =
      dashboardData.current.subscription?.planCode === plan.code
        ? 'Current plan'
        : 'Plan option';
    card.append(heading, description, marker);
    elements.planGrid.append(card);
  });
}

function eventLabel(event) {
  const labels = {
    activated: 'Subscription activated',
    renewed: 'Subscription renewed',
    suspended: 'Subscription suspended',
    expired: 'Subscription expired',
  };
  return labels[event.eventType] || 'Subscription updated';
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = dashboardData.history.length > 0;
  dashboardData.history.forEach((event) => {
    const item = document.createElement('li');
    const marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = eventLabel(event);
    const meta = document.createElement('p');
    meta.textContent = `${planName(event.toPlanCode)} · ${formatDate(event.occurredAt)}`;
    body.append(title, meta);
    if (event.reason) {
      const reason = document.createElement('small');
      reason.textContent = event.reason;
      body.append(reason);
    }
    item.append(marker, body);
    elements.historyList.append(item);
  });
}

function renderInvoices() {
  elements.invoiceList.replaceChildren();
  elements.invoicesEmpty.hidden = dashboardData.invoices.length > 0;
  dashboardData.invoices.forEach((invoice) => {
    const item = document.createElement('article');
    item.className = 'invoice-card';
    const heading = document.createElement('div');
    const number = document.createElement('strong');
    number.textContent = invoice.invoiceNumber;
    const status = document.createElement('span');
    status.textContent = invoice.status;
    status.dataset.status = invoice.status;
    heading.append(number, status);

    const plan = document.createElement('p');
    plan.textContent = `${planName(invoice.planCode)} · ${formatDate(invoice.issuedAt)}`;
    const total = document.createElement('b');
    total.textContent = formatMoney(invoice.totalAmount, invoice.currency);
    item.append(heading, plan, total);
    elements.invoiceList.append(item);
  });
}

function showNotice(message) {
  elements.notice.textContent = message;
}

async function loadDashboard() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    redirectToLogin();
    return;
  }

  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.content.hidden = true;
  try {
    const response = await fetch('/api/subscriptions/me/dashboard', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('vasukiUser');
      redirectToLogin();
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load subscription details.');
    }

    dashboardData = payload;
    renderCurrent();
    renderPlans();
    renderHistory();
    renderInvoices();
    elements.loading.hidden = true;
    elements.content.hidden = false;
  } catch (error) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent =
      error.message || 'Unable to load subscription details.';
  }
}

elements.retry.addEventListener('click', loadDashboard);
elements.upgradeButton.addEventListener('click', () => {
  showNotice('Online upgrades will be enabled after payment integration.');
});
elements.renewButton.addEventListener('click', () => {
  showNotice('Online renewals will be enabled after payment integration.');
});

loadDashboard();
