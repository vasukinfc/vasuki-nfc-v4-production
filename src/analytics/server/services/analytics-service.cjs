'use strict';

const crypto = require('crypto');
const {
  evaluateSubscription,
} = require('../../../subscription/server/domain/subscription-lifecycle.cjs');
const {
  ANALYTICS_EVENT_TYPES,
  normalizeAnalyticsEvent,
  normalizePublicAnalyticsInput,
} = require('../schemas/analytics-event-schema.cjs');
const {
  activityHeatmap,
  breakdown,
  dailySeries,
  monthKey,
  rankEvents,
  timeSeries,
  validDate,
} = require('./analytics-reporting.cjs');

function analyticsError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function emptyMetricCounts() {
  return Object.fromEntries(
    ANALYTICS_EVENT_TYPES.map((eventType) => [eventType, 0]),
  );
}

function normalizeDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const source = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(source);
  const date = validDate(
    dateOnly
      ? `${source}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
      : source,
  );
  if (!date) {
    throw analyticsError(
      'Date filters must use valid ISO dates.',
      400,
      'ANALYTICS_DATE_INVALID',
    );
  }
  if (dateOnly && date.toISOString().slice(0, 10) !== source) {
    throw analyticsError(
      'Date filters must use valid calendar dates.',
      400,
      'ANALYTICS_DATE_INVALID',
    );
  }
  return date.toISOString();
}

function normalizeDateRange(input = {}) {
  const from = normalizeDateBoundary(input.from, false);
  const to = normalizeDateBoundary(input.to, true);
  if (from && to && from > to) {
    throw analyticsError(
      'The start date must be before the end date.',
      400,
      'ANALYTICS_DATE_RANGE_INVALID',
    );
  }
  return Object.freeze({ from, to });
}

function inRange(value, range) {
  const date = validDate(value);
  if (!date) return false;
  const iso = date.toISOString();
  if (range.from && iso < range.from) return false;
  if (range.to && iso > range.to) return false;
  return true;
}

function customerCreatedAt(customer) {
  return validDate(customer?.createdAt);
}

function cardRank(records, eventType, outputKey) {
  return rankEvents(records, eventType, {
    key: (record) => record.cardSlug,
  }).map((item) =>
    Object.freeze({
      slug: item.label,
      [outputKey]: item.count,
    }),
  );
}

function summarizeCustomerEvents(records, now) {
  const counts = emptyMetricCounts();
  const visitors = new Map();
  const sources = { nfc: 0, qr: 0, direct: 0 };

  records.forEach((record) => {
    if (counts[record.eventType] !== undefined) counts[record.eventType] += 1;
    if (record.eventType !== 'card_view') return;
    if (!visitors.has(record.visitorKey)) {
      visitors.set(record.visitorKey, new Set());
    }
    visitors.get(record.visitorKey).add(record.sessionKey);
    sources[record.source] = (sources[record.source] || 0) + 1;
  });

  const returningVisitors = [...visitors.values()].filter(
    (sessions) => sessions.size > 1,
  ).length;
  const cards = cardRank(records, 'card_view', 'views');
  const viewSeries = timeSeries(records, 'card_view', now);
  return Object.freeze({
    metrics: Object.freeze({
      totalCardViews: counts.card_view,
      uniqueVisitors: visitors.size,
      returningVisitors,
      nfcTapCount: sources.nfc,
      qrScanCount: sources.qr,
      directLinkVisits: sources.direct,
      contactSaveCount: counts.contact_save,
      whatsappClickCount: counts.whatsapp_click,
      callClickCount: counts.call_click,
      emailClickCount: counts.email_click,
      websiteClickCount: counts.website_click,
      googleMapsClickCount: counts.maps_click,
      socialMediaClicks: counts.social_click,
      productViews: counts.product_view,
      serviceViews: counts.service_view,
      pdfOpens: counts.pdf_open,
      videoOpens: counts.video_open,
      galleryOpens: counts.gallery_open,
      paymentQrOpens: counts.payment_qr_open,
      shareCount: counts.share,
    }),
    dailyViews: viewSeries.daily,
    timeSeries: viewSeries,
    trafficSources: breakdown(
      records,
      'card_view',
      (record) => record.source || 'direct',
      ['direct', 'qr', 'nfc'],
    ),
    deviceBreakdown: breakdown(
      records,
      'card_view',
      (record) => record.deviceType || 'unknown',
      ['mobile', 'desktop', 'unknown'],
    ),
    qrVsNfc: Object.freeze({
      qr: sources.qr,
      nfc: sources.nfc,
    }),
    topProducts: rankEvents(records, 'product_view'),
    topServices: rankEvents(records, 'service_view'),
    topSocialLinks: rankEvents(records, 'social_click'),
    topCards: Object.freeze(cards),
    cards: Object.freeze(cards),
  });
}

function registrationRecords(customers) {
  return customers
    .map(customerCreatedAt)
    .filter(Boolean)
    .map((createdAt) => ({
      eventType: 'registration',
      occurredAt: createdAt.toISOString(),
    }));
}

function growthPercent(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return (
    Math.round(((current - previous) / previous) * 1000) / 10
  );
}

function createAnalyticsService({
  repository,
  subscriptionRepository,
  listCustomers,
  config,
  clock = () => new Date(),
}) {
  function hashIdentifier(scope, value) {
    return crypto
      .createHmac('sha256', config.hashSecret)
      .update(`${scope}:${value}`)
      .digest('hex');
  }

  async function recordPublicEvent({ ownerId, cardSlug, input }) {
    if (!ownerId) {
      throw analyticsError('Digital card not found.', 404, 'CARD_NOT_FOUND');
    }
    let publicInput;
    try {
      publicInput = normalizePublicAnalyticsInput(input);
    } catch (error) {
      throw analyticsError(error.message, 400, 'ANALYTICS_EVENT_INVALID');
    }
    const event = normalizeAnalyticsEvent({
      eventId: `AE-${crypto.randomUUID()}`,
      ownerId,
      cardSlug,
      eventType: publicInput.eventType,
      source: publicInput.source,
      visitorKey: hashIdentifier('visitor', publicInput.visitorId),
      sessionKey: hashIdentifier('session', publicInput.sessionId),
      itemId: publicInput.itemId,
      itemLabel: publicInput.itemLabel,
      deviceType: publicInput.deviceType,
      occurredAt: clock(),
    });
    await repository.append(event);
    return Object.freeze({ accepted: true });
  }

  async function customerDashboard(ownerId) {
    const safeOwnerId = String(ownerId || '').trim();
    if (!safeOwnerId) {
      throw analyticsError(
        'Customer login required.',
        401,
        'CUSTOMER_LOGIN_REQUIRED',
      );
    }
    const records = await repository.listByOwner(safeOwnerId, {
      limit: config.maximumReportEvents,
    });
    return summarizeCustomerEvents(records, clock());
  }

  async function adminDashboard(rangeInput = {}) {
    const now = clock();
    const range = normalizeDateRange(rangeInput);
    const [customers, subscriptions, invoices, subscriptionHistory, events] =
      await Promise.all([
        listCustomers(),
        subscriptionRepository.listAllSubscriptions(10000),
        subscriptionRepository.listAllInvoices(20000),
        subscriptionRepository.listAllHistory(20000),
        repository.listAll({
          ...range,
          limit: config.maximumReportEvents,
        }),
      ]);

    const subscriptionByOwner = new Map(
      subscriptions.map((subscription) => [subscription.ownerId, subscription]),
    );
    let activeCustomers = 0;
    let expiredCustomers = 0;
    let lifetimeCustomers = 0;
    const subscriptionDistribution = new Map();
    customers.forEach((customer) => {
      const subscription = subscriptionByOwner.get(customer.id);
      const lifecycle = evaluateSubscription(subscription, now);
      if (lifecycle.phase === 'active' || lifecycle.phase === 'grace') {
        activeCustomers += 1;
      } else if (lifecycle.phase === 'expired') {
        expiredCustomers += 1;
      } else if (lifecycle.phase === 'lifetime') {
        lifetimeCustomers += 1;
      }
      const planCode = subscription?.planCode || 'no_plan';
      subscriptionDistribution.set(
        planCode,
        (subscriptionDistribution.get(planCode) || 0) + 1,
      );
    });

    const paidInvoices = invoices.filter(
      (invoice) =>
        invoice.status === 'paid' &&
        inRange(invoice.paidAt || invoice.issuedAt, range),
    );
    const currentMonth = monthKey(now);
    const revenueByCurrency = new Map();
    paidInvoices.forEach((invoice) => {
      const currency = invoice.currency || 'INR';
      const summary = revenueByCurrency.get(currency) || {
        currency,
        totalAmount: 0,
        currentMonthAmount: 0,
        invoiceCount: 0,
      };
      summary.totalAmount += Number(invoice.totalAmount) || 0;
      summary.invoiceCount += 1;
      if (monthKey(invoice.paidAt || invoice.issuedAt) === currentMonth) {
        summary.currentMonthAmount += Number(invoice.totalAmount) || 0;
      }
      revenueByCurrency.set(currency, summary);
    });
    const revenueRecords = paidInvoices.map((invoice) => ({
      eventType: 'revenue',
      occurredAt: invoice.paidAt || invoice.issuedAt,
      amount: Number(invoice.totalAmount) || 0,
    }));

    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const previousMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    let currentMonthRegistrations = 0;
    let previousMonthRegistrations = 0;
    customers.forEach((customer) => {
      const createdAt = customerCreatedAt(customer);
      if (!createdAt) return;
      if (createdAt >= currentMonthStart) currentMonthRegistrations += 1;
      else if (createdAt >= previousMonthStart) previousMonthRegistrations += 1;
    });

    const allRegistrations = registrationRecords(customers);
    const filteredRegistrations = allRegistrations.filter((record) =>
      inRange(record.occurredAt, range),
    );
    const filteredSubscriptionGrowth = subscriptionHistory
      .filter(
        (event) =>
          event.eventType === 'activated' &&
          inRange(event.occurredAt, range),
      )
      .map((event) => ({
        eventType: 'subscription',
        occurredAt: event.occurredAt,
      }));
    const seriesEnd = validDate(range.to) || now;
    const customerById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );
    const customerEvents = events.filter((event) =>
      customerById.has(event.ownerId),
    );
    const topCustomers = rankEvents(customerEvents, 'card_view', {
      key: (record) => record.ownerId,
    })
      .map((item) => {
        const customer = customerById.get(item.label);
        return Object.freeze({
          ownerId: item.label,
          name: customer?.fullName || customer?.email || item.label,
          views: item.count,
        });
      });

    return Object.freeze({
      range,
      metrics: Object.freeze({
        totalCustomers: customers.length,
        activeCustomers,
        expiredCustomers,
        lifetimeCustomers,
        trackedEvents: events.length,
        cardViews: events.filter((event) => event.eventType === 'card_view')
          .length,
        shares: events.filter((event) => event.eventType === 'share').length,
      }),
      revenueSummary: Object.freeze([...revenueByCurrency.values()]),
      revenueAnalytics: Object.freeze({
        timeSeries: timeSeries(
          revenueRecords,
          'revenue',
          seriesEnd,
          (record) => record.amount,
        ),
      }),
      monthlyGrowth: Object.freeze({
        currentMonthRegistrations,
        previousMonthRegistrations,
        growthPercent: growthPercent(
          currentMonthRegistrations,
          previousMonthRegistrations,
        ),
      }),
      dailyRegistrations: dailySeries(
        allRegistrations,
        'registration',
        now,
      ),
      customerGrowth: timeSeries(
        filteredRegistrations,
        'registration',
        seriesEnd,
      ),
      subscriptionGrowth: timeSeries(
        filteredSubscriptionGrowth,
        'subscription',
        seriesEnd,
      ),
      activeVsExpired: Object.freeze([
        Object.freeze({ label: 'active', count: activeCustomers }),
        Object.freeze({ label: 'expired', count: expiredCustomers }),
      ]),
      subscriptionDistribution: Object.freeze(
        [...subscriptionDistribution.entries()]
          .map(([planCode, count]) => Object.freeze({ planCode, count }))
          .sort((left, right) => right.count - left.count),
      ),
      topCustomers: Object.freeze(topCustomers),
      mostViewedCards: Object.freeze(
        cardRank(events, 'card_view', 'views'),
      ),
      mostSharedCards: Object.freeze(cardRank(events, 'share', 'shares')),
      activityHeatmap: activityHeatmap(events),
    });
  }

  return Object.freeze({
    adminDashboard,
    customerDashboard,
    recordPublicEvent,
  });
}

module.exports = {
  createAnalyticsService,
};
