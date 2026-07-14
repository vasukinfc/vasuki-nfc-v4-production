'use strict';

const express = require('express');

const ALLOWED_REVIEW_FIELDS = Object.freeze(['name', 'text', 'rating']);
const ALLOWED_REVIEW_FIELD_SET = new Set(ALLOWED_REVIEW_FIELDS);

class ReviewSubmissionError extends Error {
  constructor(message, {
    status = 400,
    code = 'REVIEW_SUBMISSION_INVALID',
    details,
  } = {}) {
    super(message);
    this.name = 'ReviewSubmissionError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateReviewSubmissionPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new ReviewSubmissionError('Review payload must be a JSON object.', {
      code: 'REVIEW_PAYLOAD_INVALID',
    });
  }

  const unknownFields = Object.keys(payload).filter(
    (field) => !ALLOWED_REVIEW_FIELD_SET.has(field),
  );
  if (unknownFields.length > 0) {
    throw new ReviewSubmissionError('Review submission accepts only name, text, and rating.', {
      code: 'REVIEW_FIELDS_INVALID',
      details: { allowedFields: ALLOWED_REVIEW_FIELDS },
    });
  }

  if (typeof payload.name !== 'string') {
    throw new ReviewSubmissionError('Name must be 2 to 80 characters.', {
      code: 'REVIEW_NAME_INVALID',
    });
  }

  if (typeof payload.text !== 'string') {
    throw new ReviewSubmissionError('Review must be 10 to 1000 characters.', {
      code: 'REVIEW_TEXT_INVALID',
    });
  }

  const name = payload.name.trim();
  const text = payload.text.trim();
  const rating = payload.rating;

  if (name.length < 2 || name.length > 80) {
    throw new ReviewSubmissionError('Name must be 2 to 80 characters.', {
      code: 'REVIEW_NAME_INVALID',
    });
  }

  if (text.length < 10 || text.length > 1000) {
    throw new ReviewSubmissionError('Review must be 10 to 1000 characters.', {
      code: 'REVIEW_TEXT_INVALID',
    });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ReviewSubmissionError('Rating must be an integer from 1 to 5.', {
      code: 'REVIEW_RATING_INVALID',
    });
  }

  return Object.freeze({ name, text, rating });
}

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim();
  return raw ? raw.replace(/\/+$/, '') : '';
}

function createSupabaseReviewRepository({
  environment = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const supabaseUrl = normalizeSupabaseUrl(environment.SUPABASE_URL);
  const supabaseAnonKey = String(environment.SUPABASE_ANON_KEY || '').trim();

  return Object.freeze({
    async submit(review) {
      if (!supabaseUrl || !supabaseAnonKey || typeof fetchImpl !== 'function') {
        throw new ReviewSubmissionError('Review submission is not available right now.', {
          status: 503,
          code: 'REVIEW_SUBMISSION_UNAVAILABLE',
        });
      }

      const response = await fetchImpl(`${supabaseUrl}/rest/v1/reviews`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(review),
      });

      if (!response.ok) {
        throw new ReviewSubmissionError('Review could not be submitted right now.', {
          status: 502,
          code: 'REVIEW_SUBMISSION_FAILED',
        });
      }

      return Object.freeze({ accepted: true });
    },
  });
}

function sendSuccess(response, data, { status = 200 } = {}) {
  if (typeof response.apiSuccess === 'function') {
    return response.apiSuccess(data, { status });
  }
  return response.status(status).json({ success: true, data });
}

function sendError(response, error) {
  const status = Number(error.status) || 400;
  const message = error.message || 'Review submission failed.';
  const code = error.code || 'REVIEW_SUBMISSION_FAILED';
  if (typeof response.apiError === 'function') {
    return response.apiError(message, {
      status,
      code,
      details: error.details,
    });
  }
  return response.status(status).json({
    error: message,
    code,
    ...(error.details ? { details: error.details } : {}),
  });
}

function createReviewSubmissionHandler({ repository }) {
  if (!repository || typeof repository.submit !== 'function') {
    throw new Error('A review repository with submit() is required.');
  }

  return async function submitReview(request, response) {
    try {
      const review = validateReviewSubmissionPayload(request.body || {});
      await repository.submit(review);
      return sendSuccess(response, { accepted: true }, { status: 201 });
    } catch (error) {
      if (error instanceof ReviewSubmissionError) {
        return sendError(response, error);
      }
      console.error('Review submission failed:', error);
      return sendError(response, new ReviewSubmissionError('Review submission failed.', {
        status: 500,
        code: 'REVIEW_SUBMISSION_FAILED',
      }));
    }
  };
}

function createPublicReviewRouter({ repository, rateLimit }) {
  const router = express.Router();
  const middleware = [];
  if (typeof rateLimit === 'function') middleware.push(rateLimit);
  middleware.push(createReviewSubmissionHandler({ repository }));
  router.post('/reviews', ...middleware);
  return router;
}

module.exports = {
  ALLOWED_REVIEW_FIELDS,
  ReviewSubmissionError,
  createPublicReviewRouter,
  createReviewSubmissionHandler,
  createSupabaseReviewRepository,
  validateReviewSubmissionPayload,
};