# Upstream to @librechat/agents: send `session_id` in the `/exec` POST body

**Status:** shipped locally via patch-package (`patches/@librechat+agents+3.1.97.patch`).
Drop the patch once this lands upstream and the version is bumped here.

## Problem

`BashExecutor` and `CodeExecutor` destructure `session_id` from `config.toolCall`
(injected by `ToolNode` from `Graph.sessions[EXECUTE_CODE].session_id`) but **never
put it in the `/exec` POST body**. The body is only:

```js
const postData = { lang, code, ...rest, ...executionParams };
if (_injected_files?.length) postData.files = _injected_files;
```

So sandbox continuity rides **entirely** on `_injected_files` carrying per-file
`storage_session_id`. A **file-less** exec (e.g. `node build.js`, or any code run
that reads files written by a *previous* run_code call) sends nothing
session-related, so the code backend mints a **fresh sandbox every call**.

Effect on the Daytona-backed interpreter: a single deck build fragmented across
**36 sandboxes** — each a cold start that loses `/mnt/data`. Assets cloned in one
exec were gone by the build exec. Host seeding of a stable `session_id`
(`Graph.sessions[EXECUTE_CODE].session_id`) had **no effect** because the executor
discards it.

## Fix

In both `BashExecutor` and `CodeExecutor`, after the `_injected_files` block, send
the session id when present (without clobbering an explicit one from `rest`):

```js
if (session_id != null && session_id.length > 0 && postData.session_id == null) {
    postData.session_id = session_id;
}
```

That's it — `src/tools/BashExecutor.ts` and `src/tools/CodeExecutor.ts`.

## Why it's safe (no upload regression)

- File-bound execs already carry `_injected_files` whose `storage_session_id` is
  what the backend's `/upload` used. The seed's representative `session_id` equals
  that same `storage_session_id` (set by `seedCodeFilesIntoSessions`), so sending
  it matches the upload sandbox — no divergence.
- The backend resolves `payload.session_id || <id from files>`; the representative
  and the per-file id agree, so precedence is a no-op.
- Host side (LibreChat) only seeds a *conversation-id* session when **no** file/skill
  seed exists (see `seedConversationExecSession` in
  `packages/api/src/agents/codeFilesSession.ts`), so the upload path keeps its
  `storage_session_id`.

## Host-side companion change (already in LibreChat)

`seedConversationExecSession(sessions, conversationId)` seeds
`Graph.sessions[EXECUTE_CODE] = { session_id: conversationId, files: [] }` when no
file/skill seed exists. Wired in `client.js` (chat) and `responses.js`
(Open Responses API). With the executor change above, every turn of a conversation
routes to ONE sandbox keyed by `conversationId`; `/mnt/data` persists across turns.

## Verification

Two-turn probe: turn 1 wrote `/mnt/data/cross_turn.txt`; a separate turn 2 read it
back; all execs across both turns ran on one sandbox keyed by the conversationId
(`/exec session_id=<conversationId>`). Before the fix: `session_id=None`, fresh
sandbox per turn, file lost.
