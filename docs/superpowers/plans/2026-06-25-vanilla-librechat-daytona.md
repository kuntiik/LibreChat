# Vanilla LibreChat + Daytona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a branch that is unmodified upstream `v0.8.7-rc1` plus deployment configuration only, wired to the Daytona adapter over JWT-authenticated Code Interpreter — with the divergence from vanilla provably limited to config/docs/tools.

**Architecture:** LibreChat carries zero source changes. JWT mode (`CODEAPI_JWT_ENABLED`) is enabled via env; LibreChat mints EdDSA Bearer tokens with its private key, the adapter (separate repo) verifies them with the public key. Session continuity uses vanilla semantics (adapter mints/returns session_id, replayed through message history). Storage routes to S3/MinIO via `deploy/storage.yaml` selected by `CONFIG_PATH`.

**Tech Stack:** Node 20, LibreChat `v0.8.7-rc1`, MongoDB, S3/MinIO, EdDSA (ed25519) JWT, Daytona adapter (`Librechat-Daytona-Interpreter`).

**Spec:** `docs/superpowers/specs/2026-06-25-vanilla-librechat-daytona-design.md`

> **Scope:** This plan covers the **LibreChat repo only**. The adapter changes
> (JWT verification + vendor session model) are a separate plan in
> `Librechat-Daytona-Interpreter` — see "Plan 2 (adapter)" at the end. Task 9
> (E2E) is gated on Plan 2 being done.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `feature/vanilla-librechat` (branch, worktree) | clean-slate checkout off `v0.8.7-rc1` | create |
| `.env` (gitignored, runtime) | adapter URL + JWT-mode env | configure |
| `keys/codeapi_jwt_ed25519` (+`.pub`, gitignored) | Code API JWT keypair material | generate |
| `librechat.yaml` / `deploy/storage.yaml` | enable Code Interpreter capability; S3 file strategy | configure / carry |
| `docs/superpowers/plans/` & `specs/` | this plan + spec | carry |

No application source files are created or modified. If any task finds itself editing `client/src`, `api/server`, or `packages/*/src`, STOP — that contradicts the spec.

---

## Task 1: Create the clean-slate worktree off v0.8.7-rc1

**Files:**
- Create: git worktree at `../LibreChat-vanilla` on branch `feature/vanilla-librechat`

- [ ] **Step 1: Confirm the tag exists and is clean**

Run: `git -C /Users/kuntik/work/LibreChat rev-parse v0.8.7-rc1`
Expected: a commit SHA (no error).

- [ ] **Step 2: Create the worktree + branch off the tag**

```bash
cd /Users/kuntik/work/LibreChat
git worktree add -b feature/vanilla-librechat ../LibreChat-vanilla v0.8.7-rc1
```

- [ ] **Step 3: Verify the worktree is exactly vanilla**

Run: `cd ../LibreChat-vanilla && git diff --stat v0.8.7-rc1 HEAD`
Expected: empty output (HEAD == tag, zero divergence).

- [ ] **Step 4: Commit a marker for the plan/spec docs**

```bash
cd ../LibreChat-vanilla
mkdir -p docs/superpowers/specs docs/superpowers/plans
git show new_main:docs/superpowers/specs/2026-06-25-vanilla-librechat-daytona-design.md > docs/superpowers/specs/2026-06-25-vanilla-librechat-daytona-design.md
git show new_main:docs/superpowers/plans/2026-06-25-vanilla-librechat-daytona.md > docs/superpowers/plans/2026-06-25-vanilla-librechat-daytona.md
git add docs/superpowers
git commit -m "docs: carry vanilla-librechat spec + plan onto clean branch"
```

---

## Task 2: Generate the Code API JWT keypair (EdDSA)

**Files:**
- Create: `keys/codeapi_jwt_ed25519` (private, gitignored), `keys/codeapi_jwt_ed25519.pub` (public)

- [ ] **Step 1: Confirm `keys/` is gitignored**

