# Decision: fresh-eyes visual QA via a native `review_slides` tool

**Date:** 2026-06-04
**Status:** Implemented (LibreChat-086, active code-interpreter fork)
**Owner:** Lukáš

## Problem

The pptx skill's QA step is built around dispatching a **fresh-eyes
subagent** to visually inspect rendered slides:

> ⚠️ USE SUBAGENTS — You've been staring at the code and will see what you
> expect, not what's there. Subagents have fresh eyes.

This platform has **no vision subagent**. The earlier D1 fix
(`read_file` returns rendered images as `image_url` artifacts) lets the
*main* agent see its own output — but it's the **same agent that wrote the
generation code**, i.e. exactly the confirmation-bias scenario the skill
warns about. Observed behavior (convo `2a5fed6c`, 2026-06-04): the agent
rendered the deck, read every slide image back via `read_file`, then
returned the **unchanged** pptx — no fix-and-verify cycle ran (only one
`.pptx` artifact, no revision).

## Decision

Build a **real fresh-eyes pass**: a second LLM call that sees **only the
rendered slide images + the original brief — never the generation code or
the deck-builder's reasoning**. Expose it to the agent as a **native
LibreChat tool** named `review_slides`.

### Why native tool (over a sandbox QA script)

Considered alternative: ship a `qa_review.py` in the sandbox image that
calls an LLM and prints issues (zero LibreChat code changes, fully
portable). Rejected for now in favor of a native tool because:

- Cleanest model UX — the agent calls one tool and gets structured issues
  back, no script-output parsing.
- Reuses the existing D1 vision wiring (`readSandboxFileBase64`,
  `imageMimeForExt`, magic-byte/size guards in `handlers.ts`).
- The reviewer model + key are configured server-side, not baked into the
  sandbox image or exposed to sandbox egress.

**Revisit trigger:** if maintaining the tool against `@librechat/agents`
upstream bumps becomes painful, or if we want the QA pass to work on
platforms without this fork, the sandbox-script approach is the fallback.
The reviewer prompt + contract below port directly.

## Architecture

```
agent (gpt-5.4, OpenAI)
  └─ calls tool: review_slides({ image_paths[], brief, expectations? })
        │
   handlers.ts handleReviewSlidesCall  (THIN: validate + delegate)
        │  passes imagePaths + brief + conversationId + req
        ▼
   options.reviewImages({ imagePaths, brief, expectations, conversationId, req })  ← injected dep
        │  (api/server/.../reviewImages.js)
        │  resolveImages: getFiles({conversationId}) → match by basename (newest)
        │                 → read bytes from storage (getStrategyFunctions) → base64
        ▼
   OpenAI gpt-4o (vision)  ← reviewer never saw the code = fresh eyes (default; anthropic opt-in)
        │  system = the skill's inspection checklist
        │  user   = brief + per-slide image blocks
        ▼
   returns per-slide issue list as text → handed back to the agent
        → agent fixes, re-renders, calls review_slides again
```

### Why persisted files, not the live sandbox (important)

The upstream `@librechat/agents` `ToolNode` attaches a `codeSessionContext`
(the sandbox `session_id` + file map) **only** to tools it recognizes —
`CODE_EXECUTION_TOOLS`, `skill`, and `read_file`. `review_slides` is a
LibreChat-local tool unknown to upstream, so it receives **no session
context** and therefore cannot read the ephemeral sandbox. (Discovered
during verification: the model called `review_slides` fine, but image
reads dead-ended.)

Rather than patch node_modules (no patch-package here — fragile), the
reviewer resolves the slides from the **conversation's persisted files**:
every rendered slide is saved to storage (with `conversationId`) and
surfaced as an attachment *before* the model calls `review_slides`. We
match the model's `image_paths` to those files by basename (newest wins),
and read bytes via the storage strategy. Bonus: this survives the 5-min
sandbox reaping and reviews exactly what the user sees.

### Reviewer model

"Fresh eyes" comes from the reviewer **never seeing the generation code**,
not from the provider — so any capable vision model works.

- Default: **OpenAI gpt-4o** (vision) via `OPENAI_API_KEY` — the provider
  actually wired in this deployment. (`ANTHROPIC_API_KEY` here is a 13-char
  placeholder, so Anthropic 401s; the original "different provider" idea
  was dropped when that surfaced during verification.) The deck-builder
  agent is gpt-5.4, so the reviewer is at least a different *model*.
- Overridable via env (see `reviewImages.js`):
  - `QA_REVIEW_PROVIDER` (`openai` default | `anthropic`)
  - `QA_REVIEW_MODEL` (default `gpt-4o`)
  - `QA_REVIEW_API_KEY` (falls back to `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`)
  - `QA_REVIEW_BASE_URL` (OpenAI-compatible gateway, optional)
- If a real Anthropic key is added later, set `QA_REVIEW_PROVIDER=anthropic`
  for true cross-provider independence.

### Tool contract

```
review_slides({
  image_paths: string[],   // required, 1..N rendered slide images in /mnt/data
  brief:       string,     // required, the original user request / deck goal
  expectations?: string[]  // optional, per-slide expected content
}) -> text  // reviewer's per-slide issue list
```

The tool registers only when the agent has code execution
(`registerCodeExecutionTools`, alongside `bash_tool`/`read_file`), since
QA presupposes rendered images in the sandbox. It is a *special* tool
(execution intercepted in `handlers.ts`), not a LangChain tool instance —
same pattern as `read_file` and `skill`.

## Files touched

- `packages/api/src/agents/tools.ts` — `REVIEW_SLIDES_DEF` + registration
  (gated on code execution, alongside `read_file`/`bash_tool`).
- `packages/api/src/agents/handlers.ts` — `reviewImages` dep on
  `ToolExecuteOptions`, thin `handleReviewSlidesCall`, dispatch branch
  (passes `conversationId` from `configurable`/`metadata.thread_id`).
- `packages/api/src/agents/{initialize,skills}.ts` — `includeReviewSlides`.
- `packages/api/src/agents/handlers.spec.ts` — unit tests.
- `api/server/services/Endpoints/agents/reviewImages.js` — resolves
  persisted slide files + makes the vision call.
- `api/server/services/Endpoints/agents/skillDeps.js` — wires `reviewImages`.
- `api/server/services/ToolService.js` — `review_slides` in `specialToolNames`.
- `api/server/index.js` — lifted Node's default 300s `requestTimeout`
  (`requestTimeout=0`, `headersTimeout=0`, long `keepAliveTimeout`): agent
  runs with code execution + visual QA routinely exceed 5 min, and the
  default would kill the HTTP connection and abort the run mid-flight.
- pptx skill body (DB-seeded) — QA section now instructs `review_slides`
  + a mandatory fix-and-re-render loop instead of "USE SUBAGENTS".

## Build / activate

`packages/api` is TS → build (`npm run build:api`); `api/` files are
runtime CJS. **Restart the backend** to load the rebuilt dist (nodemon
watches `api/` but not `packages/api/dist`).

## Known limits / to revisit

- Reviewer egress: the LibreChat *backend* makes the call (not the
  sandbox), so corporate-Wi-Fi / provider reachability applies to the host.
- No automatic enforcement that the agent actually *acts* on the issues —
  the fix-loop is prompt-driven in the skill body. If the model still
  ships unchanged decks, escalate to a hard gate (block "done" until a
  second render differs) in the agent system prompt.
- The reviewer sees images + brief only by construction; if we later pass
  more context, re-audit that the "fresh eyes" property still holds.
