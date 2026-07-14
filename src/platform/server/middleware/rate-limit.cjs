'use strict';

function createRateLimiter({
  windowMs,
  maximum,
  scope,
  clock = () => Date.now(),
}) {
  const entries = new Map();
  let operations = 0;

  function cleanup(now) {
    operations += 1;
    if (operations % 500 !== 0) return;
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }

  return function rateLimit(request, response, next) {
    const now = clock();
    cleanup(now);
    const key = `${scope}:${request.ip || request.socket.remoteAddress || 'unknown'}`;
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, maximum - entry.count);
    response.set({
      'RateLimit-Limit': String(maximum),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
    });
    if (entry.count > maximum) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      response.set('Retry-After', String(retryAfter));
      return response.status(429).json({
        error: 'Too many requests. Please try again shortly.',
        code: 'RATE_LIMITED',
        requestId: response.locals.requestId,
      });
    }
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
