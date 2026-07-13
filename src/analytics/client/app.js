import {
  renderBreakdown,
  renderRanking,
  renderTimeChart,
} from './chart-utils.js';
import { downloadCsv, downloadPdf } from './export-utils.js';

const TOKEN_KEY = 'vasukiAuthToken';
const RETURN_KEY = 'vasukiReturnAfterLogin';

const elements = {
  loading: document.querySelector('#analytics-loading'),
  error: document.querySelector('#analytics-error'),
  errorMessage: document.querySelector('#analytics-error-message'),
  retry: document.querySelector('#analytics-retry'),
  content: document.querySelector('#analytics-content'),
  refresh: document.querySelector('#analytics-refresh'),
  exportCsv: document.querySelector('#export-csv'),
  exportPdf: document.querySelector('#export-pdf'),
  audience: document.querySelector('#audience-metrics'),
  engagement: document.querySelector('#engagement-metrics'),
  chart: document.querySelector('#view-chart'),
  periodButtons: [...document.querySelectorAll('[data-period]')],
  traffic: document.querySelector('#traffic-breakdown'),
  devices: document.querySelector('#device-breakdown'),
  taps: document.querySelector('#tap-breakdown'),
  products: document.querySelector('#top-products'),
  services: document.querySelector('#top-services'),
  social: document.querySelector('#top-social'),
  cards: document.querySelector('#top-cards'),
};

const audienceMetrics = [
  ['totalCardViews', 'Total card views'],
  ['uniqueVisitors', 'Unique visitors'],
  ['returningVisitors', 'Returning visitors'],
  ['nfcTapCount', 'NFC taps'],
  ['qrScanCount', 'QR scans'],
  ['directLinkVisits', 'Direct link visits'],
];

const engagementMetrics = [
  ['contactSaveCount', 'Contacts saved'],
  ['whatsappClickCount', 'WhatsApp clicks'],
  ['callClickCount', 'Call clicks'],
  ['emailClickCount', 'Email clicks'],
  ['websiteClickCount', 'Website clicks'],
  ['googleMapsClickCount', 'Google Maps clicks'],
  ['socialMediaClicks', 'Social media clicks'],
  ['productViews', 'Product views'],
  ['serviceViews', 'Service views'],
  ['pdfOpens', 'PDF opens'],
  ['videoOpens', 'Video opens'],
  ['galleryOpens', 'Gallery opens'],
  ['paymentQrOpens', 'Payment QR opens'],
  ['shareCount', 'Shares'],
];

let dashboardData;
let activePeriod = 'daily';

function redirectToLogin() {
  localStorage.setItem(RETURN_KEY, '/analytics');
  window.location.replace('/login.html');
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

function renderMetricGroup(container, definitions, metrics) {
  container.replaceChildren(
    ...definitions.map(([key, label]) => metricCard(label, metrics[key])),
  );
}

function renderSelectedPeriod() {
  const series =
    dashboardData?.timeSeries?.[activePeriod] ||
    dashboardData?.dailyViews ||
    [];
  renderTimeChart(elements.chart, series, {
    period: activePeriod,
    noun: 'views',
  });
  elements.chart.setAttribute(
    'aria-label',
    `${activePeriod} card views`,
  );
  elements.periodButtons.forEach((button) =>
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.period === activePeriod),
    ),
  );
}

function render(data) {
  renderMetricGroup(elements.audience, audienceMetrics, data.metrics);
  renderMetricGroup(elements.engagement, engagementMetrics, data.metrics);
  renderSelectedPeriod();
  renderBreakdown(elements.traffic, data.trafficSources, {
    labels: { direct: 'Direct link', qr: 'QR scan', nfc: 'NFC tap' },
    totalLabel: 'visits',
  });
  renderBreakdown(elements.devices, data.deviceBreakdown, {
    labels: { mobile: 'Mobile', desktop: 'Desktop', unknown: 'Unclassified' },
    totalLabel: 'visits',
  });
  renderBreakdown(
    elements.taps,
    [
      { label: 'qr', count: data.qrVsNfc.qr },
      { label: 'nfc', count: data.qrVsNfc.nfc },
    ],
    {
      labels: { qr: 'QR scans', nfc: 'NFC taps' },
      totalLabel: 'smart visits',
    },
  );
  renderRanking(elements.products, data.topProducts, {
    valueLabel: 'views',
  });
  renderRanking(elements.services, data.topServices, {
    valueLabel: 'views',
  });
  renderRanking(elements.social, data.topSocialLinks, {
    valueLabel: 'clicks',
  });
  renderRanking(elements.cards, data.topCards || data.cards, {
    labelKey: 'slug',
    valueKey: 'views',
    valueLabel: 'views',
  });
}

