import { AdminApiError, getCurrentAdmin } from './admin-session.js';
import {
  AdminCrmApiError,
  listOrders,
  loadOrder,
  updateOrderStatus,
} from './admin-api.js';

const elements = {
  filters: document.querySelector('#orderFilters'),
  search: document.querySelector('#orderSearch'),
  status: document.querySelector('#orderStatus'),
  payment: document.querySelector('#paymentStatus'),
  message: document.querySelector('#orderMessage'),
  rows: document.querySelector('#orderRows'),
  detail: document.querySelector('#orderDetail'),
  empty: document.querySelector('#orderEmpty'),
  form: document.querySelector('#orderStatusForm'),
  editStatus: document.querySelector('#editOrderStatus'),
  note: document.querySelector('#orderStatusNote'),
};

let selectedOrderId = '';
let knownStatuses = [];
const identifierSecurity = window.AdminOrderIdentifierSecurity;

function redirectToLogin() {
  window.location.replace('/admin/login');
}

function handleError(error, fallback) {
  if (
    (error instanceof AdminApiError || error instanceof AdminCrmApiError) &&
    error.status === 401
  ) {
    redirectToLogin();
    return;
  }
  elements.message.textContent = error.message || fallback;
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

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(value) || 0);
}

function badge(value) {
  const node = document.createElement('span');
  node.className = 'admin-crm-badge';
  node.dataset.state = String(value || '').toLowerCase();
  node.textContent = value || '—';
  return node;
}

function appendField(label, value) {
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  elements.detail.append(row);
}

function copyIdentifier(value, button) {
  const text = identifierSecurity.normalizeIdentifier(value);
  if (!text) return;
  if (!navigator.clipboard?.writeText) {
    elements.message.textContent = 'Copy is unavailable in this browser.';
    return;
  }
  navigator.clipboard.writeText(text)
    .then(() => {
      button.textContent = 'Copied';
      elements.message.textContent = 'Identifier copied.';
      window.setTimeout(() => {
        button.textContent = 'Copy';
      }, 1600);
    })
    .catch(() => {
      elements.message.textContent = 'Unable to copy identifier.';
    });
}

function appendSensitiveIdentifierField(label, fieldName, value) {
  const original = identifierSecurity.normalizeIdentifier(value);
  const row = document.createElement('p');
  row.className = 'admin-crm-sensitive-field';

  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  const identifier = document.createElement('code');
  identifier.className = 'admin-crm-masked-identifier';
  identifier.dataset.field = fieldName;
  identifier.dataset.masked = 'true';
  identifier.textContent = identifierSecurity.maskIdentifier(original);

  const actions = document.createElement('span');
  actions.className = 'admin-crm-identifier-actions';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'admin-crm-inline-button';
  toggle.textContent = 'Reveal';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const masked = identifier.dataset.masked !== 'false';
    identifier.dataset.masked = masked ? 'false' : 'true';
    identifier.textContent = masked
      ? original || '—'
      : identifierSecurity.maskIdentifier(original);
    toggle.textContent = masked ? 'Hide' : 'Reveal';
    toggle.setAttribute('aria-expanded', masked ? 'true' : 'false');
  });

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'admin-crm-inline-button';
  copy.textContent = 'Copy';
  copy.disabled = !original;
  copy.addEventListener('click', () => copyIdentifier(original, copy));

  actions.append(toggle, copy);
  row.append(strong, identifier, actions);
  elements.detail.append(row);
}

function populateStatuses(statuses) {
  knownStatuses = statuses || knownStatuses;
  if (!knownStatuses.length) return;
  const currentFilter = elements.status.value;
  const currentEdit = elements.editStatus.value;
  elements.status.querySelectorAll('option[data-status]').forEach((option) => option.remove());
  elements.editStatus.replaceChildren();
  knownStatuses.forEach((status) => {
    const filterOption = document.createElement('option');
    filterOption.value = status.toLowerCase();
    filterOption.textContent = status;
    filterOption.dataset.status = 'true';
    elements.status.append(filterOption);
    const editOption = document.createElement('option');
    editOption.value = status;
    editOption.textContent = status;
    elements.editStatus.append(editOption);
  });
  elements.status.value = currentFilter;
  elements.editStatus.value = knownStatuses.includes(currentEdit) ? currentEdit : knownStatuses[0];
}

