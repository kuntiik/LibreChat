# LibreChat

## Project Overview

LibreChat is a monorepo with the following key workspaces:

| Workspace | Language | Side | Dependency | Purpose |
|---|---|---|---|---|
| `/api` | JS (legacy) | Backend | `packages/api`, `packages/data-schemas`, `packages/data-provider`, `@librechat/agents` | Express server — minimize changes here |
| `/packages/api` | **TypeScript** | Backend | `packages/data-schemas`, `packages/data-provider` | New backend code lives here (TS only, consumed by `/api`) |
| `/packages/data-schemas` | TypeScript | Backend | `packages/data-provider` | Database models/schemas, shareable across backend projects |
| `/packages/data-provider` | TypeScript | Shared | — | Shared API types, endpoints, data-service — used by both frontend and backend |
| `/client` | TypeScript/React | Frontend | `packages/data-provider`, `packages/client` | Frontend SPA |
| `/packages/client` | TypeScript | Frontend | `packages/data-provider` | Shared frontend utilities |

The source code for `@librechat/agents` (major backend dependency, same team) is at `/home/danny/agentus`.

---

## Workspace Boundaries

- **All new backend code must be TypeScript** in `/packages/api`.
- Keep `/api` changes to the absolute minimum (thin JS wrappers calling into `/packages/api`).
- Database-specific shared logic goes in `/packages/data-schemas`.
- Frontend/backend shared API logic (endpoints, types, data-service) goes in `/packages/data-provider`.
- Build data-provider from project root: `npm run build:data-provider`.

---

## Code Style

### Naming and File Organization

- **Single-word file names** whenever possible (e.g., `permissions.ts`, `capabilities.ts`, `service.ts`).
- When multiple words are needed, prefer grouping related modules under a **single-word directory** rather than using multi-word file names (e.g., `admin/capabilities.ts` not `adminCapabilities.ts`).
- The directory already provides context — `app/service.ts` not `app/appConfigService.ts`.

### Structure and Clarity

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce` over imperative loops. Only reach for OOP when it clearly improves domain modeling or state encapsulation.
- **No dynamic imports** unless absolutely necessary.

### DRY

- Extract repeated logic into utility functions.
- Reusable hooks / higher-order components for UI patterns.
- Parameterized helpers instead of near-duplicate functions.
- Constants for repeated values; configuration objects over duplicated init code.
- Shared validators, centralized error handling, single source of truth for business rules.
- Shared typing system with interfaces/types extending common base definitions.
- Abstraction layers for external API interactions.

### Iteration and Performance

- **Minimize looping** — especially over shared data structures like message arrays, which are iterated frequently throughout the codebase. Every additional pass adds up at scale.
- Consolidate sequential O(n) operations into a single pass whenever possible; never loop over the same collection twice if the work can be combined.
- Choose data structures that reduce the need to iterate (e.g., `Map`/`Set` for lookups instead of `Array.find`/`Array.includes`).
- Avoid unnecessary object creation; consider space-time tradeoffs.
- Prevent memory leaks: careful with closures, dispose resources/event listeners, no circular references.

### Type Safety

- **Never use `any`**. Explicit types for all parameters, return values, and variables.
- **Limit `unknown`** — avoid `unknown`, `Record<string, unknown>`, and `as unknown as T` assertions. A `Record<string, unknown>` almost always signals a missing explicit type definition.
- **Don't duplicate types** — before defining a new type, check whether it already exists in the project (especially `packages/data-provider`). Reuse and extend existing types rather than creating redundant definitions.
- Use union types, generics, and interfaces appropriately.
- All TypeScript and ESLint warnings/errors must be addressed — do not leave unresolved diagnostics.

### Comments and Documentation

- Write self-documenting code; no inline comments narrating what code does.
- JSDoc only for complex/non-obvious logic or intellisense on public APIs.
- Single-line JSDoc for brief docs, multi-line for complex cases.
- Avoid standalone `//` comments unless absolutely necessary.

### Import Order

Imports are organized into three sections:

1. **Package imports** — sorted shortest to longest line length (`react` always first).
2. **`import type` imports** — sorted longest to shortest (package types first, then local types; length resets between sub-groups).
3. **Local/project imports** — sorted longest to shortest.

Multi-line imports count total character length across all lines. Consolidate value imports from the same module. Always use standalone `import type { ... }` — never inline `type` inside value imports.

### JS/TS Loop Preferences

