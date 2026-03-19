const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { registerUser } = require('~/server/services/AuthService');
const { silentExit } = require('./helpers');
const connect = require('./connect');

const DEFAULT_PASSWORD_LENGTH = 16;
const DEFAULT_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'user-credentials-email.txt');

function defaultLoginUrl() {
  const domainClient = (process.env.DOMAIN_CLIENT || '').replace(/\/+$/, '');
  return domainClient ? `${domainClient}/login` : '/login';
}

function printUsage() {
  console.purple('----------------------------------------');
  console.purple('Bulk Create Users from CSV');
  console.purple('----------------------------------------');
  console.orange('Usage:');
  console.orange(
    'npm run create-users-csv -- --csv <path-to-users.csv> [--template <path>] [--output <dir>]',
  );
  console.orange(
    'Optional: --delimiter=, --email-verified=true --provider=local --login-url=<url> --dry-run',
  );
  console.orange('CSV headers: email (required), name (optional), username (optional)');
  console.purple('----------------------------------------');
}

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

function parseArgs(argv) {
  const args = {
    csvPath: '',
    templatePath: DEFAULT_TEMPLATE_PATH,
    outputDir: '',
    delimiter: ',',
    emailVerified: true,
    provider: 'local',
    loginUrl: defaultLoginUrl(),
    dryRun: false,
    passwordLength: DEFAULT_PASSWORD_LENGTH,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--csv' && argv[i + 1]) {
      args.csvPath = argv[++i];
      continue;
    }

    if (arg === '--template' && argv[i + 1]) {
      args.templatePath = argv[++i];
      continue;
    }

    if (arg === '--output' && argv[i + 1]) {
      args.outputDir = argv[++i];
      continue;
    }

    if (arg === '--provider' && argv[i + 1]) {
      args.provider = argv[++i];
      continue;
    }

    if (arg === '--login-url' && argv[i + 1]) {
      args.loginUrl = argv[++i];
      continue;
    }

    if (arg.startsWith('--delimiter=')) {
      args.delimiter = arg.split('=')[1] || ',';
      continue;
    }

    if (arg.startsWith('--email-verified=')) {
      args.emailVerified = parseBoolean(arg.split('=')[1], true);
      continue;
    }

    if (arg.startsWith('--password-length=')) {
      const passwordLength = parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(passwordLength) && passwordLength >= 12 && passwordLength <= 128) {
        args.passwordLength = passwordLength;
      }
      continue;
    }

    if (!arg.startsWith('--') && !args.csvPath) {
      args.csvPath = arg;
    }
  }

  return args;
}

function parseCsv(content, delimiter = ',') {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  const normalized = content.replace(/^\uFEFF/, '');

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

function escapeCsvField(value) {
  if (value == null) {
    return '';
  }
  const text = String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(records, headers) {
  const headerRow = headers.join(',');
  const rows = records.map((record) =>
    headers.map((header) => escapeCsvField(record[header] ?? '')).join(','),
  );
  return [headerRow, ...rows].join('\n');
}

function padTimestamp(number) {
  return String(number).padStart(2, '0');
}

function createTimestampLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = padTimestamp(date.getMonth() + 1);
  const day = padTimestamp(date.getDate());
  const hour = padTimestamp(date.getHours());
  const minute = padTimestamp(date.getMinutes());
  const second = padTimestamp(date.getSeconds());
  return `${year}${month}${day}-${hour}${minute}${second}`;
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
  return (username || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 80);
}

async function findUniqueUsername(baseUsername, rowNumber, reservedUsernames) {
  let base = sanitizeUsername(baseUsername);
  if (!base || base.length < 2) {
    base = `user${rowNumber}`;
  }
  if (base.length < 2) {
    base = `usr${rowNumber}`;
  }

  let candidate = base;
  let suffix = 1;
  while (reservedUsernames.has(candidate) || (await User.findOne({ username: candidate }))) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }

  reservedUsernames.add(candidate);
  return candidate;
}

function generatePassword(length = DEFAULT_PASSWORD_LENGTH) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*()';
  const all = `${upper}${lower}${digits}${symbols}`;

  const safeLength = Math.max(12, Math.min(128, length));
  const requiredChars = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  while (requiredChars.length < safeLength) {
    requiredChars.push(all[crypto.randomInt(all.length)]);
  }

  for (let i = requiredChars.length - 1; i > 0; i--) {
    const swapIndex = crypto.randomInt(i + 1);
    const tmp = requiredChars[i];
    requiredChars[i] = requiredChars[swapIndex];
    requiredChars[swapIndex] = tmp;
  }

  return requiredChars.join('');
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    if (data[key] == null) {
      return '';
    }
    return String(data[key]);
  });
}

function makeSafeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
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

