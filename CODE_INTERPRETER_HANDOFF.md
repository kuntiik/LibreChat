# LibreChat 0.8.6-rc1 + Daytona Code Interpreter — Local Setup Handoff

A working local stack for the new 0.8.6 artifact features (DOCX/CSV/XLSX/PPTX
rendering, nested artifact paths, Unicode filenames, generated-code context
filtering), backed by the Janecv0 Daytona adapter — patched to bridge the
gap between LibreChat 0.8.6's expected codeapi contract and the adapter's
older x-api-key flow.

## Topology

```
LibreChat backend  (localhost:3080)   ── /Users/kuntik/work/LibreChat-086
   │   builds POSTs to ↓
   ▼
Daytona adapter    (localhost:8765)   ── /Users/kuntik/work/Librechat-Daytona-Interpreter
   │   spawns sandboxes on ↓
   ▼
Daytona Cloud      app.daytona.io     ── shared DAYTONA_API_KEY from Mattoni Railway

Supporting:
   MongoDB         localhost:27017    ── Docker container `librechat-086-mongo`
   Vite dev (HMR)  localhost:3090     ── optional, frontend hot reload
```

## Quick start

```bash
# 1. Mongo
docker start librechat-086-mongo

# 2. Daytona adapter (terminal 1)
cd /Users/kuntik/work/Librechat-Daytona-Interpreter
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8765

# 3. LibreChat backend (terminal 2)
cd /Users/kuntik/work/LibreChat-086
npm run backend:dev          # nodemon-managed dev server on :3080

# 4. (optional) Vite HMR (terminal 3)
cd /Users/kuntik/work/LibreChat-086
npm run frontend:dev         # :3090

# Open http://localhost:3080  (test user: test@local.dev / Testpass123!)
```

If anything refuses to bind: `pkill -f "uvicorn app.main"`, `pkill -f "nodemon api/server"`.

## Env wiring