function renderRows(orders) {
  elements.rows.replaceChildren();
  orders.forEach((order) => {
    const row = document.createElement('tr');
    const id = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = order.token || order.localOrderId || order.razorpayOrderId || 'Order';
    const meta = document.createElement('span');
    meta.textContent = formatDate(order.createdAt);
    id.append(strong, meta);
    const customer = document.createElement('td');
    customer.textContent = order.customer.fullName || order.customer.mobile || '—';
    const payment = document.createElement('td');
    payment.append(badge(order.paymentStatus));
    const status = document.createElement('td');
    status.append(badge(order.orderStatus));
    const total = document.createElement('td');
    total.textContent = formatMoney(order.total);
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-crm-small-button';
    button.textContent = 'View';
    button.addEventListener('click', () => selectOrder(order.id));
    action.append(button);
    row.append(id, customer, payment, status, total, action);
    elements.rows.append(row);
  });
}

function renderDetail(order) {
  selectedOrderId = order.id;
  elements.empty.hidden = true;
  elements.detail.hidden = false;
  elements.form.hidden = false;
  elements.detail.replaceChildren();
  appendField('Order token', order.token || '—');
  appendSensitiveIdentifierField('Tracking token', 'trackingToken', order.trackingToken);
  appendSensitiveIdentifierField('Razorpay order', 'razorpayOrderId', order.razorpayOrderId);
  appendSensitiveIdentifierField('Payment ID', 'paymentId', order.paymentId);
  const fields = [
    ['Payment status', order.paymentStatus || '—'],
    ['Customer', [order.customer.fullName, order.customer.email, order.customer.mobile].filter(Boolean).join(' · ') || '—'],
    ['Delivery', `${order.deliveryType || 'standard'} · ${order.customer.city || ''} ${order.customer.state || ''} ${order.customer.pincode || ''}`.trim()],
    ['Design upload', order.designUpload?.originalName || '—'],
    ['Items', order.items.map((item) => `${item.name} × ${item.qty}`).join(', ') || '—'],
    ['Total', formatMoney(order.total)],
  ];
  fields.forEach(([label, value]) => {
    appendField(label, value);
  });
  elements.editStatus.value = String(order.orderStatus || '').toUpperCase();
  elements.note.value = order.adminStatusNote || '';
}

async function loadRows() {
  elements.message.textContent = 'Loading orders…';
  try {
    const data = await listOrders({
      search: elements.search.value.trim(),
      status: elements.status.value,
      paymentStatus: elements.payment.value,
    });
    populateStatuses(data.statuses || []);
    renderRows(data.orders || []);
    elements.message.textContent = `${(data.orders || []).length} order record(s).`;
  } catch (error) {
    handleError(error, 'Unable to load orders.');
  }
}

async function selectOrder(orderId) {
  elements.message.textContent = 'Loading order details…';
  try {
    const data = await loadOrder(orderId);
    renderDetail(data.order);
    elements.message.textContent = '';
  } catch (error) {
    handleError(error, 'Unable to load order details.');
  }
}

elements.filters.addEventListener('submit', (event) => {
  event.preventDefault();
  loadRows();
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedOrderId) return;
  elements.message.textContent = 'Updating order status…';
  try {
    const data = await updateOrderStatus(selectedOrderId, {
      orderStatus: elements.editStatus.value,
      adminStatusNote: elements.note.value,
    });
    renderDetail(data.order);
    await loadRows();
    elements.message.textContent = 'Order status updated.';
  } catch (error) {
    handleError(error, 'Unable to update order status.');
  }
});

async function initialise() {
  try {
    await getCurrentAdmin();
    const params = new URLSearchParams(window.location.search);
    elements.search.value = params.get('search') || '';
    await loadRows();
  } catch (error) {
    handleError(error, 'Unable to open Order Management.');
  }
}

initialise();