- **Limit looping as much as possible.** Prefer single-pass transformations and avoid re-iterating the same data.
- `for (let i = 0; ...)` for performance-critical or index-dependent operations.
- `for...of` for simple array iteration.
- `for...in` only for object property enumeration.

---

## Frontend Rules (`client/src/**/*`)

### Localization

- All user-facing text must use `useLocalize()`.
- Only update English keys in `client/src/locales/en/translation.json` (other languages are automated externally).
- Semantic key prefixes: `com_ui_`, `com_assistants_`, etc.

### Components

- TypeScript for all React components with proper type imports.
- Semantic HTML with ARIA labels (`role`, `aria-label`) for accessibility.
- Group related components in feature directories (e.g., `SidePanel/Memories/`).
- Use index files for clean exports.

### Data Management

- Feature hooks: `client/src/data-provider/[Feature]/queries.ts` → `[Feature]/index.ts` → `client/src/data-provider/index.ts`.
- React Query (`@tanstack/react-query`) for all API interactions; proper query invalidation on mutations.
- QueryKeys and MutationKeys in `packages/data-provider/src/keys.ts`.

### Data-Provider Integration

- Endpoints: `packages/data-provider/src/api-endpoints.ts`
- Data service: `packages/data-provider/src/data-service.ts`
- Types: `packages/data-provider/src/types/queries.ts`
- Use `encodeURIComponent` for dynamic URL parameters.

### Performance

- Prioritize memory and speed efficiency at scale.
- Cursor pagination for large datasets.
- Proper dependency arrays to avoid unnecessary re-renders.
- Leverage React Query caching and background refetching.

---

## Development Commands

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps (if lockfile changed) + build via Turborepo |
| `npm run reinstall` | Clean install — wipe `node_modules` and reinstall from scratch |
| `npm run backend` | Start the backend server |
| `npm run backend:dev` | Start backend with file watching (development) |
| `npm run build` | Build all compiled code via Turborepo (parallel, cached) |
| `npm run frontend` | Build all compiled code sequentially (legacy fallback) |
| `npm run frontend:dev` | Start frontend dev server with HMR (port 3090, requires backend running) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes |

- Node.js: v20.19.0+ or ^22.12.0 or >= 23.0.0
- Database: MongoDB
- Backend runs on `http://localhost:3080/`; frontend dev server on `http://localhost:3090/`

---

## Testing

- Framework: **Jest**, run per-workspace.
- Run tests from their workspace directory: `cd api && npx jest <pattern>`, `cd packages/api && npx jest <pattern>`, etc.
- Frontend tests: `__tests__` directories alongside components; use `test/layout-test-utils` for rendering.
- Cover loading, success, and error states for UI/data flows.

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies. Mocking is a last resort.
- **Spies over mocks.** Assert that real functions are called with expected arguments and frequency without replacing underlying logic.
- **MongoDB**: use `mongodb-memory-server` for a real in-memory MongoDB instance. Test actual queries and schema validation, not mocked DB calls.
- **MCP**: use real `@modelcontextprotocol/sdk` exports for servers, transports, and tool definitions. Mirror real scenarios, don't stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services, non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

---

## Formatting

Fix all formatting lint errors (trailing spaces, tabs, newlines, indentation) using auto-fix when available. All TypeScript/ESLint warnings and errors **must** be resolved.

---

## Local code-interpreter stack (Lukáš's setup)

**Important:** active code-interpreter work now happens **in this repo**
(`LibreChat`, branch `new_dev`). As of 2026-06-08 the live backend (`:3080`)
runs from here, not from `LibreChat-086` — `-086` is the superseded
release_8.6 testbed, kept only for reference. `new_dev` carries the full stack
(agent stack, QA stack/`review_slides`, codeapi patch) plus the collapse-images
feature, and is ahead of `-086`.

```
/Users/kuntik/work/
├── LibreChat                          ← this repo, branch new_dev (ACTIVE — backend runs here)
├── LibreChat-086                      ← release_8.6, superseded (reference only)
└── Librechat-Daytona-Interpreter      ← Janecv0 fork (active; adapter + sandbox image, new_main=new_develop=:0.7)
```

Start the backend from here: `npm run backend` (production, no nodemon). The
agent driver key is in `.agent-api-key`; adapter on `:8765`, Mongo
`mongodb://127.0.0.1:27017/LibreChat` (shared with `-086`).

**Read first:** `/Users/kuntik/work/LibreChat/CODE_INTERPRETER_HANDOFF.md`
for the full picture (env wiring, two upstream patches, quick-start commands).