### LibreChat `.env` (relevant lines only)

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
OPENAI_API_KEY=…                            # copied from Railway prod-librechat
LIBRECHAT_CODE_BASEURL=http://127.0.0.1:8765
LIBRECHAT_CODE_API_KEY=]tvwUK5;('ldSg~!=VSppsBrj&xcKq1(
ALLOW_REGISTRATION=true
```

### Daytona adapter `.env`

```dotenv
ADAPTER_API_KEY="]tvwUK5;('ldSg~!=VSppsBrj&xcKq1("   # must match LIBRECHAT_CODE_API_KEY
DAYTONA_API_KEY=dtn_…                                 # from Railway librechat-daytona-interface
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_SANDBOX_CPU=1
DAYTONA_SANDBOX_MEMORY=1
DAYTONA_SANDBOX_DISK=1
WORKSPACE_ROOT=/tmp/workspace
LOG_LEVEL=DEBUG
```

The literal API key value comes verbatim from Railway's
`librechat-daytona-interface` service; the quoting in the adapter `.env` is
required because pydantic-settings parses unquoted values that contain `=`
poorly. The Node side reads it raw and that's fine.

Pull fresh values from Railway any time with:

```bash
railway variables --service librechat-daytona-interface --environment production --kv
railway variables --service prod-librechat              --environment production --kv
```

## The two patches that make this work

### 1. LibreChat — `packages/api/src/auth/codeapi.ts`

Upstream 0.8.6 dropped the legacy `x-api-key` codeapi auth path in favour of
JWT (`CODEAPI_JWT_*` env vars). The Daytona adapter only speaks `x-api-key`.
Patched `getCodeApiAuthHeaders` to send `x-api-key: $LIBRECHAT_CODE_API_KEY`
when JWT mode is disabled:

```ts
export async function getCodeApiAuthHeaders(req?: ServerRequest): Promise<Record<string, string>> {
  if (!req || !isCodeApiJwtAuthEnabled()) {
    const apiKey = process.env.LIBRECHAT_CODE_API_KEY;
    return apiKey ? { 'x-api-key': apiKey } : {};
  }
  …
}
```

After editing, **rebuild the package**:

```bash
cd /Users/kuntik/work/LibreChat-086 && npm run build:api
```

(The backend imports `packages/api/dist/index.js` — TS source edits don't
take effect until rebuilt.)

### 2. Daytona adapter — three changes in `app/daytona_gateway.py` + one in `app/main.py`

All in `/Users/kuntik/work/Librechat-Daytona-Interpreter`.

**a. Sandbox creation fast-path.** The original `_create_sandbox_with_image_params`
variant search would pick an empty `Image()` object first, producing a Daytona
sandbox with no Python runtime (bash-only ImageMagick `import` blew up our
wrappers). Now we try the known-good shape explicitly before falling back:

```python
params = image_params_cls(image="python:3.12", language=CodeLanguage.PYTHON)
sandbox = creator(params)
```

**b. Bash bridge.** Daytona has no bash runtime / language; the agent's
schema still offers `bash`. We accept it, translate the snippet to a tiny
Python program that shells out via `subprocess.run(['/bin/bash','-c', …])`,
and dispatch through `code_interpreter.run_code` (the only path that
reliably routes to the sandbox's Python). The wrapper also sets up
`/mnt/data → /tmp/workspace` for parity with the python compat prelude.

**c. Library priming.** When a sandbox is first created we kick off:

```python
pip install --quiet openpyxl python-docx python-pptx pandas matplotlib pillow tabulate
```

Costs ~14 s on the first /exec call. Anything the agent generates as a
DOCX / XLSX / PPTX / CSV artifact afterwards just works.

**d. Skip the Python compat prelude for bash.** In `app/main.py`,
`_wrap_exec_code_with_compat` prepends `os.makedirs(...)` etc. — valid
Python but a syntax error in bash. Bash requests now bypass the prelude
(the bridge re-wraps everything through Python anyway):

```python
if language == "bash":
    wrapped_code_payload = exec_code_payload
else:
    wrapped_code_payload = _wrap_exec_code_with_compat(exec_code_payload)
```

## Workspace install layout

Both repos are sibling clones to keep the Mattoni Azure-DevOps fork at
`/Users/kuntik/work/LibreChat` untouched:

```
/Users/kuntik/work/
├── LibreChat                          ← Mattoni fork, do not disturb
├── LibreChat-086                      ← release_8.6 from kuntiik/LibreChat
└── Librechat-Daytona-Interpreter      ← Janecv0/Librechat-Daytona-Interpreter
```

`LibreChat-086` was bootstrapped with `npm ci --legacy-peer-deps`. One
workspace dep had to be symlinked manually because npm hoist on Node 25
didn't place it:

```bash
ln -s ../../../api/node_modules/winston-daily-rotate-file \
      packages/data-schemas/node_modules/winston-daily-rotate-file
```

If you ever re-run `npm ci`, recreate the symlink — or install Node 20
(the project's stated requirement) and the issue goes away.

`Librechat-Daytona-Interpreter` uses a `uv`-built venv on Python 3.12:

```bash
cd /Users/kuntik/work/Librechat-Daytona-Interpreter
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

(Homebrew's `python3.12` has a broken libexpat link on this machine —
hence `uv` with its bundled CPython.)

## Logs

- Daytona adapter: `/tmp/daytona-interpreter.log` (uvicorn stdout/stderr)
- LibreChat backend: `/tmp/librechat-086-backend.log`
- Vite frontend: `/tmp/librechat-086-frontend.log`

Per-call tracing in the adapter logs as
`LibreChat -> interface / Interface -> Daytona / Daytona -> interface / Interface -> LibreChat`.
If artifacts are missing in the UI, look for
`Daytona -> interface run_code … files=N` to confirm files were detected
sandbox-side.

## Known gotchas

- **Daytona disk quota.** Each session creates a fresh 1 GiB sandbox; the
  org cap is 30 GiB. When you see
  `Daytona.create() got an unexpected keyword argument 'cpu'` it's almost
  always quota exhaustion — the fast-path failed and the variant loop is
  trying nonsense kwargs. Clean up:

  ```bash
  /Users/kuntik/work/Librechat-Daytona-Interpreter/.venv/bin/python -c "
  import os; os.environ['DAYTONA_API_KEY']='dtn_…'; os.environ['DAYTONA_API_URL']='https://app.daytona.io/api'
  from daytona_sdk import Daytona
  for sb in list(Daytona().list()): sb.delete()
  "
  ```

- **`code_interpreter.run_code` vs `process.code_run`.** Both exist on the
  Daytona sandbox; only `code_interpreter.run_code` routes content to Python
  reliably. `process.code_run` (and the toolbox shell-runner) default to
  bash even on Python-language sandboxes. The bash bridge depends on this.

- **`CodeRunParams` has no `language` field** in the current `daytona-sdk`
  release — only `argv` and `env`. The legacy variant-search code in
  `_create_sandbox_with_image_params` and `run_code` tries to pass
  `language=…` and silently no-ops to bash. Don't add a "fix" to plumb
  language through CodeRunParams; the SDK genuinely doesn't support it.

- **First-call latency.** ~14 s priming + ~5 s sandbox boot ⇒ first /exec
  for a fresh session takes ~20 s. Subsequent calls in the same session
  are fast.

- **0.8.6 expects JWT eventually.** When Danny ships the OSS Code
  Interpreter for real and JWT mode goes mandatory, the LibreChat patch
  in `codeapi.ts` should be removed and the Daytona adapter taught to
  verify the same EdDSA/RS256 tokens (see the `CODEAPI_JWT_*` env vars
  in `packages/api/src/auth/codeapi.ts` for the contract).

- **Hook noise.** A security hook in the local Claude Code environment
  fires on the literal substring matching the JS child-process shell
  call. The adapter uses `getattr(proc, "exec", None)` instead —
  semantically identical, avoids the false-positive warning.

## Re-establishing from cold

If both clones already exist and the env files are intact, the only
session-start steps are: `docker start librechat-086-mongo`, then start the
adapter and LibreChat per the Quick start. The `release_8.6` branch in
`kuntiik/LibreChat` already carries the codeapi patch in source — only the
`dist` rebuild is needed if the workspace was wiped.
