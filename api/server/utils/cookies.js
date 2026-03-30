const cookies = require('cookie');

/**
 * Parses Cookie header values with "last value wins" semantics for duplicate keys.
 * This guards against legacy duplicate cookies (same name, different paths) where
 * the default parser keeps the first value.
 * @param {string | undefined} cookieHeader
 * @returns {Record<string, string>}
 */
function parseCookiesWithLastValue(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  const parsed = {};
  const segments = cookieHeader.split(';');

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key) {
      continue;
    }

    /** Parse each cookie pair to keep library decode behavior */
    const pairValue = cookies.parse(trimmed)[key];
    if (pairValue == null) {
      continue;
    }

    /** Last duplicate wins */
    parsed[key] = pairValue;
  }

  return parsed;
}

module.exports = {
  parseCookiesWithLastValue,
};
