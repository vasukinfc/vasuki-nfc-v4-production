'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfUtcDay(value) {
  const date = validDate(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function dayKey(value) {
  return validDate(value).toISOString().slice(0, 10);
}

function weekStart(value) {
  const date = startOfUtcDay(value);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date;
}

function monthStart(value) {
  const date = validDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(value) {
  return validDate(value).toISOString().slice(0, 7);
}

function aggregateSeries(records, {
  eventType,
  starts,
  keyForDate,
  labelForStart,
  valueForRecord = () => 1,
}) {
  const counts = new Map();
  records.forEach((record) => {
    if (eventType && record.eventType !== eventType) return;
    const date = validDate(record.occurredAt);
    if (!date) return;
    const key = keyForDate(date);
    counts.set(key, (counts.get(key) || 0) + valueForRecord(record));
  });
  return Object.freeze(
    starts.map((start) => {
      const key = keyForDate(start);
      return Object.freeze({
        date: labelForStart(start),
        count: counts.get(key) || 0,
      });
    }),
  );
}

function dailySeries(records, eventType, now, days = 30, valueForRecord) {
  const end = startOfUtcDay(now);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  const starts = Array.from({ length: days }, (_, index) =>
    new Date(start.getTime() + index * DAY_MS),
  );
  return aggregateSeries(records, {
    eventType,
    starts,
    keyForDate: dayKey,
    labelForStart: dayKey,
    ...(valueForRecord ? { valueForRecord } : {}),
  });
}

function weeklySeries(records, eventType, now, weeks = 12, valueForRecord) {
  const end = weekStart(now);
  const start = new Date(end.getTime() - (weeks - 1) * 7 * DAY_MS);
  const starts = Array.from({ length: weeks }, (_, index) =>
    new Date(start.getTime() + index * 7 * DAY_MS),
  );
  return aggregateSeries(records, {
    eventType,
    starts,
    keyForDate: (date) => dayKey(weekStart(date)),
    labelForStart: dayKey,
    ...(valueForRecord ? { valueForRecord } : {}),
  });
}

function monthlySeries(records, eventType, now, months = 12, valueForRecord) {
  const end = monthStart(now);
  const starts = Array.from({ length: months }, (_, reverseIndex) => {
    const date = new Date(end);
    date.setUTCMonth(date.getUTCMonth() - (months - 1 - reverseIndex));
    return date;
  });
  return aggregateSeries(records, {
    eventType,
    starts,
    keyForDate: monthKey,
    labelForStart: monthKey,
    ...(valueForRecord ? { valueForRecord } : {}),
  });
}

function timeSeries(records, eventType, now, valueForRecord) {
  return Object.freeze({
    daily: dailySeries(records, eventType, now, 30, valueForRecord),
    weekly: weeklySeries(records, eventType, now, 12, valueForRecord),
    monthly: monthlySeries(records, eventType, now, 12, valueForRecord),
  });
}

function rankEvents(records, eventType, {
  key = (record) => record.itemLabel || record.itemId,
  limit = 10,
} = {}) {
  const counts = new Map();
  records.forEach((record) => {
    if (record.eventType !== eventType) return;
    const label = String(key(record) || '').trim();
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Object.freeze(
    [...counts.entries()]
      .map(([label, count]) => Object.freeze({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      )
      .slice(0, limit),
  );
}

function breakdown(records, eventType, key, allowedValues) {
  const counts = Object.fromEntries(allowedValues.map((value) => [value, 0]));
  records.forEach((record) => {
    if (record.eventType !== eventType) return;
    const value = key(record);
    if (counts[value] !== undefined) counts[value] += 1;
  });
  return Object.freeze(
    allowedValues.map((value) =>
      Object.freeze({ label: value, count: counts[value] }),
    ),
  );
}

function activityHeatmap(records) {
  const cells = Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: 24 }, (_, hour) => ({
      weekday,
      hour,
      count: 0,
    })),
  );
  records.forEach((record) => {
    const date = validDate(record.occurredAt);
    if (!date) return;
    cells[date.getUTCDay()][date.getUTCHours()].count += 1;
  });
  return Object.freeze(cells.flat().map((cell) => Object.freeze(cell)));
}

module.exports = {
  activityHeatmap,
  breakdown,
  dailySeries,
  dayKey,
  monthKey,
  monthlySeries,
  rankEvents,
  timeSeries,
  validDate,
  weeklySeries,
};
