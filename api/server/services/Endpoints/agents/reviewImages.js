const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('@librechat/data-schemas');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getFiles } = require('~/models');

/**
 * Fresh-eyes visual QA backend for the `review_slides` tool.
 *
 * Resolves the rendered slides the model named from the conversation's
 * PERSISTED files (they're saved to storage the instant they're rendered,
 * before review_slides is called) — the ephemeral sandbox is NOT reachable
 * from a tool the upstream ToolNode doesn't recognize. Then hands the
 * images + the original brief to a SECOND model that never saw the
 * deck-generation code, and returns its per-slide issue list as plain text.
 * "Fresh eyes" comes from the reviewer never seeing the code, not from the
 * provider, so the default reviewer is OpenAI vision (the provider actually
 * wired in this deployment), with a different model (gpt-4o) than the
 * gpt-5.4 deck-builder agent. Anthropic is opt-in via env. See
 * docs/decisions/QA_FRESH_EYES_REVIEW.md.
 *
 * Config (env, all optional):
 *   QA_REVIEW_PROVIDER  'openai' (default) | 'anthropic'
 *   QA_REVIEW_MODEL     default per provider
 *   QA_REVIEW_API_KEY   falls back to OPENAI_API_KEY / ANTHROPIC_API_KEY
 *   QA_REVIEW_BASE_URL  OpenAI-compatible gateway base URL (openai provider)
 */

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const MAX_REVIEW_TOKENS = 2048;
const MIN_IMAGE_BYTES = 128;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const INSPECTION_SYSTEM_PROMPT = `You are a meticulous presentation-design reviewer with fresh eyes. You did NOT write the slides — you are seeing them for the first time, so report what is actually on screen, not what was intended.

Assume there are problems and your job is to find them. If you found zero issues, you weren't looking hard enough.

For EACH slide, check for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or text cut off at edges / box boundaries
- Decorative lines/rules positioned for one-line text but the title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3in gaps) or cards/sections nearly touching
- Uneven gaps (big empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5in)
- Columns or repeated elements not aligned consistently
- Low-contrast text or icons (e.g. light text on light background, dark icon on dark background)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content (lorem ipsum, "click to add", XXXX)
- Content that does not match the brief or the per-slide expectation

Output format: one section per slide ("Slide N:"), a short bullet list of concrete issues with WHERE on the slide they are, and the severity (blocker / should-fix / minor). End each slide with "VERDICT: CLEAN" if it has no issues, otherwise list them. If the whole deck is clean, say so explicitly — but only if it truly is.`;

