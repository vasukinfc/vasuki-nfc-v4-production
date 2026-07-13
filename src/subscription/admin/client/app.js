import {
  AdminApiError,
  getCurrentAdmin,
} from '/admin/assets/admin-session.js';
import {
  AdminSubscriptionApiError,
  listSubscriptions,
  loadSubscription,
  runSubscriptionAction,
} from './api-client.js';

const elements = {
  adminName: document.querySelector('#admin-name'),
  adminRole: document.querySelector('#admin-role'),
  filterForm: document.querySelector('#filter-form'),
  search: document.querySelector('#search-filter'),
  planFilter: document.querySelector('#plan-filter'),
  statusFilter: document.querySelector('#status-filter'),
  resultCount: document.querySelector('#result-count'),
  message: document.querySelector('#manager-message'),
  rows: document.querySelector('#subscription-rows'),
  empty: document.querySelector('#manager-empty'),
  detail: document.querySelector('#manager-detail'),
  detailTitle: document.querySelector('#detail-title'),
  detailContact: document.querySelector('#detail-contact'),
  detailStatus: document.querySelector('#detail-status'),
  detailPlan: document.querySelector('#detail-plan'),
  detailRemaining: document.querySelector('#detail-remaining'),
  detailExpiry: document.querySelector('#detail-expiry'),
  detailAccess: document.querySelector('#detail-access'),
  actionForm: document.querySelector('#admin-action-form'),
  actionName: document.querySelector('#action-name'),
  actionPlanField: document.querySelector('#action-plan-field'),
  actionPlan: document.querySelector('#action-plan'),
  actionNote: document.querySelector('#action-note'),
  actionSubmit: document.querySelector('#action-submit'),
  actionMessage: document.querySelector('#action-message'),
  historyList: document.querySelector('#history-list'),
  historyEmpty: document.querySelector('#history-empty'),
  invoiceList: document.querySelector('#invoice-list'),
  invoiceEmpty: document.querySelector('#invoice-empty'),
};

let plans = [];
let selectedOwnerId = '';

function redirectToLogin() {
  window.location.replace('/admin/login');
}

function handleAuthError(error) {
  if (
    (error instanceof AdminApiError ||
      error instanceof AdminSubscriptionApiError) &&
    error.status === 401
  ) {
    redirectToLogin();
    return true;
  }
  return false;
}

