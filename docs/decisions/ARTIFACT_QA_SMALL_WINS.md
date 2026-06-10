# Decision: small artifact-QA changes that improve deck quality

**Date:** 2026-06-10
**Status:** Partially implemented
**Owner:** Lukáš

## Context

A 10-slide API-driven presentation run completed end-to-end with PPTX, PDF,
rendered slide PNGs, and three `review_slides` calls. The flow worked, but one
visible issue remained: slide 2 had a heading overlapping the Render flow box.
The final response still described the deck as passed. That makes the highest
leverage work small contract changes that reduce false confidence.

## Implemented now

1. `review_slides` now asks the reviewer for a required `SHIP_STATUS`:
   `ship`, `ship_with_notes`, or `do_not_ship`.
2. The handler reinforces that status in the tool result. Anything other than
   `ship` is treated as degraded, and the model is told to disclose
   `"Visual QA: Degraded"` if it delivers anyway.
3. The reviewer prompt now asks for visible text/object snippets, not opaque
   internal IDs like `text #21`.
4. The model-facing tool description now includes exact slide-helper guidance:
   prefer safe helper APIs, use `deck.pptx.ShapeType.*` if raw shapes are
   unavoidable, leave at least `0.45in` below a horizontal flow before adding
   explanatory text, and attach a contact-sheet image when practical.

## Why contact sheets help

A contact sheet is not a new QA model. It is a cheap visual summary of all final
rendered slides. It helps three audiences:

- users can spot obvious broken slides before opening a PPTX;
- reviewers can audit the whole artifact in one glance;
- later agent turns get a compact artifact to inspect instead of ten separate
  image attachments.

The current implementation prompts the agent to create or attach one when
practical. A later implementation could generate it host-side from the persisted
slide images so it does not depend on model compliance.

## Why the flow-spacing rule helps

The observed failure came from a common pattern: a horizontal flow diagram near
the top of a slide, followed by explanatory copy in the same vertical band. The
geometry linter can see object overlap after the fact, but the model still needs
a simple construction rule before it writes coordinates.

The initial rule is intentionally small: after a horizontal flow, start all
explanatory headings/text at least `0.45in` below the flow bottom. This creates a
stable buffer for wrapped flow labels, arrows, and shadows. It is not a full
layout engine, but it prevents many center-band collisions.

## Update — 2026-06-10 (A/B tested)

Ran the same 5-slide brief (deliberately including a flow + notes slide) on the
branch stack vs `new_dev`/`new_develop`. The baseline declared a "clean pass";
the branch honestly returned `Visual QA: Degraded` with per-slide, visible-object
issues. Two follow-on changes shipped after that run:

1. **Forced fix-and-re-render cycle (host).** `handlers.ts` now tracks
   `review_slides` passes per conversation. The FIRST non-`ship` result is a hard
   "do not deliver — fix, re-render, review again" instruction; only a second
   (or later) pass may deliver, and only with a `Visual QA: Degraded` disclosure
   if minor issues persist. A blocker (`do_not_ship`) keeps blocking. This fixes
   the regression where the model disclosed minor issues but shipped without
   fixing them. Verified: the re-run did review → fix+re-render → review → deliver
   (2 passes) and disclosed honest residuals.
2. **`safeFlowWithNotes` hardened to mandatory (skill body).** Wording changed
   from "prefer" to "MUST … never hand-place text below a `D.flow`".

   **Finding:** even imperative "MUST" wording did NOT get the model to call the
   helper — it kept hand-placing coordinates (which happened to stay clean). The
   helper is a real safety net but adoption is not reliably promptable. A true
   gate would need provenance-aware linting (fail a flow+notes slide not built by
   the helper), which is impractical today; the review loop already catches the
   collisions the helper would prevent. Left as advisory + available.

## Deferred

### Safe fallback layout

Candidate behavior: after two geometry/render failures on the same slide, the
deck builder should stop repairing custom coordinates and rewrite that slide to
a boring known-safe layout: title, two columns, and up to three metric chips.

Why defer: the helper belongs in the sandbox slide toolkit
(`/opt/skill-tools/slides/deck_helpers.js`) and the Daytona image, not in the
LibreChat host. We should implement it with the next sandbox-image bump as
something like `D.safeFlowWithNotes(...)`.

### Best-final artifact versioning

Candidate behavior: keep the best passing artifact separate from the last
attempted artifact, so a late fix cannot accidentally replace a better version.

Why defer: it crosses the file persistence contract. We need to decide how to
represent versions in conversation files, attachment display, and final
delivery. This should be a small artifact-manifest change, not hidden in the
review tool.

### Visible confidence badge

Candidate behavior: show a first-class badge such as `Visual QA: Passed` or
`Visual QA: Degraded` next to delivered artifacts.

Why defer: the handler now provides the language, but UI/API presentation needs
a real artifact QA metadata field. Do this together with the artifact manifest
so the badge is data-backed rather than inferred from assistant prose.

