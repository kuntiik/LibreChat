const crypto = require('crypto');
const { registerUser } = require('~/server/services/AuthService');
const { findUser } = require('~/models');

const DEFAULT_PASSWORD_LENGTH = 16;
const DEFAULT_MAX_USERS = 500;

const DEFAULT_EMAIL_TEMPLATE = 'Email: {{email}} Password: {{password}}';

function parseBoolean(value, fallback = true) {
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
    return false;
  }
  return fallback;
}

function parseCsv(content, delimiter = ',') {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  const normalized = String(content || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    if (char !== '\r') {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function normalizeRowObject(headerMap, row) {
  const getField = (...aliases) => {
    for (const alias of aliases) {
      const index = headerMap[alias];
      if (index != null) {
        return (row[index] || '').trim();
      }
    }
    return '';
  };

  return {
    email: getField('email', 'e-mail', 'mail'),
    name: getField('name', 'full_name', 'full name', 'display_name'),
    firstName: getField('first_name', 'first name', 'firstname', 'given_name', 'given name'),
    lastName: getField('last_name', 'last name', 'lastname', 'family_name', 'family name', 'surname'),
    username: getField('username', 'user_name', 'login', 'user'),
  };
}

function getProvidedName(source = {}) {
  const directCandidates = [
    source.name,
    source.fullName,
    source.full_name,
    source.displayName,
    source.display_name,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  const firstName =
    source.firstName || source.first_name || source.firstname || source.givenName || source.given_name;
  const lastName =
    source.lastName || source.last_name || source.lastname || source.familyName || source.family_name || source.surname;

  const combined = [firstName, lastName]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' ')
    .trim();

  return combined || '';
}

function rowsToUsers(csv, delimiter = ',') {
  const rows = parseCsv(csv, delimiter);
  if (rows.length <= 1) {
    throw new Error('CSV must contain a header row and at least one data row');
  }

  const headerRow = rows[0].map((cell) => cell.trim().toLowerCase());
  const headerMap = headerRow.reduce((map, header, index) => {
    map[header] = index;
    return map;
  }, {});

  if (headerMap.email == null && headerMap['e-mail'] == null && headerMap.mail == null) {
    throw new Error('CSV header must include "email"');
  }

  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((cell) => (cell || '').trim().length > 0)) {
      continue;
    }
    users.push({
      row: i + 1,
      ...normalizeRowObject(headerMap, row),
    });
  }
  return users;
}

function ensureName(name, email, rowNumber) {
  const trimmed = (name || '').trim();
  if (trimmed.length >= 3) {
    return trimmed.slice(0, 80);
  }

  const emailPrefix = (email.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
  if (emailPrefix.length >= 3) {
    return emailPrefix.slice(0, 80);
  }

  return `User ${rowNumber}`;
}

function sanitizeUsername(username) {
  const normalized = (username || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 80);

  if (normalized.length < 2) {
    return null;
  }
  return normalized;
}

function generatePassword(length = DEFAULT_PASSWORD_LENGTH) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*()';
  const all = `${upper}${lower}${digits}${symbols}`;

  const safeLength = Math.max(12, Math.min(128, Number(length) || DEFAULT_PASSWORD_LENGTH));
  const chars = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  while (chars.length < safeLength) {
    chars.push(all[crypto.randomInt(all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const swapIndex = crypto.randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[swapIndex];
    chars[swapIndex] = tmp;
  }

  return chars.join('');
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    if (data[key] == null) {
      return '';
    }
    return String(data[key]);
  });
}

function defaultLoginUrl() {
  const domainClient = (process.env.DOMAIN_CLIENT || '').replace(/\/+$/, '');
  return domainClient ? `${domainClient}/login` : '/login';
}

async function bulkCreateUsers(payload = {}) {
  const {
    csv,
    users,
    delimiter = ',',
    template = DEFAULT_EMAIL_TEMPLATE,
    provider = 'local',
    dryRun = false,
    emailVerified = true,
    passwordLength = DEFAULT_PASSWORD_LENGTH,
    loginUrl = defaultLoginUrl(),
    maxUsers = DEFAULT_MAX_USERS,
  } = payload;

  const safeDelimiter = typeof delimiter === 'string' && delimiter.length > 0 ? delimiter[0] : ',';
  const safeTemplate =
    typeof template === 'string' && template.trim().length > 0 ? template : DEFAULT_EMAIL_TEMPLATE;
  const safeProvider =
    typeof provider === 'string' && provider.trim().length > 0 ? provider.trim() : 'local';
  const safeLoginUrl =
    typeof loginUrl === 'string' && loginUrl.trim().length > 0 ? loginUrl.trim() : defaultLoginUrl();

  let sourceUsers = Array.isArray(users) ? users : null;
  if (!sourceUsers && csv) {
    sourceUsers = rowsToUsers(csv, safeDelimiter);
  }

  if (!sourceUsers || sourceUsers.length === 0) {
    throw new Error('Provide either a non-empty "users" array or a valid "csv" string');
  }

  const userLimit = Number(maxUsers) > 0 ? Number(maxUsers) : DEFAULT_MAX_USERS;
  if (sourceUsers.length > userLimit) {
    throw new Error(`Too many users in one request. Max allowed is ${userLimit}`);
  }

  const safeDryRun = parseBoolean(dryRun, false);
  const safeEmailVerified = parseBoolean(emailVerified, true);
  const appName = process.env.APP_TITLE || 'LibreChat';

  const summary = {
    total: sourceUsers.length,
    created: 0,
    skipped: 0,
    errors: 0,
    dryRun: 0,
  };

  const results = [];
  const reservedEmails = new Set();

  for (let i = 0; i < sourceUsers.length; i++) {
    const source = sourceUsers[i] || {};
    const rowNumber = source.row || i + 1;
    const email = String(source.email || '')
      .trim()
      .toLowerCase();

    const result = {
      row: rowNumber,
      email,
      name: '',
      username: '',
      password: '',
      status: '',
      message: '',
      emailText: '',
    };

    if (!email || !email.includes('@')) {
      result.status = 'invalid';
      result.message = 'Missing or invalid email';
      results.push(result);
      summary.errors += 1;
      continue;
    }

    if (reservedEmails.has(email)) {
      result.status = 'invalid';
      result.message = 'Duplicate email in this request';
      results.push(result);
      summary.errors += 1;
      continue;
    }
    reservedEmails.add(email);

    const existingByEmail = await findUser({ email }, 'email _id');
    if (existingByEmail) {
      result.status = 'skipped_existing';
      result.message = 'User with this email already exists';
      results.push(result);
      summary.skipped += 1;
      continue;
    }

    const name = ensureName(getProvidedName(source), email, rowNumber);
    const username = sanitizeUsername(source.username || '');
    const password = generatePassword(passwordLength);
    const renderedEmail = renderTemplate(safeTemplate, {
      appName,
      email,
      name,
      username: username || '',
      password,
      loginUrl: safeLoginUrl,
    });

    result.name = name;
    result.username = username || '';
    result.password = password;
    result.emailText = renderedEmail;

    if (safeDryRun) {
      result.status = 'dry_run';
      result.message = 'Validated and prepared without creating user';
      results.push(result);
      summary.dryRun += 1;
      continue;
    }

    try {
      const response = await registerUser(
        {
          email,
          password,
          confirm_password: password,
          name,
          username,
          provider: safeProvider,
        },
        { emailVerified: safeEmailVerified },
      );

      if (response.status !== 200) {
        result.status = 'error';
        result.message = response.message || 'Registration failed';
        results.push(result);
        summary.errors += 1;
        continue;
      }

      result.status = 'created';
      result.message = 'User created successfully';
      results.push(result);
      summary.created += 1;
    } catch (error) {
      result.status = 'error';
      result.message = error.message || 'Unknown registration error';
      results.push(result);
      summary.errors += 1;
    }
  }

  return {
    summary,
    results,
  };
}

module.exports = {
  bulkCreateUsers,
  DEFAULT_EMAIL_TEMPLATE,
};
