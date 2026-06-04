const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('@librechat/data-schemas');

/**
 * Fresh-eyes visual QA backend for the `review_slides` tool.
 *
 * Hands rendered slide images + the original brief to a SECOND model that
 * never saw the deck-generation code, and returns its per-slide issue list
 * as plain text. By default the reviewer is Anthropic Claude (vision) —
 * deliberately a DIFFERENT provider than the OpenAI deck-builder agent, so
 * "fresh eyes" holds in the strongest sense. See
 * docs/decisions/QA_FRESH_EYES_REVIEW.md.
 *
 * Config (env, all optional):
 *   QA_REVIEW_PROVIDER  'anthropic' (default) | 'openai'
 *   QA_REVIEW_MODEL     default per provider
 *   QA_REVIEW_API_KEY   falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY
 *   QA_REVIEW_BASE_URL  OpenAI-compatible gateway base URL (openai provider)
 */

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const MAX_REVIEW_TOKENS = 2048;

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

Output format: one section per slide ("Slide N:"), a short bullet list of concrete issues with WHERE on the slide they are, and the severity (blocker / should-fix / minor). End with one line: "VERDICT: CLEAN" if a slide has no issues, otherwise list them. If the whole deck is clean, say so explicitly — but only if it truly is.`;

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

function resolveConfig() {
  const provider = (process.env.QA_REVIEW_PROVIDER || 'anthropic').toLowerCase();
  if (provider === 'openai') {
    return {
      provider,
      model: process.env.QA_REVIEW_MODEL || DEFAULT_OPENAI_MODEL,
      apiKey: process.env.QA_REVIEW_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.QA_REVIEW_BASE_URL || undefined,
    };
  }
  return {
    provider: 'anthropic',
    model: process.env.QA_REVIEW_MODEL || DEFAULT_ANTHROPIC_MODEL,
    apiKey: process.env.QA_REVIEW_API_KEY || process.env.ANTHROPIC_API_KEY,
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
 * @param {{ images: Array<{mime: string, base64: string, path: string}>, brief: string, expectations?: string[] }} params
 * @returns {Promise<string>} the reviewer's per-slide issue list
 */
async function reviewImages({ images, brief, expectations }) {
  const config = resolveConfig();
  if (!config.apiKey) {
    throw new Error(
      `no API key for the ${config.provider} reviewer (set QA_REVIEW_API_KEY or ${config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'})`,
    );
  }
  const userText = buildUserText(brief, expectations, images.length);
  logger.debug(
    `[reviewImages] ${config.provider}/${config.model} reviewing ${images.length} image(s)`,
  );
  const text =
    config.provider === 'openai'
      ? await reviewWithOpenAI(config, images, userText)
      : await reviewWithAnthropic(config, images, userText);
  if (!text) {
    throw new Error('reviewer returned an empty response');
  }
  return text;
}

module.exports = { reviewImages };
