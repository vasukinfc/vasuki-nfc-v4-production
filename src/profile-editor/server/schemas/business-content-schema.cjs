'use strict';

const CONTENT_LIMITS = Object.freeze({
  products: 20,
  services: 20,
  socialLinks: 12,
  teamMembers: 20,
  customButtons: 12,
});

const BUSINESS_DAYS = Object.freeze([
  Object.freeze({ day: 'monday', label: 'Monday' }),
  Object.freeze({ day: 'tuesday', label: 'Tuesday' }),
  Object.freeze({ day: 'wednesday', label: 'Wednesday' }),
  Object.freeze({ day: 'thursday', label: 'Thursday' }),
  Object.freeze({ day: 'friday', label: 'Friday' }),
  Object.freeze({ day: 'saturday', label: 'Saturday' }),
  Object.freeze({ day: 'sunday', label: 'Sunday' }),
]);

function cleanText(value, limit) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, limit);
}

function cleanId(value) {
  return cleanText(value, 80).replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanMediaId(value) {
  const mediaId = cleanText(value, 80);
  return /^MED-[a-f0-9-]{36}$/i.test(mediaId) ? mediaId : '';
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sourceList(input, field) {
  return Array.isArray(input?.[field]) ? input[field] : [];
}

function normalizeProducts(input) {
  return sourceList(input, 'products')
    .slice(0, CONTENT_LIMITS.products)
    .map((item) => ({
      id: cleanId(item?.id),
      name: cleanText(item?.name, 120),
      description: cleanText(item?.description, 500),
      price: cleanText(item?.price, 40),
      imageMediaId: cleanMediaId(item?.imageMediaId),
    }));
}

function normalizeServices(input) {
  return sourceList(input, 'services')
    .slice(0, CONTENT_LIMITS.services)
    .map((item) => ({
      id: cleanId(item?.id),
      name: cleanText(item?.name, 120),
      description: cleanText(item?.description, 500),
      price: cleanText(item?.price, 40),
    }));
}

function normalizeSocialLinks(input) {
  return sourceList(input, 'socialLinks')
    .slice(0, CONTENT_LIMITS.socialLinks)
    .map((item) => ({
      id: cleanId(item?.id),
      platform: cleanText(item?.platform, 60),
      url: cleanText(item?.url, 500),
    }));
}

function normalizeTeamMembers(input) {
  return sourceList(input, 'teamMembers')
    .slice(0, CONTENT_LIMITS.teamMembers)
    .map((item) => ({
      id: cleanId(item?.id),
      name: cleanText(item?.name, 100),
      role: cleanText(item?.role, 100),
      bio: cleanText(item?.bio, 500),
      imageMediaId: cleanMediaId(item?.imageMediaId),
    }));
}

function normalizeCustomButtons(input) {
  return sourceList(input, 'customButtons')
    .slice(0, CONTENT_LIMITS.customButtons)
    .map((item) => ({
      id: cleanId(item?.id),
      label: cleanText(item?.label, 80),
      url: cleanText(item?.url, 500),
    }));
}

function defaultBusinessHours() {
  return BUSINESS_DAYS.map(({ day, label }) => ({
    day,
    label,
    enabled: false,
    open: '09:00',
    close: '18:00',
  }));
}

function normalizeBusinessHours(input) {
  const source = sourceList(input, 'businessHours');
  return BUSINESS_DAYS.map(({ day, label }) => {
    const item = source.find((candidate) => candidate?.day === day) || {};
    return {
      day,
      label,
      enabled: item.enabled === true,
      open: cleanText(item.open || '09:00', 5),
      close: cleanText(item.close || '18:00', 5),
    };
  });
}

function normalizeBusinessContent(input = {}) {
  return Object.freeze({
    products: Object.freeze(normalizeProducts(input)),
    services: Object.freeze(normalizeServices(input)),
    businessHours: Object.freeze(normalizeBusinessHours(input)),
    socialLinks: Object.freeze(normalizeSocialLinks(input)),
    teamMembers: Object.freeze(normalizeTeamMembers(input)),
    customButtons: Object.freeze(normalizeCustomButtons(input)),
  });
}

function validateIds(items, field, errors) {
  const ids = new Set();
  items.forEach((item, index) => {
    if (!item.id) {
      errors[`${field}.${index}.id`] = 'Item identifier is required.';
    } else if (ids.has(item.id)) {
      errors[`${field}.${index}.id`] = 'Item identifier must be unique.';
    }
    ids.add(item.id);
  });
}

function validateBusinessContent(input = {}) {
  const content = normalizeBusinessContent(input);
  const errors = {};

  Object.entries(CONTENT_LIMITS).forEach(([field, limit]) => {
    if (sourceList(input, field).length > limit) {
      errors[`${field}._limit`] = `Maximum ${limit} items allowed.`;
    }
    validateIds(content[field], field, errors);
  });

  content.products.forEach((item, index) => {
    if (!item.name) {
      errors[`products.${index}.name`] = 'Product name is required.';
    }
  });

  content.services.forEach((item, index) => {
    if (!item.name) {
      errors[`services.${index}.name`] = 'Service name is required.';
    }
  });

  content.socialLinks.forEach((item, index) => {
    if (!item.platform) {
      errors[`socialLinks.${index}.platform`] = 'Platform name is required.';
    }
    if (!item.url || !validHttpUrl(item.url)) {
      errors[`socialLinks.${index}.url`] =
        'Enter a valid http:// or https:// URL.';
    }
  });

  content.teamMembers.forEach((item, index) => {
    if (!item.name) {
      errors[`teamMembers.${index}.name`] = 'Team member name is required.';
    }
  });

  content.customButtons.forEach((item, index) => {
    if (!item.label) {
      errors[`customButtons.${index}.label`] = 'Button label is required.';
    }
    if (!item.url || !validHttpUrl(item.url)) {
      errors[`customButtons.${index}.url`] =
        'Enter a valid http:// or https:// URL.';
    }
  });

  content.businessHours.forEach((item, index) => {
    if (!item.enabled) return;
    if (!/^\d{2}:\d{2}$/.test(item.open)) {
      errors[`businessHours.${index}.open`] = 'Opening time is required.';
    }
    if (!/^\d{2}:\d{2}$/.test(item.close)) {
      errors[`businessHours.${index}.close`] = 'Closing time is required.';
    }
    if (item.open === item.close) {
      errors[`businessHours.${index}.close`] =
        'Opening and closing times must differ.';
    }
  });

  return Object.freeze({
    content,
    errors: Object.freeze(errors),
    valid: Object.keys(errors).length === 0,
  });
}

module.exports = {
  BUSINESS_DAYS,
  CONTENT_LIMITS,
  defaultBusinessHours,
  normalizeBusinessContent,
  validateBusinessContent,
};
