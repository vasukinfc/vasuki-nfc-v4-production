'use strict';

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|api[-_]?key|pin/i;

function redact(value, depth = 0) {
  if (depth > 4) return '[DEPTH_LIMIT]';
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1),
    ]),
  );
}

function createLogger({ enabled = true, level = 'info' } = {}) {
  const threshold = LEVELS[level] || LEVELS.info;

  function write(severity, event, fields = {}) {
    if (!enabled || LEVELS[severity] < threshold) return;
    const record = {
      timestamp: new Date().toISOString(),
      severity,
      event: String(event || 'application_event'),
      ...redact(fields),
    };
    const line = JSON.stringify(record);
    if (severity === 'error') console.error(line);
    else if (severity === 'warn') console.warn(line);
    else console.log(line);
  }

  return Object.freeze({
    debug: (event, fields) => write('debug', event, fields),
    error: (event, fields) => write('error', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
  });
}

module.exports = {
  createLogger,
};
