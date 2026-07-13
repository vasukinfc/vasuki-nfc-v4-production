function number(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function dateLabel(value, period) {
  const suffix = period === 'monthly' ? '-01' : '';
  const date = new Date(`${value}${suffix}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    ...(period === 'monthly' ? { year: '2-digit' } : { day: 'numeric' }),
  }).format(date);
}

export function renderTimeChart(
  container,
  series,
  { period = 'daily', noun = 'views', formatValue = number } = {},
) {
  container.replaceChildren();
  const safeSeries = Array.isArray(series) ? series : [];
  const maximum = Math.max(
    1,
    ...safeSeries.map((point) => Number(point.count) || 0),
  );
  safeSeries.forEach((point, index) => {
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'analytics-chart-bar';
    bar.style.setProperty(
      '--bar-height',
      `${((Number(point.count) || 0) / maximum) * 100}%`,
    );
    const label = dateLabel(point.date, period);
    bar.title = `${label}: ${formatValue(point.count)} ${noun}`;
    bar.setAttribute('aria-label', bar.title);
    if (
      index % Math.max(1, Math.ceil(safeSeries.length / 6)) === 0 ||
      index === safeSeries.length - 1
    ) {
      bar.dataset.label = label;
    }
    container.append(bar);
  });
}

export function renderBreakdown(
  container,
  items,
  { labels = {}, totalLabel = 'events' } = {},
) {
  container.replaceChildren();
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.reduce(
    (sum, item) => sum + (Number(item.count) || 0),
    0,
  );
  safeItems.forEach((item) => {
    const row = document.createElement('article');
    const heading = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = labels[item.label] || item.label;
    const value = document.createElement('span');
    const percent = total ? Math.round((item.count / total) * 100) : 0;
    value.textContent = `${number(item.count)} · ${percent}%`;
    heading.append(label, value);
    const track = document.createElement('div');
    track.className = 'analytics-breakdown-track';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    track.append(fill);
    row.append(heading, track);
    row.setAttribute(
      'aria-label',
      `${label.textContent}: ${number(item.count)} ${totalLabel}, ${percent}%`,
    );
    container.append(row);
  });
}

export function renderRanking(
  container,
  items,
  {
    labelKey = 'label',
    valueKey = 'count',
    valueLabel = 'interactions',
    emptyMessage = 'No activity recorded yet.',
  } = {},
) {
  container.replaceChildren();
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    const empty = document.createElement('p');
    empty.className = 'analytics-empty';
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }
  safeItems.forEach((item, index) => {
    const row = document.createElement('article');
    const rank = document.createElement('span');
    rank.className = 'analytics-rank';
    rank.textContent = String(index + 1);
    const label = document.createElement('strong');
    label.textContent = item[labelKey] || 'Unknown';
    const value = document.createElement('span');
    value.textContent = `${number(item[valueKey])} ${valueLabel}`;
    row.append(rank, label, value);
    container.append(row);
  });
}