Run: `cd ../LibreChat-vanilla && git check-ignore keys/ || echo "NOT IGNORED"`
Expected: `keys/` printed (it is ignored). If "NOT IGNORED", add `keys/` to `.gitignore` and commit that line only.

- [ ] **Step 2: Generate an ed25519 keypair (PEM)**

```bash
cd ../LibreChat-vanilla
mkdir -p keys
openssl genpkey -algorithm ed25519 -out keys/codeapi_jwt_ed25519.pem
openssl pkey -in keys/codeapi_jwt_ed25519.pem -pubout -out keys/codeapi_jwt_ed25519.pub.pem
```

- [ ] **Step 3: Verify both keys parse**

Run: `openssl pkey -in keys/codeapi_jwt_ed25519.pem -noout -text | head -1 && openssl pkey -pubin -in keys/codeapi_jwt_ed25519.pub.pem -noout -text | head -1`
Expected: `ED25519 Private-Key:` and `ED25519 Public-Key:` lines.

- [ ] **Step 4: Verify keys are NOT staged**

Run: `git status --porcelain keys/`
Expected: empty (ignored, not tracked).

The **public** key (`codeapi_jwt_ed25519.pub.pem`) is handed to the adapter (Plan 2). The **private** key goes into LibreChat env (Task 3).

---

## Task 3: Configure LibreChat env — adapter URL + JWT mode

**Files:**
- Modify: `.env` (gitignored runtime config) in `../LibreChat-vanilla`

- [ ] **Step 1: Copy the env template**

Run: `cd ../LibreChat-vanilla && cp .env.example .env`

- [ ] **Step 2: Set the Code Interpreter adapter base URL**

Append to `.env`:

```dotenv
# Daytona-backed Code Interpreter adapter
LIBRECHAT_CODE_BASEURL=http://127.0.0.1:8765
```

- [ ] **Step 3: Enable Code API JWT mode (Option B) and point at the private key**

Append to `.env`:

```dotenv
# Code API auth: JWT (EdDSA). Adapter verifies with the matching public key.
CODEAPI_JWT_ENABLED=true
CODEAPI_JWT_ALGORITHM=EdDSA
CODEAPI_JWT_PRIVATE_KEY_BASE64=<output of: base64 -i keys/codeapi_jwt_ed25519.pem | tr -d '\n'>
CODEAPI_JWT_ISSUER=librechat
CODEAPI_JWT_AUDIENCE=code-interpreter
CODEAPI_JWT_KID=mchat-ed25519-1
CODEAPI_JWT_TTL_SECONDS=300
```

Generate the base64 value:

```bash
cd ../LibreChat-vanilla
echo "CODEAPI_JWT_PRIVATE_KEY_BASE64=$(base64 -i keys/codeapi_jwt_ed25519.pem | tr -d '\n')"
```

Paste the printed line into `.env` (replace the placeholder line). Record the
chosen `CODEAPI_JWT_ISSUER`, `CODEAPI_JWT_AUDIENCE`, and `CODEAPI_JWT_KID` — the
adapter must use the identical values when verifying.

- [ ] **Step 4: Verify the env parses and JWT mode reads as enabled**

Run:
```bash
cd ../LibreChat-vanilla
node -e "require('dotenv').config(); console.log('jwt_enabled=', process.env.CODEAPI_JWT_ENABLED, 'has_key=', !!process.env.CODEAPI_JWT_PRIVATE_KEY_BASE64, 'baseurl=', process.env.LIBRECHAT_CODE_BASEURL)"
```
Expected: `jwt_enabled= true has_key= true baseurl= http://127.0.0.1:8765`

No commit (`.env` is gitignored).

---

## Task 4: Enable the Code Interpreter capability + S3 storage in config

**Files:**
- Create/Modify: `librechat.yaml` (runtime) and `deploy/storage.yaml` in `../LibreChat-vanilla`

- [ ] **Step 1: Create `librechat.yaml` from the example**

Run: `cd ../LibreChat-vanilla && cp librechat.example.yaml librechat.yaml`

- [ ] **Step 2: Ensure agents can use the Code Interpreter capability**