function exportRows() {
  const rows = [['Section', 'Metric', 'Value']];
  [...audienceMetrics, ...engagementMetrics].forEach(([key, label]) => {
    rows.push(['Summary', label, dashboardData.metrics[key]]);
  });
  dashboardData.trafficSources.forEach((item) =>
    rows.push(['Traffic source', item.label, item.count]),
  );
  dashboardData.deviceBreakdown.forEach((item) =>
    rows.push(['Device', item.label, item.count]),
  );
  [
    ['Top product', dashboardData.topProducts],
    ['Top service', dashboardData.topServices],
    ['Top social link', dashboardData.topSocialLinks],
  ].forEach(([section, items]) =>
    items.forEach((item) => rows.push([section, item.label, item.count])),
  );
  (dashboardData.topCards || dashboardData.cards).forEach((item) =>
    rows.push(['Top card', item.slug, item.views]),
  );
  Object.entries(dashboardData.timeSeries).forEach(([period, points]) =>
    points.forEach((point) =>
      rows.push([`${period} views`, point.date, point.count]),
    ),
  );
  return rows;
}

function pdfSections() {
  const metricLines = [...audienceMetrics, ...engagementMetrics].map(
    ([key, label]) => `${label}: ${dashboardData.metrics[key]}`,
  );
  const rankingLines = (label, items, labelKey = 'label', valueKey = 'count') =>
    items.length
      ? items.map(
          (item, index) =>
            `${index + 1}. ${item[labelKey]} - ${item[valueKey]}`,
        )
      : [`${label}: No activity recorded.`];
  return [
    { heading: 'Summary', lines: metricLines },
    {
      heading: 'Traffic sources',
      lines: dashboardData.trafficSources.map(
        (item) => `${item.label}: ${item.count}`,
      ),
    },
    {
      heading: 'Device breakdown',
      lines: dashboardData.deviceBreakdown.map(
        (item) => `${item.label}: ${item.count}`,
      ),
    },
    {
      heading: 'Top products',
      lines: rankingLines('Products', dashboardData.topProducts),
    },
    {
      heading: 'Top services',
      lines: rankingLines('Services', dashboardData.topServices),
    },
    {
      heading: 'Top social links',
      lines: rankingLines('Social links', dashboardData.topSocialLinks),
    },
    {
      heading: 'Top cards',
      lines: rankingLines(
        'Cards',
        dashboardData.topCards || dashboardData.cards,
        'slug',
        'views',
      ),
    },
  ];
}

async function loadAnalytics() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    redirectToLogin();
    return;
  }
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.content.hidden = true;
  elements.refresh.disabled = true;
  try {
    const response = await fetch('/api/analytics/me/dashboard', {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('vasukiUser');
      redirectToLogin();
      return;
    }
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to load card analytics.');
    }
    dashboardData = payload;
    render(payload);
    elements.loading.hidden = true;
    elements.content.hidden = false;
  } catch (error) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent =
      error.message || 'Unable to load card analytics.';
  } finally {
    elements.refresh.disabled = false;
  }
}

elements.periodButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activePeriod = button.dataset.period;
    renderSelectedPeriod();
  });
});
elements.retry.addEventListener('click', loadAnalytics);
elements.refresh.addEventListener('click', loadAnalytics);
elements.exportCsv.addEventListener('click', () => {
  if (dashboardData) downloadCsv('vasuki-card-analytics', exportRows());
});
elements.exportPdf.addEventListener('click', () => {
  if (dashboardData) {
    downloadPdf(
      'vasuki-card-analytics',
      'VASUKI NFC - Card Analytics Report',
      pdfSections(),
    );
  }
});
loadAnalytics();