function buildUserText(brief, expectations, count) {
  const lines = [
    `Original brief: ${brief}`,
    '',
    `There ${count === 1 ? 'is 1 slide' : `are ${count} slides`} attached below, in order.`,
  ];
  if (Array.isArray(expectations) && expectations.length > 0) {
    lines.push('', 'Per-slide expectations:');
    expectations.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`));
  }
  lines.push('', 'Review every slide. Be specific and critical.');
  return lines.join('\n');
}

/**
 * Strips the `?v=<cache-buster>` (and any hash) the file pipeline appends to
 * an image's stored `filepath`. That value is a web-serving URL; the local
 * storage strategy resolves it against the image dir and would otherwise try
 * to open a file literally named `…png?v=123` (ENOENT).
 */
function storagePath(filepath) {
  return filepath.split('?')[0].split('#')[0];
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds a basename → newest-file map of the conversation's persisted
 * image files (a fresh DB read each call).
 */
async function imageFilesByName(conversationId) {
  const files = (await getFiles({ conversationId }, { updatedAt: -1 }, null)) || [];
  const newestByName = new Map();
  for (const file of files) {
    const ext = path.extname(file.filename || '').toLowerCase();
    if (!EXT_TO_MIME[ext]) {
      continue;
    }
    if (!newestByName.has(file.filename)) {
      newestByName.set(file.filename, file);
    }
  }
  return newestByName;
}

/**
 * Maps the model's slide paths (e.g. "/mnt/data/slide-01.png") to the
 * conversation's persisted image files by basename, newest first. Reads
 * each file's bytes from storage and returns vision-ready blocks.
 *
 * The file-upload pipeline that persists sandbox outputs runs
 * asynchronously and lags the code-execution tool result by several
 * seconds — a `review_slides` call made right after rendering can race
 * ahead of it. So poll (bounded) until every named slide has a stored
 * file, then read. Throws when none resolve before the deadline so the
 * caller can tell the model to render first.
 */
async function resolveImages(imagePaths, conversationId, req) {
  if (!conversationId) {
    throw new Error('no conversationId available to locate the rendered slide files');
  }

  const wanted = imagePaths.map((p) => p.split('/').pop());
  const deadline = Date.now() + 25_000;
  let newestByName = await imageFilesByName(conversationId);
  while (wanted.some((name) => !newestByName.has(name)) && Date.now() < deadline) {
    await sleep(2_500);
    newestByName = await imageFilesByName(conversationId);
  }

  const images = [];
  const missing = [];
  for (const p of imagePaths) {
    const base = p.split('/').pop();
    const file = newestByName.get(base);
    if (!file) {
      missing.push(base);
      continue;
    }
    try {
      const { getDownloadStream } = getStrategyFunctions(file.source);
      if (!getDownloadStream) {
        missing.push(`${base} (unreadable storage: ${file.source})`);
        continue;
      }
      const stream = await getDownloadStream(req, storagePath(file.filepath));
      const buf = await streamToBuffer(stream);
      if (buf.length < MIN_IMAGE_BYTES || buf.length > MAX_IMAGE_BYTES) {
        missing.push(`${base} (size out of range)`);
        continue;
      }
      images.push({
        mime: EXT_TO_MIME[path.extname(file.filename).toLowerCase()],
        base64: buf.toString('base64'),
        path: p,
      });
    } catch (error) {
      missing.push(`${base} (read failed: ${error.message})`);
    }
  }

  if (images.length === 0) {
    throw new Error(
      `none of the named slides resolved to a stored image file (looked up by name in this conversation): ${missing.join(', ')}`,
    );
  }
  return { images, missing };
}

function resolveConfig() {
  const provider = (process.env.QA_REVIEW_PROVIDER || 'openai').toLowerCase();
  if (provider === 'anthropic') {
    return {
      provider,
      model: process.env.QA_REVIEW_MODEL || DEFAULT_ANTHROPIC_MODEL,
      apiKey: process.env.QA_REVIEW_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.QA_REVIEW_BASE_URL || undefined,
    };
  }
  return {
    provider: 'openai',
    model: process.env.QA_REVIEW_MODEL || DEFAULT_OPENAI_MODEL,
    apiKey: process.env.QA_REVIEW_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.QA_REVIEW_BASE_URL || undefined,
  };
}

async function reviewWithAnthropic({ model, apiKey, baseURL }, images, userText) {
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const content = [
    { type: 'text', text: userText },
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mime, data: img.base64 },
    })),
  ];
  const message = await client.messages.create({
    model,
    max_tokens: MAX_REVIEW_TOKENS,
    system: INSPECTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });
  return (message.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

async function reviewWithOpenAI({ model, apiKey, baseURL }, images, userText) {
  const base = (baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const content = [
    { type: 'text', text: userText },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    })),
  ];
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: MAX_REVIEW_TOKENS,
      messages: [
        { role: 'system', content: INSPECTION_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`reviewer HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

/**
 * @param {{ imagePaths: string[], brief: string, expectations?: string[], conversationId?: string, req?: object }} params
 * @returns {Promise<string>} the reviewer's per-slide issue list
 */
async function reviewImages({ imagePaths, brief, expectations, conversationId, req }) {
  const config = resolveConfig();
  if (!config.apiKey) {
    throw new Error(
      `no API key for the ${config.provider} reviewer (set QA_REVIEW_API_KEY or ${config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'})`,
    );
  }
  const { images, missing } = await resolveImages(imagePaths, conversationId, req);
  const userText = buildUserText(brief, expectations, images.length);
  logger.debug(
    `[reviewImages] ${config.provider}/${config.model} reviewing ${images.length} image(s)` +
      (missing.length ? `, ${missing.length} not found` : ''),
  );
  const text =
    config.provider === 'openai'
      ? await reviewWithOpenAI(config, images, userText)
      : await reviewWithAnthropic(config, images, userText);
  if (!text) {
    throw new Error('reviewer returned an empty response');
  }
  return missing.length > 0
    ? `${text}\n\n(Note: ${missing.length} named slide(s) had no stored file and were skipped: ${missing.join(', ')})`
    : text;
}

module.exports = { reviewImages };
