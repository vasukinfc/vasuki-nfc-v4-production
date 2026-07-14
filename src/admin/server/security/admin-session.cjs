'use strict';

const crypto = require('crypto');

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashSessionToken(token, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(String(token || ''))
    .digest('hex');
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return cookies;

      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function readSessionCookie(request, cookieName) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[cookieName] || '';
}

function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
  };
}

function setSessionCookie(response, sessionToken, config) {
  response.cookie(config.cookieName, sessionToken, {
    ...cookieOptions(config),
    maxAge: config.sessionDurationMs,
  });
}

function clearSessionCookie(response, config) {
  response.clearCookie(config.cookieName, cookieOptions(config));
}

module.exports = {
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  readSessionCookie,
  setSessionCookie,
};
