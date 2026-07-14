/**
 * Client validation aligned with the protected server schema.
 *
 * Drafts may remain incomplete. Validation only rejects malformed values and
 * never applies publication requirements.
 */

import { PROFILE_FIELDS } from '../state/editor-state.js';
import {
  normalizeBusinessContent,
  validateBusinessContent
} from '../content/content-schema.js';

export const FIELD_LIMITS = Object.freeze({
  businessName: 100,
  name: 80,
  designation: 100,
  phone: 24,
  whatsapp: 24,
  email: 254,
  website: 500,
  address: 500,
  googleMaps: 500
});

function cleanText(value, limit) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, limit);
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeProfile(input = {}) {
  const profile = Object.fromEntries(
    PROFILE_FIELDS.map((field) => [
      field,
      cleanText(input[field], FIELD_LIMITS[field])
    ])
  );
  profile.email = profile.email.toLowerCase();
  return {
    ...profile,
    ...normalizeBusinessContent(input)
  };
}

export function validateProfile(input = {}) {
  const profile = normalizeProfile(input);
  const errors = {};

  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (profile.phone && !/^[+]?[\d\s().-]{7,24}$/.test(profile.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }

  if (profile.whatsapp && !/^[+]?[\d\s().-]{7,24}$/.test(profile.whatsapp)) {
    errors.whatsapp = 'Enter a valid WhatsApp number.';
  }

  if (profile.website && !validHttpUrl(profile.website)) {
    errors.website = 'Website must begin with http:// or https://.';
  }

  if (profile.googleMaps && !validHttpUrl(profile.googleMaps)) {
    errors.googleMaps = 'Google Maps must be a valid http:// or https:// URL.';
  }

  const contentValidation = validateBusinessContent(input);
  Object.assign(errors, contentValidation.errors);

  return Object.freeze({
    errors: Object.freeze(errors),
    profile: Object.freeze({
      ...profile,
      ...contentValidation.content
    }),
    valid: Object.keys(errors).length === 0
  });
}

export function validateField(field, input = {}) {
  return validateProfile(input).errors[field] || '';
}
