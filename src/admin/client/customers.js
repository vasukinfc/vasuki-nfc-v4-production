import { AdminApiError, getCurrentAdmin } from './admin-session.js';
import {
  AdminCrmApiError,
  archiveCustomer,
  listCustomers,
  loadCustomer,
  updateCustomer,
} from './admin-api.js';

const elements = {
  filters: document.querySelector('#customerFilters'),
  search: document.querySelector('#customerSearch'),
  status: document.querySelector('#customerStatus'),
  message: document.querySelector('#customerMessage'),
  rows: document.querySelector('#customerRows'),
  detail: document.querySelector('#customerDetail'),
  empty: document.querySelector('#customerEmpty'),
  form: document.querySelector('#customerForm'),
  name: document.querySelector('#editCustomerName'),
  email: document.querySelector('#editCustomerEmail'),
  mobile: document.querySelector('#editCustomerMobile'),
  editStatus: document.querySelector('#editCustomerStatus'),
  notes: document.querySelector('#editCustomerNotes'),
  archive: document.querySelector('#archiveCustomer'),
  orders: document.querySelector('#customerOrders'),
};

let selectedCustomerId = '';

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

function statusBadge(status) {
  const badge = document.createElement('span');
  badge.className = 'admin-crm-badge';
  badge.dataset.state = status;
  badge.textContent = status;
  return badge;
}

function renderRows(customers) {
  elements.rows.replaceChildren();
  customers.forEach((customer) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = customer.fullName || customer.email || customer.mobile || customer.id;
    const meta = document.createElement('span');
    meta.textContent = customer.email || customer.referralCode || customer.id;
    name.append(strong, meta);
    const mobile = document.createElement('td');
    mobile.textContent = customer.mobile || '—';
    const status = document.createElement('td');
    status.append(statusBadge(customer.status));
    const created = document.createElement('td');
    created.textContent = formatDate(customer.createdAt);
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-crm-small-button';
    button.textContent = 'View';
    button.addEventListener('click', () => selectCustomer(customer.id));
    action.append(button);
    row.append(name, mobile, status, created, action);
    elements.rows.append(row);
  });
}

function renderOrders(orders) {
  elements.orders.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = 'Related orders';
  elements.orders.append(heading);
  if (!orders.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No matching orders found for this customer.';
    elements.orders.append(empty);
    return;
  }
  orders.slice(0, 8).forEach((order) => {
    const item = document.createElement('a');
    item.href = `/admin/orders?search=${encodeURIComponent(order.localOrderId || order.token || '')}`;
    item.textContent = `${order.token || order.localOrderId || 'Order'} · ${order.paymentStatus} · ₹${order.total}`;
    elements.orders.append(item);
  });
}

function populateDetail(customer, orders) {
  selectedCustomerId = customer.id;
  elements.empty.hidden = true;
  elements.detail.hidden = false;
  elements.form.hidden = false;
  elements.detail.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = customer.fullName || customer.id;
  const meta = document.createElement('p');
  meta.textContent = [customer.email, customer.mobile, customer.referralCode].filter(Boolean).join(' · ');
  elements.detail.append(title, meta, statusBadge(customer.status));
  elements.name.value = customer.fullName || '';
  elements.email.value = customer.email || '';
  elements.mobile.value = customer.mobile || '';
  elements.editStatus.value = customer.status || 'active';
  elements.notes.value = customer.adminNotes || '';
  renderOrders(orders);
}

async function loadRows() {
  elements.message.textContent = 'Loading customers…';
  try {
    const data = await listCustomers({
      search: elements.search.value.trim(),
      status: elements.status.value,
    });
    renderRows(data.customers || []);
    elements.message.textContent = `${(data.customers || []).length} customer record(s).`;
  } catch (error) {
    handleError(error, 'Unable to load customers.');
  }
}

async function selectCustomer(customerId) {
  elements.message.textContent = 'Loading customer details…';
  try {
    const data = await loadCustomer(customerId);
    populateDetail(data.customer, data.orders || []);
    elements.message.textContent = '';
  } catch (error) {
    handleError(error, 'Unable to load customer details.');
  }
}

elements.filters.addEventListener('submit', (event) => {
  event.preventDefault();
  loadRows();
});

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedCustomerId) return;
  elements.message.textContent = 'Saving customer…';
  try {
    await updateCustomer(selectedCustomerId, {
      fullName: elements.name.value,
      email: elements.email.value,
      mobile: elements.mobile.value,
      status: elements.editStatus.value,
      adminNotes: elements.notes.value,
    });
    await selectCustomer(selectedCustomerId);
    await loadRows();
    elements.message.textContent = 'Customer saved.';
  } catch (error) {
    handleError(error, 'Unable to save customer.');
  }
});

elements.archive.addEventListener('click', async () => {
  if (!selectedCustomerId) return;
  if (!window.confirm('Archive this customer? Existing records stay available.')) return;
  elements.message.textContent = 'Archiving customer…';
  try {
    await archiveCustomer(selectedCustomerId, { adminNotes: elements.notes.value });
    await selectCustomer(selectedCustomerId);
    await loadRows();
    elements.message.textContent = 'Customer archived.';
  } catch (error) {
    handleError(error, 'Unable to archive customer.');
  }
});

async function initialise() {
  try {
    await getCurrentAdmin();
    await loadRows();
  } catch (error) {
    handleError(error, 'Unable to open Customer Management.');
  }
}

initialise();
