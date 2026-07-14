'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');

const {
  createRateLimiter,
} = require('../src/platform/server/middleware/rate-limit.cjs');

const {
  createPublicReviewRouter,
  validateReviewSubmissionPayload,
} = require('../src/reviews/server/review-routes.cjs');

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

async function postJson(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { response, body };
}

async function withReviewApp(repository, callback, { rateLimit } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', createPublicReviewRouter({ repository, rateLimit }));
  const { server, baseUrl } = await listen(app);
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('valid review payload is trimmed and accepted by backend endpoint', async () => {
  let storedReview;
  await withReviewApp({
    async submit(review) {
      storedReview = review;
      return { accepted: true };
    },
  }, async (baseUrl) => {
    const { response, body } = await postJson(baseUrl, {
      name: '  Happy Customer  ',
      text: '  This NFC card experience was excellent.  ',
      rating: 5,
    });

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.deepEqual(storedReview, {
      name: 'Happy Customer',
      text: 'This NFC card experience was excellent.',
      rating: 5,
    });
  });
});

test('invalid name length is rejected', () => {
  assert.throws(
    () => validateReviewSubmissionPayload({ name: 'A', text: 'This review is long enough.', rating: 5 }),
    /Name must be 2 to 80 characters/,
  );
});

test('invalid text length is rejected', () => {
  assert.throws(
    () => validateReviewSubmissionPayload({ name: 'Customer', text: 'Too short', rating: 5 }),
    /Review must be 10 to 1000 characters/,
  );
});

test('invalid rating range is rejected', () => {
  assert.throws(
    () => validateReviewSubmissionPayload({ name: 'Customer', text: 'This review is long enough.', rating: 6 }),
    /Rating must be an integer from 1 to 5/,
  );
});

test('non-integer rating is rejected', () => {
  assert.throws(
    () => validateReviewSubmissionPayload({ name: 'Customer', text: 'This review is long enough.', rating: 4.5 }),
    /Rating must be an integer from 1 to 5/,
  );
});

test('unknown additional fields are rejected before submission', async () => {
  await withReviewApp({
    async submit() {
      throw new Error('Unknown fields should not be submitted');
    },
  }, async (baseUrl) => {
    const { response, body } = await postJson(baseUrl, {
      name: 'Customer',
      text: 'This review is long enough.',
      rating: 5,
      nickname: 'extra',
    });

    assert.equal(response.status, 400);
    assert.equal(body.code, 'REVIEW_FIELDS_INVALID');
  });
});

test('privileged moderation fields are rejected', async () => {
  await withReviewApp({
    async submit() {
      throw new Error('Privileged fields should not be submitted');
    },
  }, async (baseUrl) => {
    const { response, body } = await postJson(baseUrl, {
      name: 'Customer',
      text: 'This review is long enough.',
      rating: 5,
      approved: true,
      featured: true,
      admin_reply: 'approved',
      created_at: '2026-07-14T00:00:00.000Z',
    });

    assert.equal(response.status, 400);
    assert.equal(body.code, 'REVIEW_FIELDS_INVALID');
  });
});
test('normal review submissions are allowed within the limit', async () => {
  let storedCount = 0;
  const rateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    maximum: 2,
    scope: 'review-submission-test-allowed',
  });

  await withReviewApp({
    async submit() {
      storedCount += 1;
      return { accepted: true };
    },
  }, async (baseUrl) => {
    const first = await postJson(baseUrl, {
      name: 'Customer',
      text: 'This review is long enough.',
      rating: 5,
    });
    const second = await postJson(baseUrl, {
      name: 'Customer Two',
      text: 'This second review is long enough.',
      rating: 4,
    });

    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 201);
    assert.equal(storedCount, 2);
  }, { rateLimit });
});

test('review submissions above the limit return 429 without exposing limiter internals', async () => {
  let storedCount = 0;
  const rateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    maximum: 1,
    scope: 'review-submission-test-limited',
  });

  await withReviewApp({
    async submit() {
      storedCount += 1;
      return { accepted: true };
    },
  }, async (baseUrl) => {
    const first = await postJson(baseUrl, {
      name: 'Customer',
      text: 'This review is long enough.',
      rating: 5,
    });
    const second = await postJson(baseUrl, {
      name: 'Customer Two',
      text: 'This second review is long enough.',
      rating: 4,
    });

    assert.equal(first.response.status, 201);
    assert.equal(second.response.status, 429);
    assert.equal(second.body.code, 'RATE_LIMITED');
    assert.equal(JSON.stringify(second.body).includes('review-submission-test-limited'), false);
    assert.equal(storedCount, 1);
  }, { rateLimit });
});

test('review submission limiter does not affect unrelated API routes', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', createPublicReviewRouter({
    repository: {
      async submit() {
        return { accepted: true };
      },
    },
    rateLimit: createRateLimiter({
      windowMs: 60 * 1000,
      maximum: 1,
      scope: 'review-submission-test-unrelated',
    }),
  }));
  app.get('/api/unrelated-health', (_request, response) => {
    response.json({ ok: true });
  });

  const { server, baseUrl } = await listen(app);
  try {
    await postJson(baseUrl, {
      name: 'Customer',
      text: 'This review is long enough.',
      rating: 5,
    });
    await postJson(baseUrl, {
      name: 'Customer Two',
      text: 'This second review is long enough.',
      rating: 4,
    });

    const response = await fetch(`${baseUrl}/api/unrelated-health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(response.headers.has('ratelimit-limit'), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});