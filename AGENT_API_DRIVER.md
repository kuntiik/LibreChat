# Driving the LibreChat agent over API + vision QA (D1)

Two related things live here, both in **LibreChat-086** (the active fork). The
Mattoni fork at `/Users/kuntik/work/LibreChat` is untouched.

1. **`tools/lc-agent.mjs`** — a CLI that drives an agent over the Open
   Responses API and reads the output back, so there's no copy-paste of UI
   conversation exports. Fully autonomous: send → agent runs tools → read.
2. **D1 vision fix** — `read_file` on a sandbox raster image now returns it as
   a vision `image_url` artifact (the model can *see* its own rendered output
   for visual QA) instead of erroring with "cannot be read as text".

---

## 1. Agent API driver (C1)

### What's already set up (one-time, done)

- **REMOTE_AGENTS permission** enabled on the `ADMIN` role
  (`db.roles … permissions.REMOTE_AGENTS.USE = true`). The only account is
  `test@local.dev` (ADMIN), author of agent **`agent_88Pl6jcwNrRIrB6omZpNT`**
  ("PPTX builder").
- **Agent API key** minted and stored in `LibreChat-086/.agent-api-key`
  (gitignored, chmod 600). Auth is `Authorization: Bearer <key>`.

### Endpoint contract (Open Responses spec, OpenAI-compatible)

- `POST /api/agents/v1/responses` — body:
  `{ "model": "<agent_id>", "input": "<text>", "stream": false,
     "store": true, "previous_response_id": "<conversationId>" }`
  → `{ id: "resp_…", status, output: [ {type:"function_call"…}, {type:"message", content:[{type:"output_text", text}]} ], usage }`
- `GET  /api/agents/v1/responses/models` — list agents as models.
- `GET  /api/agents/v1/responses/:id` — fetch a stored response.
- Also exists: `POST /api/agents/v1/chat/completions` (OpenAI chat-completions).

Auth chain (in `api/server/routes/agents/responses.js`, mounted **before**
`requireJwtAuth`): `preAuthTenantMiddleware → requireRemoteAgentAuth (Bearer
key) → configMiddleware → checkRemoteAgentsFeature → checkAgentPermission`.

### Driver usage

```bash
cd /Users/kuntik/work/LibreChat-086
node tools/lc-agent.mjs models
node tools/lc-agent.mjs send "<prompt>" [--continue <convoId>] [--agent <id>] [--raw] [--no-store]
node tools/lc-agent.mjs convo <conversationId>   # transcript from Mongo (see caveat)
node tools/lc-agent.mjs sandbox [n]              # tail n lines of the Daytona adapter log
```

`send` prints the assistant text, any tool calls, usage, the `response_id`,
and the `conversationId` to thread with `--continue`. Env overrides:
`LC_BASE_URL`, `LC_AGENT_ID`, `LC_MONGO_URI`, `DAYTONA_LOG`.

### Threading & persistence

- `previous_response_id` **is the `conversationId`** (controller:
  `conversationId = previous_response_id ?? uuidv4()`), validated via `getConvo`.
- Persistence only happens with **`store: true`** (driver default). Without it
  nothing is saved and threading can't resolve.
- **Known caveat:** even with `store:true` the convo *document* is created but
  the *messages* don't persist (count 0) — a save hiccup in
  `saveInputMessages`/`saveResponseOutput` (`controllers/agents/responses.js`).
  So `convo <id>` may come back empty. **The API response is the source of
  truth** for autonomous use; the Mongo dump is only a convenience. Fix later
  if UI-visible history is wanted.
- Deep sandbox visibility (which sandbox, where a tool failed) comes from the
  adapter log: `node tools/lc-agent.mjs sandbox` or grep
  `/tmp/daytona-interpreter.log`.

### Proven working

`send` of a matplotlib-then-`read_file` prompt → agent ran `bash_tool` +
`read_file` autonomously and **described the rendered graph** (axes, the four
`y=x²` points). End-to-end, no human in the loop.

---

## 2. D1 — vision readback for `read_file` (visual QA)

### Problem it fixes

The pptx skill's QA step renders slides to JPG then expects the model to
inspect them. Previously `read_file` on any raster image hard-errored
("…is an image file… cannot be read as text"), so the agent's QA loop
dead-ended. There is no vision subagent on this platform.

### Fix (files changed in LibreChat-086)

- `api/server/services/Files/Code/process.js` — new **`readSandboxFileBase64()`**:
  reads a sandbox file via `base64 -w0 …` over `/exec` (plain `cat` corrupts
  binary across the JSON transport). Works on files made earlier in the **same
  turn** (operates on the live path).
- `api/server/services/Endpoints/agents/skillDeps.js` — wires
  `readSandboxFileBase64` into the tool deps.
- `packages/api/src/agents/handlers.ts` — in `handleSandboxFileFallback`, image
  extensions (png/jpeg/gif/webp only) now fetch the bytes and return a
  `content_and_artifact` result with an `image_url` block — the same shape the
  skill-file image path already uses, so the model sees the image. Guards:
  `imageMimeForExt`, `MIN_IMAGE_BYTES`, **magic-byte sniff**
  (`base64HeaderMatchesMime`) and the 5 MB ceiling. A stub/oversize/non-image
  falls back to the original text error — never ships a poison `image_url`
  (which would 400 the whole turn).
- `packages/api/src/agents/handlers.spec.ts` — tests (49 pass): artifact path,
  tiny/non-image stub fallback, oversize fallback.

### Build / activate

`packages/api` is built (`npm run build:api`); the `api/` files are runtime CJS.
**Restart the backend** to load the rebuilt dist (`nodemon` watches `api/` but
not `packages/api/dist`).

### Caveat to revisit

`read_file`'s tool *description* (`READ_FILE_DEF`, used when skills are enabled)
comes from upstream `@librechat/agents` and frames `read_file` as text-only.
The model still attempts images organically, but a package patch telling it
images are readable for QA would make the trigger more reliable.

---

## Image sourcing for decks (B) — what does NOT work

- **Sandbox fetching a URL** (`addImage({path:"https://…"})`): the Daytona
  sandbox **cannot reach `obchod.ronnie.cz`** — TLS connection reset
  (`ECONNRESET`), almost certainly the e-shop's WAF blocking datacenter IPs.
  Egress otherwise works (pip), just not that host.
- **Attaching an image to the agent chat**: goes to the model as a **vision**
  attachment, **not** mounted into `/mnt/data` — so `addImage({path})` has
  nothing to read (the sandbox FS shows `total 0`).
- **What works:** embed the image as base64 in the script
  (`addImage({data:"image/jpeg;base64,…"})`), or bake assets into the sandbox
  image (bump tag, see `CODE_INTERPRETER_HANDOFF.md`).
- Verified Mattoni Imuno bottle shots (datacenter-blocked but fine from a
  normal host) saved at `~/Downloads/imuno1.jpg` and `imuno2.jpg` (1200×1200).
