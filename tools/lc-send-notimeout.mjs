#!/usr/bin/env node
/**
 * Timeout-proof one-shot sender for the LibreChat agent Responses API.
 * The shipped lc-agent.mjs uses global fetch whose undici headersTimeout
 * (300s) aborts long QA/pptx runs. This uses a dispatcher with no timeouts
 * and writes the full JSON response to a file for inspection.
 *
 *   node tools/lc-send-notimeout.mjs "<prompt>" <outFile> [convoId] [agentId]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, fetch as uFetch } from 'undici';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.LC_BASE_URL ?? 'http://localhost:3080';
const AGENT = process.env.LC_AGENT_ID ?? 'agent_88Pl6jcwNrRIrB6omZpNT';
const key = readFileSync(join(REPO, '.agent-api-key'), 'utf8').trim();

const [prompt, outFile, convoId, agentId] = process.argv.slice(2);
if (!prompt || !outFile) {
  console.error('Usage: lc-send-notimeout.mjs "<prompt>" <outFile> [convoId] [agentId]');
  process.exit(1);
}

const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 });
const body = { model: agentId ?? AGENT, input: prompt, stream: false, store: true };
if (convoId) body.previous_response_id = convoId;

const t0 = Date.now();
console.log(`[send] agent=${body.model} convo=${convoId ?? '(new)'} ...`);
const res = await uFetch(`${BASE}/api/agents/v1/responses`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  dispatcher,
});
const text = await res.text();
const secs = ((Date.now() - t0) / 1000).toFixed(1);
writeFileSync(outFile, text);
console.log(`[done] HTTP ${res.status} in ${secs}s -> ${outFile} (${text.length} bytes)`);
if (!res.ok) process.exit(1);