**Driving the agent over API + vision QA:**
`/Users/kuntik/work/LibreChat-086/AGENT_API_DRIVER.md` — the `tools/lc-agent.mjs`
driver (send a message to an agent over the Open Responses API and read the
output back, no copy-paste of UI exports; key in `.agent-api-key`,
`REMOTE_AGENTS` enabled on ADMIN), plus the D1 `read_file` vision-readback fix
(rendered images come back as `image_url` artifacts so the model can QA its own
output) and why image URLs/uploads don't reach the sandbox.

**Fresh-eyes slide review (`review_slides` tool) — status 2026-06-04:**
Full detail in `/Users/kuntik/work/LibreChat-086/docs/decisions/QA_FRESH_EYES_REVIEW.md`.
The `review_slides` tool gives the deck-builder a SECOND model (it never saw the
generation code) that critiques the rendered slides, instead of self-QA via
`read_file` (confirmation bias → ships unchanged decks).

- **Was committed broken** (commit `2d190f05a` v1): read the live sandbox (a
  custom tool gets no `codeSessionContext` from upstream `ToolNode`, so it never
  found the images) AND defaulted to Anthropic (the `ANTHROPIC_API_KEY` here is a
  placeholder → 401). The pptx skill also still said "USE SUBAGENTS", so the
  model never even called the tool.
- **Fixed this session (uncommitted in -086 working tree):**
  - `reviewImages.js` now resolves slides from the conversation's **persisted
    files** (basename match + storage read, bounded poll for the async upload
    lag) — no sandbox dependency. Default reviewer flipped to **OpenAI gpt-4o**
    (working provider); Anthropic opt-in via `QA_REVIEW_PROVIDER`.
  - `handlers.ts` `handleReviewSlidesCall` is thin (validate + delegate, passes
    `conversationId`). `api/server/index.js` lifts Node's 300s `requestTimeout`
    (agent+QA runs exceed it). pptx skill (DB) rewritten to call `review_slides`
    + mandatory fix-and-re-render loop.
- **Verified:** 79 agent unit tests pass; a deterministic `reviewImages` run
  returned a real per-slide critique; the live agent emits `review_slides` and
  the chain reaches `reviewImages` with the right `conversationId`.
- **Why runs "cancelled" mid-review — FIXED 2026-06-05 (-086 working tree):**
  the old "long runs keep dropping" symptom was **nodemon**. `backend:dev`
  watched the repo root; every generated pptxgenjs `.js` the interpreter saves
  as an artifact lands in `uploads/<userId>/` (a `.js` in a watched dir), so
  nodemon restarted the backend mid-turn, killing the run right after the deck
  was delivered, before `review_slides`. Fix: added `uploads/`, `images/`,
  `logs/` to `nodemonConfig.ignore` in `-086/package.json`. **Requires a full
  nodemon restart** (the parent caches its config at startup; an in-place edit
  reloads the app but not the ignore list). Verified: PID stable, run survives,
  `review_slides` fires + re-render loop runs.
- **`review_slides` couldn't read the slides — FIXED 2026-06-05 (-086):** stored
  image `file.filepath` is a web URL with a `?v=<ts>` cache-buster
  (`/images/<userId>/<uuid>.png?v=…`); `reviewImages.js` fed it straight to the
  local `getDownloadStream`, which `fs`-opened the literal `…png?v=…` → ENOENT,
  so review always returned "none of the named slides resolved" and the model
  looped re-rendering. Fix: `storagePath()` helper strips `?…`/`#…` before the
  read. Verified end-to-end — real gpt-4o per-slide critique returned.
- **Driver caveat:** these QA runs exceed undici's 300s default `headersTimeout`,
  so `lc-agent.mjs send` aborts (`UND_ERR_HEADERS_TIMEOUT`) while the server
  finishes fine. Bump the driver's fetch (`headersTimeout: 0`) or observe via the
  UI (SSE). The review fires regardless — this only blocks the driver from
  printing the transcript.
- **Still open:** whether the model reliably *acts* on the review is prompt-driven,
  not enforced (hard-gate options in the decision doc). `primeSkillFiles` 404 on
  skill "pptx" — reference files (`editing.md`, `pptxgenjs.md`) not uploading.
