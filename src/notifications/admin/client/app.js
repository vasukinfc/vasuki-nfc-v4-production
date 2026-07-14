import {
  AdminApiError,
  getCurrentAdmin,
} from '/admin/assets/admin-session.js';
import {
  AdminNotificationApiError,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from './api-client.js';

const elements = {
  name: document.querySelector('#admin-name'),
  role: document.querySelector('#admin-role'),
  unread: document.querySelector('#admin-unread-count'),
  markAll: document.querySelector('#admin-mark-all'),
  message: document.querySelector('#admin-notification-message'),
  loading: document.querySelector('#admin-notification-loading'),
  empty: document.querySelector('#admin-notification-empty'),
  list: document.querySelector('#admin-notification-list'),
  filters: [...document.querySelectorAll('[data-filter]')],
};

let unreadOnly = false;

function redirectToLogin() {
  window.location.replace('/admin/login');
}

function handleError(error) {
  if (
    (error instanceof AdminApiError ||
      error instanceof AdminNotificationApiError) &&
    error.status === 401
  ) {
    redirectToLogin();
    return;
  }
  elements.message.textContent =
    error.message || 'Unable to load administrator notifications.';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    : '';
}

function render(data) {
  elements.unread.textContent = `${data.unreadCount} unread`;
  elements.markAll.disabled = data.unreadCount === 0;
  elements.list.replaceChildren();
  elements.empty.hidden = data.notifications.length > 0;
  data.notifications.forEach((notification) => {
    const item = document.createElement('li');
    item.dataset.severity = notification.severity;
    item.dataset.read = notification.readAt ? 'true' : 'false';
    const body = document.createElement('div');
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = notification.title;
    const severity = document.createElement('span');
    severity.textContent = notification.severity;
    heading.append(title, severity);
    const message = document.createElement('p');
    message.textContent = notification.message;
    const time = document.createElement('small');
    time.textContent = formatDate(notification.createdAt);
    body.append(heading, message, time);
    item.append(body);
    if (!notification.readAt) {
      const read = document.createElement('button');
      read.type = 'button';
      read.textContent = 'Mark read';
      read.addEventListener('click', async () => {
        read.disabled = true;
        try {
          await markAdminNotificationRead(notification.notificationId);
          await loadNotifications();
        } catch (error) {
          handleError(error);
          read.disabled = false;
        }
      });
      item.append(read);
    }
    elements.list.append(item);
  });
}

async function loadNotifications() {
  elements.loading.hidden = false;
  elements.message.textContent = '';
  try {
    render(await listAdminNotifications(unreadOnly));
  } catch (error) {
    handleError(error);
  } finally {
    elements.loading.hidden = true;
  }
}

elements.filters.forEach((button) => {
  button.addEventListener('click', () => {
    unreadOnly = button.dataset.filter === 'unread';
    elements.filters.forEach((candidate) =>
      candidate.classList.toggle('active', candidate === button),
    );
    loadNotifications();
  });
});

elements.markAll.addEventListener('click', async () => {
  elements.markAll.disabled = true;
  try {
    await markAllAdminNotificationsRead();
    elements.message.textContent = 'All admin notifications marked as read.';
    await loadNotifications();
  } catch (error) {
    handleError(error);
  }
});

async function initialise() {
  try {
    const { admin } = await getCurrentAdmin();
    elements.name.textContent = admin.displayName;
    elements.role.textContent = admin.role.replace('_', ' ');
    await loadNotifications();
  } catch (error) {
    handleError(error);
  }
}

initialise();
