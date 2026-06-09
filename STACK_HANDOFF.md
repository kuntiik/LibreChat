# Code-interpreter + PPTX stack — handoff (2026-06-08)

Cold-start brief for the local code-interpreter / slide-builder stack **after
switching the active clone from `LibreChat-086` to this repo (`LibreChat`)**.

---

## TL;DR — current live state

- **Backend runs from THIS repo** (`LibreChat`, branch `new_dev`) on `:3080`,
  started with `npm run backend` (production, no nodemon).
- **Daytona adapter** on `:8765` (repo `Librechat-Daytona-Interpreter`), sandbox
  image **`kuntik/librechat-skills:0.7`**.
- **Mongo** `mongodb://127.0.0.1:27017/LibreChat` (shared; was shared with `-086`).
- **PPTX builder agent**: `agent_88Pl6jcwNrRIrB6omZpNT` (gpt-5.4, `recursion_limit=250`).
- `LibreChat-086` is **superseded** — kept for reference only.

---

## Topology

```
Browser / lc-agent driver
        │
LibreChat backend (:3080)        ← THIS repo, branch new_dev  (npm run backend)
        │  /exec /upload /download with x-api-key (codeapi.ts patch)
        ▼
Daytona adapter   (:8765)        ← Librechat-Daytona-Interpreter (uvicorn, reads .env)
        │  spawns sandboxes from kuntik/librechat-skills:0.7
        ▼
Daytona Cloud     app.daytona.io
```

---

## Start the stack

1. **Mongo** on `:27017` (must be up first).
2. **Adapter** (`Librechat-Daytona-Interpreter`):
   ```bash
   cd /Users/kuntik/work/Librechat-Daytona-Interpreter
   nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8765 \
     >> /tmp/daytona-interpreter.log 2>&1 & disown
   ```
   Reads `.env` at startup (`DAYTONA_SANDBOX_IMAGE=kuntik/librechat-skills:0.7`).
   Restart is manual (kill the uvicorn PID + relaunch) — it has no `--reload`.
3. **Backend** (this repo):
   ```bash
   cd /Users/kuntik/work/LibreChat
   nohup npm run backend > /tmp/librechat-backend.log 2>&1 & disown
   ```
   Production mode — no nodemon, so generated artifacts in `uploads/` can't
   restart it mid-run. `curl localhost:3080/api/config` → `200` when ready.
   (Backend listens on `::1:3080` (IPv6) — use `curl localhost`, not
   `nc 127.0.0.1`.)
4. **Frontend**: production serves the built `client/dist` on `:3080`. For HMR
   while editing the client, `npm run frontend:dev` (`:3090`).

`RAG API ... not reachable` and `[indexSync] error fetch failed` (MeiliSearch)
on startup are **benign** — those services aren't running locally.

---

## Drive an agent over the API (no UI copy-paste)

Key in `.agent-api-key` (per-user API key; valid because the DB is shared).

```bash
cd /Users/kuntik/work/LibreChat
node tools/lc-agent.mjs models                       # list agents (auth check)
node tools/lc-agent.mjs send "<prompt>" --agent agent_88Pl6jcwNrRIrB6omZpNT
```

Long deck builds exceed undici's 300s default `headersTimeout`, so plain
`lc-agent.mjs send` **aborts while the server keeps going**. Use the wrapper:

```bash
node tools/lc-run.mjs "<prompt>" --agent agent_88Pl6jcwNrRIrB6omZpNT
```

`lc-run.mjs` sets a no-timeout undici dispatcher so the call waits for the full
response. Either way, **judge success by the delivered `.pptx`** in
`uploads/<userId>/` + `/tmp/daytona-interpreter.log`, not driver stdout.

---

## QA a delivered deck (render + geometry gate + eyeball)

```bash
DECK=/Users/kuntik/work/LibreChat/uploads/<userId>/<file>.pptx
mkdir -p /tmp/qa && cp "$DECK" /tmp/qa/d.pptx
docker run --rm --platform linux/amd64 -v /tmp/qa:/work kuntik/librechat-skills:0.7 \
  bash -lc 'cp /work/d.pptx /tmp/workspace/d.pptx
            bash /opt/skill-tools/slides/qa_deck.sh /tmp/workspace/d.pptx
            cp /tmp/workspace/preview/slide*.png /tmp/workspace/qa/contact-sheet.png /work/'
# then open /tmp/qa/slide-*.png (or contact-sheet.png)
```

`qa_deck.sh` renders each slide, builds a contact sheet, then runs the gate.

---

## The geometry gate (sandbox image `:0.7`)

Two layers, both shipped in the image:

1. **`deck_helpers.assertClean(deck)`** — in-memory, **pre-render**. Catches
   text/text collisions, text/image overlap, out-of-bounds. Knows only the
   *declared* pptxgenjs box sizes.
2. **`check_overlaps.py`** — **post-render** (pdfplumber on the LibreOffice PDF).
   Measures the *real* wrapped boxes, so it catches what assertClean can't:
   - text spilling **into a card** (panel-intrusion: a line that overlaps a
     large filled rect/curve but isn't fully contained in it);
   - wrapped-line / stacked-text collisions;
   - off-page elements.
   Column-aware line clustering (symmetric horizontal-adjacency) avoids
   false-positives on multi-card rows.

Fonts are baked + aliased so LibreOffice renders faithfully: **Carlito ≈ Calibri**,
**Gelasio ≈ Georgia** (fontconfig `99-deck-fonts.conf`).

The pptx **skill body** (the prompt) is DB-backed in Mongo (`db.skills`, name
`pptx`); its source is `seed/pptx-skill-body.md` in the Daytona repo, reseeded
via `seed/seed_pptx_skill.sh`.

---

## Known caveats

- **Recursion cap on the API path.** Deck runs that thrash through build→fix
  loops can hit a LangGraph recursion limit → HTTP 500 mid-build, shipping an
  *unfixed* deck (overlaps survive). Agent `recursion_limit` is `250` in Mongo;
  if the Responses API ignores it (earlier seen capping at 50), raise it
  server-side or tighten the skill to converge in fewer cycles.
- **Freestyle drift.** The model sometimes hand-writes raw `addText`/`addShape`
  with manual coordinate patching instead of the helpers → cramped boxes. A
  prompt hard-gate (mandate helpers + a passing `qa_deck.sh` before delivery)
  is not yet enforced.
- **Never reuse a Docker tag** — Daytona caches by tag on its workers. Bump
  `:0.7 → :0.8`, push, bump `.env`, restart the adapter.
- **Corporate Wi-Fi** can block `docker push` / Daytona — switch to hotspot.

---

## Repos / branches

| Repo | Branch | Role |
|---|---|---|
| `LibreChat` (this) | `new_dev` | **ACTIVE** — backend + frontend + driver |
| `Librechat-Daytona-Interpreter` | `new_main` = `new_develop` = `f42872f` | adapter + sandbox image (`:0.7` toolkit/gate/fonts) |
| `LibreChat-086` | `new_main` | superseded (reference only) |

Uncommitted as of this handoff: this file + `tools/lc-run.mjs` (LibreChat),
and the `CLAUDE.md` "Local code-interpreter stack" note (updated to mark this
repo active). Daytona `new_main` FF is local (not pushed).