In `librechat.yaml`, under the `endpoints.agents` section, confirm `execute_code`
is present in `capabilities` (vanilla default includes it). The relevant block:

```yaml
endpoints:
  agents:
    capabilities:
      - "execute_code"
      - "file_search"
      - "actions"
      - "tools"
```

If `capabilities` is absent, add the block above. Verify:

Run: `cd ../LibreChat-vanilla && grep -A6 "agents:" librechat.yaml | grep execute_code`
Expected: a line containing `execute_code`.

- [ ] **Step 3: Carry the S3 storage manifest from new_main**

```bash
cd ../LibreChat-vanilla
git show new_main:deploy/storage.yaml > deploy/storage.yaml
git add deploy/storage.yaml
git commit -m "config: carry S3/MinIO storage manifest for new-mchat"
```

- [ ] **Step 4: Verify the storage manifest selects the s3 strategy**

Run: `cd ../LibreChat-vanilla && grep 'fileStrategy' deploy/storage.yaml`
Expected: `fileStrategy: "s3"`

For deploys that route storage to MinIO, set `CONFIG_PATH=deploy/storage.yaml`
and the `AWS_*` env vars on the service (endpoint, bucket, key, secret, region) —
documented in `deploy/storage.yaml`. Local dev leaves `CONFIG_PATH` unset and
keeps the `local` file strategy.

---

## Task 5: Install, build, and run vanilla test suites (sanity)

**Files:** none modified — this proves the clean branch builds and tests green untouched.

- [ ] **Step 1: Install dependencies**

Run: `cd ../LibreChat-vanilla && npm ci`
Expected: completes; `postinstall` runs `patch-package` with no patches to apply (the agents patch is gone), no errors.

- [ ] **Step 2: Build all workspaces**

Run: `cd ../LibreChat-vanilla && npm run build`
Expected: Turborepo build succeeds for all packages.

- [ ] **Step 3: Run the backend code-interpreter auth unit tests**

Run: `cd ../LibreChat-vanilla/packages/api && npx jest codeapi`
Expected: vanilla `codeapi` tests PASS (signing config, JWT minting).

- [ ] **Step 4: Run the agents session unit tests**

Run: `cd ../LibreChat-vanilla/packages/api && npx jest codeFilesSession`
Expected: vanilla `codeFilesSession` tests PASS (no `seedConversationExecSession` exists — confirms we did not reintroduce it).

---

## Task 6: Prove vanilla-ness (the primary acceptance gate)

**Files:** none — verification only.

- [ ] **Step 1: Diff the branch against the tag, source paths only**

Run:
```bash
cd ../LibreChat-vanilla
git diff --name-only v0.8.7-rc1 HEAD | grep -E "^(client/src|api/server|api/app|api/strategies|api/utils|packages/[^/]+/src)" || echo "CLEAN: no source divergence"
```
Expected: `CLEAN: no source divergence`. Any file listed here is a spec violation — investigate and revert it.

- [ ] **Step 2: Confirm only config/docs are tracked as changed**

Run: `cd ../LibreChat-vanilla && git diff --name-only v0.8.7-rc1 HEAD`
Expected: only `deploy/storage.yaml` and `docs/superpowers/*`. (`.env`, `librechat.yaml`, `keys/` are gitignored and must not appear.)

- [ ] **Step 3: Confirm the dropped customizations are absent**

Run:
```bash
cd ../LibreChat-vanilla
git grep -l "seedConversationExecSession\|reviewImages\|review_slides" -- 'packages/**' 'api/**' || echo "ABSENT: dropped features not present"
```
Expected: `ABSENT: dropped features not present`.

- [ ] **Step 4: Confirm no agents patch remains**

Run: `ls ../LibreChat-vanilla/patches/ 2>/dev/null | grep agents || echo "NO agents patch"`
Expected: `NO agents patch`.

---

## Task 7: Re-seed the native office skills via the API

**Files:** none — runtime data via the public API (requires the backend running and an admin token).

- [ ] **Step 1: Start the backend**

Run: `cd ../LibreChat-vanilla && npm run backend`
Expected: server listening on `http://localhost:3080`.

