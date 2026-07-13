'use strict';

const {
  defaultBusinessHours,
  normalizeBusinessContent,
  validateBusinessContent,
} = require('./business-content-schema.cjs');

const PROFILE_FIELDS = Object.freeze([
  'businessName',
  'name',
  'designation',
  'phone',
  'whatsapp',
  'email',
  'website',
  'address',
  'googleMaps',
]);

const FIELD_LIMITS = Object.freeze({
  businessName: 100,
  name: 80,
  designation: 100,
  phone: 24,
  whatsapp: 24,
  email: 254,
  website: 500,
  address: 500,
  googleMaps: 500,
});

class ProfileValidationError extends Error {
  constructor(errors) {
    super('Please correct the highlighted profile fields.');
    this.name = 'ProfileValidationError';
    this.code = 'PROFILE_VALIDATION_FAILED';
    this.status = 400;
    this.errors = errors;
  }
}

function cleanText(value, limit) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, limit);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return /^[+]?[\d\s().-]{7,24}$/.test(value);
}

function validWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function defaultDraft(user = {}) {
  return Object.freeze({
    businessName: '',
    name: cleanText(user.fullName, FIELD_LIMITS.name),
    designation: '',
    phone: cleanText(user.mobile, FIELD_LIMITS.phone),
    whatsapp: cleanText(user.mobile, FIELD_LIMITS.whatsapp),
    email: cleanText(user.email, FIELD_LIMITS.email).toLowerCase(),
    website: '',
    address: '',
    googleMaps: '',
    products: [],
    services: [],
    businessHours: defaultBusinessHours(),
    socialLinks: [],
    teamMembers: [],
    customButtons: [],
  });
}

function normalizeProfileDraft(input) {
  const source =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const profile = {};
  PROFILE_FIELDS.forEach((field) => {
    profile[field] = cleanText(source[field], FIELD_LIMITS[field]);
  });
  profile.email = profile.email.toLowerCase();
  return Object.freeze({
    ...profile,
    ...normalizeBusinessContent(source),
  });
}

/**
 * Validates and normalizes the complete editable draft.
 *
 * Drafts may remain incomplete; publication validation is intentionally
 * deferred to a later phase.
 */
function validateProfileDraft(input) {
  const source =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const profile = normalizeProfileDraft(source);
  const errors = {};
  if (profile.email && !validEmail(profile.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (profile.phone && !validPhone(profile.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }
  if (profile.whatsapp && !validPhone(profile.whatsapp)) {
    errors.whatsapp = 'Enter a valid WhatsApp number.';
  }
  if (profile.website && !validWebUrl(profile.website)) {
    errors.website = 'Website must begin with http:// or https://.';
  }
  if (profile.googleMaps && !validWebUrl(profile.googleMaps)) {
    errors.googleMaps = 'Google Maps must be a valid http:// or https:// URL.';
  }

  const contentValidation = validateBusinessContent(source);
  Object.assign(errors, contentValidation.errors);

  if (Object.keys(errors).length) {
    throw new ProfileValidationError(errors);
  }
  return Object.freeze(profile);
}

module.exports = {
  FIELD_LIMITS,
  PROFILE_FIELDS,
  ProfileValidationError,
  defaultDraft,
  normalizeProfileDraft,
  validateProfileDraft,
};
