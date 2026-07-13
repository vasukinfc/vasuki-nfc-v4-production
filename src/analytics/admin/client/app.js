import {
  AdminAnalyticsApiError,
  getAdminAnalytics,
  getAdminIdentity,
} from './api-client.js';
import {
  renderBreakdown,
  renderRanking,
  renderTimeChart,
} from '/analytics/assets/chart-utils.js';

const elements = {
  adminName: document.querySelector('#admin-name'),
  adminRole: document.querySelector('#admin-role'),
  loading: document.querySelector('#admin-loading'),
  error: document.querySelector('#admin-error'),
  errorMessage: document.querySelector('#admin-error-message'),
  retry: document.querySelector('#admin-retry'),
  content: document.querySelector('#admin-content'),
  refresh: document.querySelector('#admin-refresh'),
  metrics: document.querySelector('#customer-metrics'),
  revenue: document.querySelector('#revenue-summary'),
  revenueEmpty: document.querySelector('#revenue-empty'),
  growthPercent: document.querySelector('#growth-percent'),
  growthDetail: document.querySelector('#growth-detail'),
  revenueChart: document.querySelector('#revenue-chart'),
  registrationChart: document.querySelector('#registration-chart'),
  subscriptionChart: document.querySelector('#subscription-chart'),
  statusBreakdown: document.querySelector('#status-breakdown'),
  distribution: document.querySelector('#distribution-list'),
  topCustomers: document.querySelector('#top-customers'),
  mostViewed: document.querySelector('#most-viewed-cards'),
  mostShared: document.querySelector('#most-shared-cards'),
  heatmap: document.querySelector('#activity-heatmap'),
  filters: document.querySelector('#analytics-filters'),
  preset: document.querySelector('#range-preset'),
  from: document.querySelector('#range-from'),
  to: document.querySelector('#range-to'),
  customDates: [...document.querySelectorAll('.custom-date')],
  activeRange: document.querySelector('#active-range'),
};

const customerMetrics = [
  ['totalCustomers', 'Total customers'],
  ['activeCustomers', 'Active customers'],
  ['expiredCustomers', 'Expired customers'],
  ['lifetimeCustomers', 'Lifetime customers'],
  ['trackedEvents', 'Tracked activity'],
  ['cardViews', 'Card views'],
  ['shares', 'Card shares'],
];

let currentFilters = {};
let identityLoaded = false;

function redirectToLogin() {
  window.location.replace('/admin/login');
}

function metricCard(label, value) {
  const card = document.createElement('article');
  const title = document.createElement('span');
  title.textContent = label;
  const count = document.createElement('strong');
  count.textContent = new Intl.NumberFormat('en-IN').format(Number(value) || 0);
  card.append(title, count);
  return card;
}

function money(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format((Number(amount) || 0) / 100);
}

function renderRevenue(summaries) {
  elements.revenue.replaceChildren();
  elements.revenueEmpty.hidden = summaries.length > 0;
  summaries.forEach((summary) => {
    const row = document.createElement('article');
    const currency = document.createElement('strong');
    currency.textContent = summary.currency;
    const total = document.createElement('span');
    total.textContent = `${money(summary.totalAmount, summary.currency)} total`;
    const month = document.createElement('small');
    month.textContent =
      `${money(summary.currentMonthAmount, summary.currency)} this month · ` +
      `${summary.invoiceCount} paid invoices`;
    row.append(currency, total, month);
    elements.revenue.append(row);
  });
}

function renderGrowth(growth) {
  const sign = growth.growthPercent > 0 ? '+' : '';
  elements.growthPercent.textContent = `${sign}${growth.growthPercent}%`;
  elements.growthPercent.dataset.direction =
    growth.growthPercent >= 0 ? 'up' : 'down';
  elements.growthDetail.textContent =
    `${growth.currentMonthRegistrations} this month · ` +
    `${growth.previousMonthRegistrations} last month`;
}