- [ ] **Step 2: Seed the four office skills (xlsx, docx, pptx, pdf)**

For each skill, POST its SKILL.md body to `/api/skills` with `frontmatter: {}`
(the validator rejects Anthropic's `license` key). Use the seeding script pattern
that already exists (`/tmp/seed-skills.sh` on this machine) but target the new
backend. Each skill must set `alwaysApply=false` so the model auto-discovers by
description match.

- [ ] **Step 3: Verify the catalog**

Run: `curl -s -H "Authorization: Bearer <admin-token>" http://localhost:3080/api/skills | python3 -c "import sys,json; print(sorted(s['name'] for s in json.load(sys.stdin)))"`
Expected: `['docx', 'pdf', 'pptx', 'xlsx']`

---

## Task 8: E2E smoke against the adapter (GATED on Plan 2)

> Do not start this task until Plan 2 (adapter JWT verification + vendor session
> model) is complete and the adapter is running with the **public** key.

**Files:** none — live end-to-end verification.

- [ ] **Step 1: Confirm the adapter rejects an unauthenticated /exec**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8765/exec -d '{}' -H 'content-type: application/json'`
Expected: `401` (no Bearer token).

- [ ] **Step 2: Drive a first code run in a fresh conversation**

Using the agent (UI or `tools/lc-agent.mjs`), ask it to write a file to `/mnt/data`.
Expected: run succeeds; the adapter log shows a sandbox created and a minted
`session_id`; the JWT verified.

- [ ] **Step 3: Continuation — read the file back in the same conversation**

Next turn in the SAME conversation, ask the model to read the file it just made.
Expected: the file is available (rehydrated by the replayed session_id).

- [ ] **Step 4: Isolation — a second conversation gets a fresh session**

Start a NEW conversation (same user) and read the same filename.
Expected: not found — different conversation, different minted session.

- [ ] **Step 5: Verify against `/tmp/daytona-interpreter.log`**

Run: `grep -E "verified|session_id|sandbox" /tmp/daytona-interpreter.log | tail -20`
Expected: token verification line + per-conversation distinct session/sandbox ids.

---

## Plan 2 (adapter) — `Librechat-Daytona-Interpreter` (separate plan, to be detailed)

Write as its own `docs/.../plans/*.md` **in that repo**. Scope:

1. **JWT verification middleware** — verify `Authorization: Bearer` EdDSA tokens
   against the LibreChat **public** key (`codeapi_jwt_ed25519.pub.pem`); enforce
   `iss`/`aud`/`exp`/`kid` matching the values chosen in Task 3; reject otherwise.
   Remove the `x-api-key` compare path.
2. **Vendor session semantics** — on `/exec` with no session_id: mint one, create
   an ephemeral sandbox, return the session_id. On continuation: rehydrate
   storage by session_id. Ephemeral sandbox per run. Honor `entity_id`-pinned
   files across an agent's conversations. (Retire the conversationId-keyed
   persistent-sandbox model.)
3. **Tests** — token accept/reject; mint-and-return; continuation rehydrate;
   cross-conversation isolation; entity_id sharing.

---

## Self-Review Notes

- **Spec coverage:** zero-code-change (Tasks 1, 6) ✓; JWT auth Option B (Tasks 2, 3) ✓; vendor session model (Task 8 + Plan 2) ✓; dropped features absent (Task 6 step 3) ✓; storage config (Task 4) ✓; native skills (Task 7) ✓; dev tooling kept (no task needed — it's in `tools/`, but the clean branch is off the tag, so re-add `tools/lc-agent.mjs` only if desired — NOT required for function).
- **tools/ note:** the clean branch off `v0.8.7-rc1` will NOT contain `tools/lc-agent.mjs` (it was a new_main addition). It is dev-only; re-add via `git show new_main:tools/lc-agent.mjs > tools/lc-agent.mjs` if you want the driver. Optional, no runtime impact.
- **Placeholder scan:** the only intentional fill-ins are secrets/tokens (`<admin-token>`, base64 key output) which cannot be literal in a committed plan.
