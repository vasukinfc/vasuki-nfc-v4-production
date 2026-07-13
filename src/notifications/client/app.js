const TOKEN_KEY = 'vasukiAuthToken';
const RETURN_KEY = 'vasukiReturnAfterLogin';

const elements = {
  unreadBadge: document.querySelector('#unread-badge'),
  markAll: document.querySelector('#mark-all-read'),
  message: document.querySelector('#notification-message'),
  loading: document.querySelector('#notification-loading'),
  empty: document.querySelector('#notification-empty'),
  list: document.querySelector('#notification-list'),
  filters: [...document.querySelectorAll('[data-filter]')],
};

let currentFilter = 'all';

function redirectToLogin() {
  localStorage.setItem(RETURN_KEY, '/notifications');
  window.location.replace('/login.html');
}

async function request(path = '', options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    redirectToLogin();
    throw new Error('Customer login required.');
  }
  const response = await fetch(`/api/notifications/me${path}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('vasukiUser');
    redirectToLogin();
    throw new Error('Customer login required.');
  }
  if (!response.ok) {
    throw new Error(payload.error || 'Notification request failed.');
  }
  return payload;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function render(data) {
  elements.unreadBadge.textContent =
    `${data.unreadCount} unread`;
  elements.markAll.disabled = data.unreadCount === 0;
  elements.list.replaceChildren();
  elements.empty.hidden = data.notifications.length > 0;

  data.notifications.forEach((notification) => {
    const item = document.createElement('li');
    item.className = 'notification-item';
    item.dataset.severity = notification.severity;
    item.dataset.read = notification.readAt ? 'true' : 'false';

    const marker = document.createElement('span');
    marker.className = 'notification-marker';
    marker.setAttribute('aria-hidden', 'true');
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
    item.append(marker, body);

    if (!notification.readAt) {
      const read = document.createElement('button');
      read.type = 'button';
      read.textContent = 'Mark read';
      read.addEventListener('click', async () => {
        read.disabled = true;
        try {
          await request(
            `/${encodeURIComponent(notification.notificationId)}/read`,
            { method: 'POST' },
          );
          await loadNotifications();
        } catch (error) {
          elements.message.textContent = error.message;
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
    const data = await request(
      currentFilter === 'unread' ? '?unread=true' : '',
    );
    render(data);
  } catch (error) {
    elements.message.textContent = error.message;
  } finally {
    elements.loading.hidden = true;
  }
}

elements.filters.forEach((button) => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    elements.filters.forEach((candidate) =>
      candidate.classList.toggle('active', candidate === button),
    );
    loadNotifications();
  });
});

elements.markAll.addEventListener('click', async () => {
  elements.markAll.disabled = true;
  try {
    await request('/read-all', { method: 'POST' });
    elements.message.textContent = 'All notifications marked as read.';
    await loadNotifications();
  } catch (error) {
    elements.message.textContent = error.message;
    elements.markAll.disabled = false;
  }
});

loadNotifications();