- **Not mine, pre-existing in the -086 working tree:** `client/.../ChatView.tsx`
  and `api/server/controllers/agents/responses.js` show as modified — untouched
  by this work. Nothing committed (awaiting Lukáš's call on what to commit).

**Review pipeline revived on this stack — 2026-06-10 (image `:1.2`, verified E2E):**
the storage/compute-split adapter only reports files at the `/workspace` ROOT
(`list_files` is non-recursive), so the PNGs `qa_deck.sh` wrote to
`/mnt/data/preview/` were never persisted and `review_slides` always skipped —
every deck shipped unreviewed. Fixes, all live:

- `qa_deck.sh` now renders `slide-N.png` (and the PDF) into `/mnt/data` itself;
  `render_deck.sh` clears stale `slide-*.png` before re-rendering. Skill body
  (Mongo `db.skills` "pptx") updated to the root paths.
- `deck_helpers.js`: EMU normalization in the linter (`emuToIn`) — pptxgenjs
  stores TABLE geometry in EMU, so any `s.addTable` previously failed the
  bounds gate forever (repro: in-bounds table reported as `x=548640`); native
  tables now pass and ship editable. New `D.chart(deck, s, "bar"|"line", data,
  opts)` helper (native editable charts). `deck.addSlide`/`deck.writeFile`/
  `deck.addTable`-style misuses now throw with the correct call (models burned
  ~4 turns guessing the API).
- Skill body: exact-signature block, emoji BAN (no emoji fonts in the sandbox →
  tofu in renders and in the reviewer's screenshots), review-skip disclosure
  mandate. `handleReviewSlidesCall` skip message now also instructs one retry +
  forces the model to disclose an unrun review in its final reply (packages/api
  rebuilt).
- Verified 2026-06-10: full agent run → `[reviewImages] openai/gpt-4o reviewing
  6 image(s)` → fix cycle ran → deck delivered with native chart + native table,
  no emoji, and an honest residual-issue disclosure. Slide PNGs + PDF persist as
  conversation files.
- **Daytona tag gotcha confirmed the hard way:** a worker that ever failed to
  resolve a tag keeps failing it — after a bad push attempt of `:1.1` (poisoned
  local docker cache: `curl|bash` nodesource layer silently no-op'd on corporate
  Wi-Fi → npm missing), the re-pushed `:1.1` still read "not found" on Daytona.
  Bumping to `:1.2` fixed it. Never reuse a tag, and never pipe `docker build/push`
  through `tail` (it masks the exit code).

### Topology

```
LibreChat backend  (:3080)           — LibreChat-086, branch release_8.6
        │  /exec, /upload, /download with x-api-key
        ▼
Daytona adapter   (:8765)            — Librechat-Daytona-Interpreter, branch feat/skills-image
        │  spawns sandboxes from a custom image on
        ▼
Daytona Cloud     app.daytona.io     — shared org, 30 GiB total disk cap
```

### Sandbox image — `kuntik/librechat-skills:1.2` (Docker Hub, public; `:0.3` notes below still apply)

Built from `Librechat-Daytona-Interpreter/sandbox-image/Dockerfile`. Carries:

- `python:3.12-slim` base
- LibreOffice (calc/writer/impress) + pandoc + poppler + qpdf + tesseract
- Node.js 20 + `pptxgenjs`, `docx` npm globals (NODE_PATH=/usr/lib/node_modules so
  globals resolve from any script location)
- pip: `openpyxl`, `python-docx`, `python-pptx`, `pandas`, `matplotlib`, `pillow`,
  `tabulate`, `pypdf`, `pdfplumber`, `reportlab`, `pytesseract`, `pdf2image`,
  `markitdown[pptx]`
- `https://github.com/anthropics/skills` cloned into `/opt/anthropic-skills/`
  (each skill's `scripts/` dir on `PYTHONPATH`)
- **(0.3)** `sanitize_xlsx.py` at `/opt/skill-tools/` (on `PATH` as `sanitize_xlsx`
  and on `PYTHONPATH`) — strips openpyxl's `x14` conditional-formatting extension
  that makes Excel demand "Repair" on data-bar workbooks. See gotcha #7.

To rebuild after a Dockerfile change:

```bash
cd /Users/kuntik/work/Librechat-Daytona-Interpreter
docker build --platform linux/amd64 -t kuntik/librechat-skills:<next-tag> sandbox-image/
docker push kuntik/librechat-skills:<next-tag>
# Then bump DAYTONA_SANDBOX_IMAGE in adapter .env and restart uvicorn.
# Never reuse a tag (Daytona caches by tag on workers).
```

### Adapter wiring

Adapter `.env` in `Librechat-Daytona-Interpreter`:

```dotenv
DAYTONA_SANDBOX_IMAGE=kuntik/librechat-skills:1.2
DAYTONA_SANDBOX_DISK=3                # MUST be ≥3 (image is ~1.5 GB)
SESSION_TTL_SECONDS=1800              # idle sandbox reap after 30 min (live .env)
BUCKET_ROOT=./buckets                 # persistent identity-keyed file storage
```

When `DAYTONA_SANDBOX_IMAGE` is set, the adapter skips its per-session pip-install
priming (everything is baked in).

### Storage/compute split (adapter `new_develop`, built 2026-06-09)

The adapter separates **storage** from **compute** so multi-file agents (e.g. a
promo deck with a template + a master xlsx) reliably see all their files, with
per-session + per-user isolation. Full plan:
`Librechat-Daytona-Interpreter/PLAN_storage_compute_split.md`.

- **Bucket = storage.** `/upload` requests that carry a `kind`+`id` identity
  (LibreChat's `appendCodeEnvFileIdentity`) write to a persistent host dir
  `BUCKET_ROOT/<kind:id[:v:N]>/<file>` — **no sandbox is created**. The bucket
  key is returned as `storage_session_id` (stable, so `codeEnvRef` stops going
  stale). `app/buckets.py` (`BucketStore`, `bucket_key`). Legacy uploads with no
  identity still use the old sandbox path.
- **Sandbox = compute, keyed by `conversationId`.** LibreChat's
  `seedConversationExecSession` now *always* sets the representative
  `EXECUTE_CODE` `session_id` to the conversation id (overriding any
  file/skill-derived id), keeping per-file bucket keys on `files`. One sandbox
  per conversation → isolated per session AND per user.
- **Copy-in on `/exec`.** Before running, the adapter copies each referenced
  bucket file into the sandbox `/workspace` (idempotent — skips files already
  present by basename; a reaped+recreated sandbox re-hydrates from the surviving
  bucket). `read_file` flows through `/exec` so it gets copy-in for free.
- **Not yet done (optional follow-ups):** Phase 5 freshness/`getSessionInfo`
  endpoint to stop the idempotent per-turn re-upload churn; bucket GC/retention.

### Skills (LibreChat 0.8.6 native, DB-backed)

0.8.6 ships first-class Skills: schema in `packages/data-schemas/src/schema/skill.ts`,
catalog injection in `packages/api/src/agents/skills.ts`, route in
`api/server/routes/skills.js`. The model gets a `skill` tool to load any cataloged
skill's body mid-turn.

Four office skills are seeded into the local Mongo (one-off): `xlsx`, `docx`,
`pptx`, `pdf`. All have `alwaysApply=false` so the model auto-discovers via
description match. To re-seed (e.g. after wiping Mongo), the script is at
`/tmp/seed-skills.sh`. Frontmatter MUST be `{}` — Anthropic's SKILL.md files
include a `license` key that the validator rejects in strict mode.

For an agent to use them: open the agent builder, ensure the four skills are
enabled in the Skills section. If a user types `$` in the chat input, the
popover lists the available skills (manual prime).

### Common gotchas (code-interpreter-specific)

1. **Daytona disk quota.** Org cap is 30 GiB; each sandbox claims `DAYTONA_SANDBOX_DISK`
   GiB. With disk=3, ~10 concurrent max. STOPPED sandboxes still count against
   quota. Cleanup snippet (uses adapter venv):
   ```bash
   cd /Users/kuntik/work/Librechat-Daytona-Interpreter && .venv/bin/python -c "
   from dotenv import dotenv_values; import os
   c=dotenv_values('.env'); os.environ['DAYTONA_API_KEY']=c['DAYTONA_API_KEY']
   if c.get('DAYTONA_API_URL'): os.environ['DAYTONA_API_URL']=c['DAYTONA_API_URL']
   from daytona_sdk import Daytona
   for sb in list(Daytona().list()): sb.delete()
   "
   ```
2. **Image tags are pinned.** Daytona caches by tag on each worker. To roll out
   a Dockerfile change you must bump the tag (`:0.3` → `:0.4`); reusing a tag
   does nothing on already-warmed workers.
3. **NODE_PATH for npm globals.** Without `NODE_PATH=/usr/lib/node_modules`, a
   script in `/mnt/data` doing `require('pptxgenjs')` fails with MODULE_NOT_FOUND
   even though the package is installed globally. Already baked into `:0.3`.
4. **Corporate Wi-Fi.** Docker Hub pushes and Daytona API calls can drop mid-stream
   on the Mattoni network. Switch to hotspot and retry.
5. **0.8.6 expects JWT eventually.** `LibreChat-086/packages/api/src/auth/codeapi.ts`
   carries a patch that re-enables `x-api-key` for the adapter's contract.
   When OSS Code Interpreter ships with JWT mode mandatory, drop this patch and
   teach the adapter to verify the EdDSA/RS256 tokens.
6. **Skill body validator rejects `license` key.** Anthropic SKILL.md frontmatter
   has `license: Proprietary…` which is not in `ALLOWED_FRONTMATTER_KEYS`. Pass
   `frontmatter: {}` when POSTing to `/api/skills`.
7. **openpyxl data bars make Excel demand "Repair".** openpyxl writes data-bar
   (and some conditional) formatting twice — a legacy rule plus an `x14`
   extension copy (URIs `{78C0D931…}` worksheet-level + `{B025F937…}` per-rule).
   Excel cross-validates and pops "We found a problem with some content →
   Repaired Records: Conditional formatting" on open. The file is otherwise
   valid (opens after the prompt), but it reads as corrupt. `recalc.py` only
   checks *formula* errors, so it passes a broken file as "0 errors". Fix baked
   into `:0.3`: run `sanitize_xlsx <file>` (= `python /opt/skill-tools/sanitize_xlsx.py
   <file>`) after recalc — it strips only the x14 CF extension and normalizes
   degenerate `min/max` cfvo, leaving the legacy data bars (which render fine).
   Idempotent. The DB-backed `xlsx` skill (Mongo `db.skills`) now mandates this
   as workflow step `3b`. To retro-fix an already-delivered file on the host,
   run the same script against `LibreChat-086/uploads/<userId>/<file_id>__*.xlsx`.
8. **Uploaded files not reaching `/mnt/data` — FIXED 2026-06-05 (adapter
   `feat/skills-image`).** A file attached to a code-interpreter chat uploaded
   fine but every `/exec` ran in a *fresh empty* sandbox (`FileNotFound`,
   `ls /mnt/data` = `total 0`). NOT the vision-attachment limitation at the top
   of this section — three `storage_session_id` **contract mismatches** between
   the Daytona adapter and LibreChat 0.8.6's codeapi client:
   - **`/upload` response** must return `storage_session_id` (LibreChat
     `crud.js` reads exactly that key; the adapter only sent `session_id`, so
     the file's session was recorded as `undefined`). Fixed in
     `app/models.py` (`UploadResponse`) + `app/main.py`.
   - **`/exec` file refs** carry the session under `storage_session_id`, *not*
     `session_id` — the exec body has no top-level `session_id` at all
     (`BashExecutor.cjs` puts the binding inside `postData.files`). The adapter's
     `_extract_session_id_from_files` now reads `storage_session_id` first
     (legacy `session_id`/`sessionId` as fallback).
   - **session reuse across languages.** Uploads create a `python` session; the
     agent execs via the bash bridge (`lang=bash`). `create_sandbox` coerces
     bash→python (one shared sandbox), so the session-language guard now
     normalizes bash↔python instead of 409-ing. `app/session_service.py`.
   Verified end-to-end against Daytona: `/upload` + `/exec` reuse one sandbox
   and the file is present (openpyxl read all sheets). **Latent:** `getSessionInfo`
   does `GET /sessions/<sid>/objects/<fid>` which the adapter doesn't implement
   → 404 → LibreChat re-uploads every turn (works, but wastes a sandbox/turn).

### Verifying a skill actually fired

A skill-driven flow shows multiple `run_code` calls sharing one `sandbox_id` in
`/tmp/daytona-interpreter.log`. A single call = the model wrote one freestyle
script and ignored the skill. Quick checks:

```bash
# Did anyone read a SKILL.md?
grep -iE "anthropic-skills/skills/.*SKILL.md" /tmp/daytona-interpreter.log

# How many run_code calls per sandbox?
awk '/run_code/ {match($0,/sandbox_id=[a-z0-9-]+/); print substr($0,RSTART,RLENGTH)}' \
  /tmp/daytona-interpreter.log | sort | uniq -c | sort -rn

# Which image is being used?
grep -E "fast-path image=" /tmp/daytona-interpreter.log | tail -3
```

In the LibreChat chat UI itself, the agent's tool-call list shows a `skill`
invocation when the catalog path fires.