function planName(code) {
  return plans.find((plan) => plan.code === code)?.name || code || 'No plan';
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

function populatePlans() {
  const currentFilter = elements.planFilter.value;
  const currentAction = elements.actionPlan.value;
  elements.planFilter
    .querySelectorAll('option[data-plan]')
    .forEach((option) => option.remove());
  elements.actionPlan.replaceChildren();
  plans.forEach((plan) => {
    const filterOption = document.createElement('option');
    filterOption.value = plan.code;
    filterOption.textContent = plan.name;
    filterOption.dataset.plan = 'true';
    elements.planFilter.append(filterOption);

    const actionOption = document.createElement('option');
    actionOption.value = plan.code;
    actionOption.textContent = plan.name;
    elements.actionPlan.append(actionOption);
  });
  elements.planFilter.value = currentFilter;
  elements.actionPlan.value =
    plans.some((plan) => plan.code === currentAction)
      ? currentAction
      : plans[0]?.code || '';
}

function customerLabel(customer) {
  return customer.fullName || customer.email || customer.mobile || customer.id;
}

function renderRows(rows) {
  elements.rows.replaceChildren();
  elements.resultCount.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  elements.empty.hidden = rows.length > 0;
  rows.forEach((row) => {
    const tableRow = document.createElement('tr');
    const customer = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = customerLabel(row.customer);
    const customerMeta = document.createElement('span');
    customerMeta.textContent =
      row.customer.email || row.customer.mobile || row.customer.id;
    customer.append(name, customerMeta);

    const plan = document.createElement('td');
    plan.textContent = planName(row.subscription?.planCode);
    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.dataset.state = row.lifecycle.phase;
    badge.textContent = row.lifecycle.badge;
    status.append(badge);
    const expiry = document.createElement('td');
    expiry.textContent =
      row.lifecycle.phase === 'lifetime'
        ? 'Never'
        : formatDate(row.subscription?.expiresAt);
    const access = document.createElement('td');
    access.textContent = row.lifecycle.access.allowed ? 'Available' : 'Locked';
    access.dataset.access = row.lifecycle.access.allowed
      ? 'available'
      : 'locked';
    const actionCell = document.createElement('td');
    const manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'manage-button';
    manage.textContent = 'Manage';
    manage.dataset.ownerId = row.customer.id;
    manage.addEventListener('click', () => selectCustomer(row.customer.id));
    actionCell.append(manage);
    tableRow.append(customer, plan, status, expiry, access, actionCell);
    elements.rows.append(tableRow);
  });
}

function eventName(type) {
  return (
    {
      activated: 'Activated',
      renewed: 'Renewed',
      suspended: 'Suspended',
      restored: 'Restored',
      expired: 'Expired',
      plan_assigned: 'Plan assigned',
    }[type] || 'Updated'
  );
}

function renderDetail(data) {
  plans = data.plans;
  populatePlans();
  selectedOwnerId = data.customer.id;
  elements.detail.hidden = false;
  elements.detailTitle.textContent = customerLabel(data.customer);
  elements.detailContact.textContent = [
    data.customer.email,
    data.customer.mobile,
    data.customer.id,
  ]
    .filter(Boolean)
    .join(' · ');
  elements.detailStatus.textContent = data.lifecycle.badge;
  elements.detailStatus.dataset.state = data.lifecycle.phase;
  elements.detailPlan.textContent = planName(data.subscription?.planCode);
  elements.detailRemaining.textContent =
    data.lifecycle.remainingDays === null
      ? 'Lifetime'
      : `${data.lifecycle.remainingDays} day${data.lifecycle.remainingDays === 1 ? '' : 's'}`;
  elements.detailExpiry.textContent =
    data.lifecycle.phase === 'lifetime'
      ? 'Never'
      : formatDate(data.subscription?.expiresAt);
  elements.detailAccess.textContent = data.lifecycle.access.allowed
    ? 'Available'
    : 'Locked';
  elements.actionPlan.value =
    data.subscription?.planCode || plans[0]?.code || '';
  elements.actionNote.value = '';
  elements.actionMessage.textContent = '';

  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = data.history.length > 0;
  data.history.forEach((event) => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `${eventName(event.eventType)} · ${planName(event.toPlanCode)}`;
    const meta = document.createElement('span');
    meta.textContent = `${formatDate(event.occurredAt)} · ${event.actor.type} ${event.actor.id}`;
    const note = document.createElement('p');
    note.textContent = event.reason || 'No note recorded.';
    item.append(title, meta, note);
    elements.historyList.append(item);
  });

  elements.invoiceList.replaceChildren();
  elements.invoiceEmpty.hidden = data.invoices.length > 0;
  data.invoices.forEach((invoice) => {
    const card = document.createElement('article');
    const heading = document.createElement('div');
    const number = document.createElement('strong');
    number.textContent = invoice.invoiceNumber;
    const status = document.createElement('span');
    status.textContent = invoice.status;
    heading.append(number, status);
    const meta = document.createElement('p');
    meta.textContent = `${planName(invoice.planCode)} · ${formatDate(invoice.issuedAt)}`;
    const total = document.createElement('b');
    total.textContent = formatMoney(invoice.totalAmount, invoice.currency);
    card.append(heading, meta, total);
    elements.invoiceList.append(card);
  });
  elements.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadRows() {
  elements.message.textContent = 'Loading subscriptions…';
  try {
    const data = await listSubscriptions({
      search: elements.search.value.trim(),
      plan: elements.planFilter.value,
      status: elements.statusFilter.value,
    });
    plans = data.plans;
    populatePlans();
    renderRows(data.rows);
    elements.message.textContent = '';
  } catch (error) {
    if (handleAuthError(error)) return;
    elements.message.textContent =
      error.message || 'Unable to load subscriptions.';
  }
}

async function selectCustomer(ownerId) {
  elements.message.textContent = 'Loading customer subscription…';
  try {
    renderDetail(await loadSubscription(ownerId));
    elements.message.textContent = '';
  } catch (error) {
    if (handleAuthError(error)) return;
    elements.message.textContent =
      error.message || 'Unable to load this subscription.';
  }
}

function updatePlanVisibility() {
  elements.actionPlanField.hidden = ![
    'activate',
    'assign-plan',
    'renew',
  ].includes(elements.actionName.value);
}

elements.filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadRows();
});
elements.actionName.addEventListener('change', updatePlanVisibility);
elements.actionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedOwnerId) return;
  const action = elements.actionName.value;
  const note = elements.actionNote.value.trim();
  if (note.length < 5) {
    elements.actionMessage.textContent =
      'Enter an audit note of at least 5 characters.';
    return;
  }
  if (
    ['expire', 'suspend'].includes(action) &&
    !window.confirm(`Confirm manual ${action} for this customer?`)
  ) {
    return;
  }

  elements.actionSubmit.disabled = true;
  elements.actionMessage.textContent = 'Applying subscription action…';
  try {
    const result = await runSubscriptionAction(selectedOwnerId, action, {
      planCode: elements.actionPlanField.hidden
        ? undefined
        : elements.actionPlan.value,
      note,
    });
    renderDetail(result);
    elements.actionMessage.textContent = 'Subscription action completed.';
    await loadRows();
  } catch (error) {
    if (handleAuthError(error)) return;
    elements.actionMessage.textContent =
      error.message || 'Unable to complete this action.';
  } finally {
    elements.actionSubmit.disabled = false;
  }
});

async function initialise() {
  try {
    const { admin } = await getCurrentAdmin();
    elements.adminName.textContent = admin.displayName;
    elements.adminRole.textContent = admin.role.replace('_', ' ');
    await loadRows();
  } catch (error) {
    if (handleAuthError(error)) return;
    elements.message.textContent =
      error.message || 'Unable to load the Admin Subscription Manager.';
  }
}

updatePlanVisibility();
initialise();