function planLabel(code) {
  if (code === 'no_plan') return 'No plan';
  return String(code || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderDistribution(items) {
  renderBreakdown(
    elements.distribution,
    items.map((item) => ({ label: item.planCode, count: item.count })),
    {
      labels: Object.fromEntries(
        items.map((item) => [item.planCode, planLabel(item.planCode)]),
      ),
      totalLabel: 'customers',
    },
  );
}

function renderHeatmap(cells) {
  elements.heatmap.replaceChildren();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maximum = Math.max(1, ...cells.map((cell) => Number(cell.count) || 0));
  weekdays.forEach((weekday, weekdayIndex) => {
    const label = document.createElement('strong');
    label.textContent = weekday;
    elements.heatmap.append(label);
    cells
      .filter((cell) => cell.weekday === weekdayIndex)
      .forEach((cell) => {
        const square = document.createElement('span');
        const intensity = cell.count / maximum;
        square.style.setProperty('--activity', String(intensity));
        square.title =
          `${weekday} ${String(cell.hour).padStart(2, '0')}:00 UTC: ` +
          `${cell.count} events`;
        square.setAttribute('aria-label', square.title);
        elements.heatmap.append(square);
      });
  });
}

function render(data) {
  elements.metrics.replaceChildren(
    ...customerMetrics.map(([key, label]) =>
      metricCard(label, data.metrics[key]),
    ),
  );
  renderRevenue(data.revenueSummary);
  renderGrowth(data.monthlyGrowth);
  renderTimeChart(
    elements.revenueChart,
    data.revenueAnalytics.timeSeries.monthly,
    {
      period: 'monthly',
      noun: 'revenue',
      formatValue: (value) => money(value),
    },
  );
  renderTimeChart(
    elements.registrationChart,
    data.customerGrowth.daily,
    { period: 'daily', noun: 'registrations' },
  );
  renderTimeChart(
    elements.subscriptionChart,
    data.subscriptionGrowth.daily,
    { period: 'daily', noun: 'activations' },
  );
  renderBreakdown(elements.statusBreakdown, data.activeVsExpired, {
    labels: { active: 'Active', expired: 'Expired' },
    totalLabel: 'customers',
  });
  renderDistribution(data.subscriptionDistribution);
  renderRanking(elements.topCustomers, data.topCustomers, {
    labelKey: 'name',
    valueKey: 'views',
    valueLabel: 'views',
  });
  renderRanking(elements.mostViewed, data.mostViewedCards, {
    labelKey: 'slug',
    valueKey: 'views',
    valueLabel: 'views',
  });
  renderRanking(elements.mostShared, data.mostSharedCards, {
    labelKey: 'slug',
    valueKey: 'shares',
    valueLabel: 'shares',
  });
  renderHeatmap(data.activityHeatmap);
  elements.activeRange.textContent =
    data.range.from || data.range.to
      ? `${data.range.from?.slice(0, 10) || 'Beginning'} – ${data.range.to?.slice(0, 10) || 'Today'}`
      : 'All-time insights';
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function selectedFilters() {
  if (elements.preset.value === 'custom') {
    return { from: elements.from.value, to: elements.to.value };
  }
  const days = Number(elements.preset.value);
  if (!Number.isInteger(days)) return {};
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

async function load({ refreshIdentity = false } = {}) {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.content.hidden = true;
  elements.refresh.disabled = true;
  try {
    const requests = [getAdminAnalytics(currentFilters)];
    if (!identityLoaded || refreshIdentity) requests.push(getAdminIdentity());
    const [analytics, identity] = await Promise.all(requests);
    if (identity) {
      elements.adminName.textContent = identity.admin.displayName;
      elements.adminRole.textContent = identity.admin.role.replace('_', ' ');
      identityLoaded = true;
    }
    render(analytics);
    elements.loading.hidden = true;
    elements.content.hidden = false;
  } catch (error) {
    if (error instanceof AdminAnalyticsApiError && error.status === 401) {
      redirectToLogin();
      return;
    }
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent =
      error.message || 'Unable to load admin analytics.';
  } finally {
    elements.refresh.disabled = false;
  }
}

elements.preset.addEventListener('change', () => {
  const custom = elements.preset.value === 'custom';
  elements.customDates.forEach((label) => {
    label.hidden = !custom;
  });
});
elements.filters.addEventListener('submit', (event) => {
  event.preventDefault();
  currentFilters = selectedFilters();
  load();
});
elements.retry.addEventListener('click', () => load());
elements.refresh.addEventListener('click', () => load());
load({ refreshIdentity: true });
