'use strict';

const MEGABYTE = 1024 * 1024;

const MEDIA_POLICIES = Object.freeze({
  logo: Object.freeze({
    label: 'Logo',
    maxBytes: 3 * MEGABYTE,
    maxItems: 1,
    allowedMimes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  }),
  coverImage: Object.freeze({
    label: 'Cover image',
    maxBytes: 6 * MEGABYTE,
    maxItems: 1,
    allowedMimes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  }),
  gallery: Object.freeze({
    label: 'Gallery image',
    maxBytes: 6 * MEGABYTE,
    maxItems: 12,
    allowedMimes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  }),
  productImage: Object.freeze({
    label: 'Product image',
    maxBytes: 6 * MEGABYTE,
    maxItems: 20,
    allowedMimes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  }),
  teamImage: Object.freeze({
    label: 'Team image',
    maxBytes: 6 * MEGABYTE,
    maxItems: 20,
    allowedMimes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  }),
  pdfCatalog: Object.freeze({
    label: 'PDF catalog',
    maxBytes: 12 * MEGABYTE,
    maxItems: 1,
    allowedMimes: Object.freeze(['application/pdf']),
  }),
  paymentQr: Object.freeze({
    label: 'Payment QR',
    maxBytes: 3 * MEGABYTE,
    maxItems: 1,
    allowedMimes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  }),
});

const MIME_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

class MediaValidationError extends Error {
  constructor(message, code = 'MEDIA_VALIDATION_FAILED', status = 400) {
    super(message);
    this.name = 'MediaValidationError';
    this.code = code;
    this.status = status;
  }
}

function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'image/png';
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }

  return null;
}

function cleanOriginalName(value, fallbackExtension) {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()
    .slice(0, 120);
  return cleaned || `upload.${fallbackExtension}`;
}

function validateMediaFile({ kind, buffer, declaredMime, originalName }) {
  const policy = MEDIA_POLICIES[kind];
  if (!policy) {
    throw new MediaValidationError('Unsupported media category.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new MediaValidationError('Choose a non-empty file to upload.');
  }
  if (buffer.length > policy.maxBytes) {
    throw new MediaValidationError(
      `${policy.label} must be ${Math.floor(policy.maxBytes / MEGABYTE)} MB or smaller.`,
      'MEDIA_TOO_LARGE',
      413,
    );
  }

  const detectedMime = detectMime(buffer);
  if (!detectedMime || !policy.allowedMimes.includes(detectedMime)) {
    throw new MediaValidationError(
      `${policy.label} file type is not allowed.`,
      'MEDIA_TYPE_NOT_ALLOWED',
    );
  }

  const normalizedDeclaredMime = String(declaredMime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (
    normalizedDeclaredMime &&
    normalizedDeclaredMime !== 'application/octet-stream' &&
    normalizedDeclaredMime !== detectedMime
  ) {
    throw new MediaValidationError(
      'The file content does not match its declared MIME type.',
      'MEDIA_MIME_MISMATCH',
    );
  }

  const extension = MIME_EXTENSIONS[detectedMime];
  return Object.freeze({
    extension,
    mime: detectedMime,
    originalName: cleanOriginalName(originalName, extension),
    policy,
    size: buffer.length,
  });
}

module.exports = {
  MEDIA_POLICIES,
  MediaValidationError,
  validateMediaFile,
};
