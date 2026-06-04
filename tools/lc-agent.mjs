#!/usr/bin/env node
/**
 * lc-agent — drive a LibreChat agent over the Open Responses API and read
 * back the full transcript (incl. code-interpreter tool calls) from Mongo.
 *
 * Closes the loop without copy-paste: send a message, get the reply, dump
 * the conversation, correlate with the Daytona adapter log.
 *
 *   node tools/lc-agent.mjs models
 *   node tools/lc-agent.mjs send "<prompt>" [--continue <convoId>] [--agent <id>] [--raw]
 *   node tools/lc-agent.mjs convo <convoId>           # full transcript from Mongo
 *   node tools/lc-agent.mjs sandbox [<n>]             # tail n lines of adapter log
 *
 * Auth: reads the agent API key from <repo>/.agent-api-key (gitignored).
 * Config via env: LC_BASE_URL (default http://localhost:3080),
 *                 LC_AGENT_ID  (default agent_88Pl6jcwNrRIrB6omZpNT),
 *                 LC_MONGO_URI (default mongodb://127.0.0.1:27017/LibreChat),
 *                 DAYTONA_LOG  (default /tmp/daytona-interpreter.log).
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.LC_BASE_URL ?? 'http://localhost:3080';
const AGENT = process.env.LC_AGENT_ID ?? 'agent_88Pl6jcwNrRIrB6omZpNT';
const MONGO = process.env.LC_MONGO_URI ?? 'mongodb://127.0.0.1:27017/LibreChat';
const DAYTONA_LOG = process.env.DAYTONA_LOG ?? '/tmp/daytona-interpreter.log';

function key() {
  try {
    return readFileSync(join(REPO, '.agent-api-key'), 'utf8').trim();
  } catch {
    console.error('Missing <repo>/.agent-api-key. Mint one first.');
    process.exit(1);
  }
}

function mongo(js) {
  const out = execFileSync('mongosh', [MONGO, '--quiet', '--eval', js], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim();
}

/** Newest conversation id for this user (server mints one per fresh thread). */
function latestConvoId() {
  const js = `const c = db.conversations.find({}, {conversationId:1}).sort({updatedAt:-1}).limit(1).toArray(); print(c[0] ? c[0].conversationId : '');`;
  return mongo(js).split('\n').pop().trim();
}

async function send(prompt, { cont, agent, raw, noStore }) {
  const body = {
    model: agent ?? AGENT,
    input: prompt,
    stream: false,
    // Persist so the convo + messages land in Mongo (readable via `convo`,
    // visible in the UI) and previous_response_id threading resolves.
    store: !noStore,
  };
  if (cont) body.previous_response_id = cont;

  const res = await fetch(`${BASE}/api/agents/v1/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[HTTP ${res.status}] ${text}`);
    process.exit(1);
  }
  const data = JSON.parse(text);
  if (raw) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Assistant text + any tool/function-call items.
  for (const item of data.output ?? []) {
    if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text') console.log(part.text);
      }
    } else if (item.type === 'function_call') {
      console.log(`\n[tool ${item.name}] ${item.arguments ?? ''}`);
    } else {
      console.log(`\n[${item.type}] ${JSON.stringify(item).slice(0, 400)}`);
    }
  }
  const convoId = cont ?? latestConvoId();
  const u = data.usage ?? {};
  console.log(
    `\n--- response_id=${data.id} status=${data.status} convo=${convoId} ` +
      `tokens=${u.input_tokens ?? '?'}/${u.output_tokens ?? '?'} ---`,
  );
  console.log(`continue with: node tools/lc-agent.mjs send "<next>" --continue ${convoId}`);
}

function dumpConvo(convoId) {
  const js = `
    db.messages.find({conversationId:"${convoId}"}).sort({createdAt:1}).forEach(m => {
      const who = m.isCreatedByUser ? 'USER' : (m.sender || 'assistant');
      print('\\n=== ' + who + ' (' + (m.createdAt ? m.createdAt.toISOString() : '') + ') ===');
      if (m.text) print(m.text);
      if (Array.isArray(m.content)) {
        m.content.forEach(p => {
          if (p.type === 'text' && p.text) print(p.text);
          else if (p.type === 'tool_call' || p.tool_call_id || p.name) print('[tool] ' + JSON.stringify(p).slice(0,1200));
          else print('[' + (p.type||'part') + '] ' + JSON.stringify(p).slice(0,800));
        });
      }
    });`;
  console.log(mongo(js) || '(no messages — wrong convoId?)');
}

function sandbox(n) {
  try {
    const lines = readFileSync(DAYTONA_LOG, 'utf8').split('\n');
    console.log(lines.slice(-(n || 80)).join('\n'));
  } catch {
    console.error(`No adapter log at ${DAYTONA_LOG}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const has = (name) => rest.includes(`--${name}`);

if (cmd === 'models') {
  const res = await fetch(`${BASE}/api/agents/v1/responses/models`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  console.log(JSON.stringify(JSON.parse(await res.text()), null, 2));
} else if (cmd === 'send') {
  // First non-flag arg is the prompt (flags consume their own value).
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { i++; continue; }
    positional.push(rest[i]);
  }
  if (!positional.length) {
    console.error('Usage: send "<prompt>" [--continue <convoId>] [--agent <id>] [--raw]');
    process.exit(1);
  }
  await send(positional.join(' '), {
    cont: flag('continue'),
    agent: flag('agent'),
    raw: has('raw'),
    noStore: has('no-store'),
  });
} else if (cmd === 'convo') {
  if (!rest[0]) { console.error('Usage: convo <conversationId>'); process.exit(1); }
  dumpConvo(rest[0]);
} else if (cmd === 'sandbox') {
  sandbox(parseInt(rest[0], 10) || 80);
} else {
  console.error('Commands: models | send "<prompt>" [--continue <id>] [--agent <id>] [--raw] | convo <id> | sandbox [n]');
  process.exit(1);
}