(async () => {
  const args = parseArgs(process.argv);

  if (!args.csvPath) {
    printUsage();
    console.red('Error: Missing CSV path. Use --csv <file>.');
    silentExit(1);
  }

  const absoluteCsvPath = path.resolve(process.cwd(), args.csvPath);
  const absoluteTemplatePath = path.resolve(process.cwd(), args.templatePath);

  if (!fs.existsSync(absoluteCsvPath)) {
    console.red(`Error: CSV file does not exist: ${absoluteCsvPath}`);
    silentExit(1);
  }

  if (!fs.existsSync(absoluteTemplatePath)) {
    console.red(`Error: Template file does not exist: ${absoluteTemplatePath}`);
    silentExit(1);
  }

  const timestamp = createTimestampLabel();
  const outputBaseDir = args.outputDir
    ? path.resolve(process.cwd(), args.outputDir)
    : path.resolve(process.cwd(), 'config', 'output', `user-onboarding-${timestamp}`);
  const emailsDir = path.join(outputBaseDir, 'emails');
  fs.mkdirSync(emailsDir, { recursive: true });

  const csvContent = fs.readFileSync(absoluteCsvPath, 'utf8');
  const rows = parseCsv(csvContent, args.delimiter);
  if (rows.length <= 1) {
    console.red('Error: CSV must contain a header row and at least one data row.');
    silentExit(1);
  }

  const headerRow = rows[0].map((cell) => cell.trim().toLowerCase());
  const headerMap = headerRow.reduce((map, header, index) => {
    map[header] = index;
    return map;
  }, {});

  if (headerMap.email == null && headerMap['e-mail'] == null && headerMap.mail == null) {
    console.red('Error: CSV header must include "email".');
    silentExit(1);
  }

  const template = fs.readFileSync(absoluteTemplatePath, 'utf8');
  const reservedEmails = new Set();
  const reservedUsernames = new Set();
  const appName = process.env.APP_TITLE || 'LibreChat';
  const loginUrl = args.loginUrl || defaultLoginUrl();

  await connect();

  const results = [];
  const summary = {
    created: 0,
    skipped: 0,
    errors: 0,
    dryRun: 0,
  };

  for (let i = 1; i < rows.length; i++) {
    const rawRow = rows[i];
    const rowNumber = i + 1;
    if (!rawRow.some((cell) => (cell || '').trim().length > 0)) {
      continue;
    }
    const normalized = normalizeRowObject(headerMap, rawRow);

    const email = normalized.email.toLowerCase();
    const record = {
      row: rowNumber,
      email,
      name: '',
      username: '',
      password: '',
      status: '',
      message: '',
      emailFile: '',
    };

    if (!email || !email.includes('@')) {
      record.status = 'invalid';
      record.message = 'Missing or invalid email';
      results.push(record);
      summary.errors += 1;
      continue;
    }

    if (reservedEmails.has(email)) {
      record.status = 'invalid';
      record.message = 'Duplicate email in CSV';
      results.push(record);
      summary.errors += 1;
      continue;
    }
    reservedEmails.add(email);

    const existingByEmail = await User.findOne({ email });
    if (existingByEmail) {
      record.status = 'skipped_existing';
      record.message = 'User with this email already exists';
      results.push(record);
      summary.skipped += 1;
      continue;
    }

    const name = ensureName(getProvidedName(normalized), email, rowNumber);
    const usernameSeed = normalized.username || email.split('@')[0];
    const username = await findUniqueUsername(usernameSeed, rowNumber, reservedUsernames);
    const password = generatePassword(args.passwordLength);

    record.name = name;
    record.username = username;
    record.password = password;

    const emailText = renderTemplate(template, {
      appName,
      email,
      name,
      username,
      password,
      loginUrl,
    });
    const emailFile = makeSafeFileName(`${email}.txt`);
    const emailFilePath = path.join(emailsDir, emailFile);

    if (args.dryRun) {
      record.status = 'dry_run';
      record.message = 'Validated and prepared without creating user';
      record.emailFile = path.relative(process.cwd(), emailFilePath);
      fs.writeFileSync(emailFilePath, emailText, 'utf8');
      results.push(record);
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
          provider: args.provider,
        },
        { emailVerified: args.emailVerified },
      );

      if (response.status !== 200) {
        record.status = 'error';
        record.message = response.message || 'Registration failed';
        results.push(record);
        summary.errors += 1;
        continue;
      }

      record.status = 'created';
      record.message = 'User created successfully';
      record.emailFile = path.relative(process.cwd(), emailFilePath);
      fs.writeFileSync(emailFilePath, emailText, 'utf8');
      results.push(record);
      summary.created += 1;
    } catch (error) {
      record.status = 'error';
      record.message = error.message || 'Unknown registration error';
      results.push(record);
      summary.errors += 1;
    }
  }

  const outputCsvPath = path.join(outputBaseDir, 'results.csv');
  fs.writeFileSync(
    outputCsvPath,
    toCsv(results, ['row', 'email', 'name', 'username', 'password', 'status', 'message', 'emailFile']),
    'utf8',
  );

  console.green('----------------------------------------');
  console.green('Bulk onboarding finished');
  console.green(`Created: ${summary.created}`);
  console.green(`Skipped existing: ${summary.skipped}`);
  console.green(`Dry run: ${summary.dryRun}`);
  console.green(`Errors: ${summary.errors}`);
  console.green(`Results: ${path.relative(process.cwd(), outputCsvPath)}`);
  console.green(`Email texts: ${path.relative(process.cwd(), emailsDir)}`);
  console.green('----------------------------------------');

  silentExit(summary.errors > 0 ? 1 : 0);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:');
  console.error(err);
  process.exit(1);
});
