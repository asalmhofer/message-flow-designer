# Compatibility Limitations and Remaining Technical Debt

## Reliability milestone update

Completed: atomic flow-dialog cancellation/commit; self-contained SVG/PNG exports; unobstructed playback controls; syntax validation; shared import/autosave validation with recovery; tested text/visibility/viewport migration; one canonical runtime; focus handling; visible pause/resume and optional looping; browser regressions against the live page and direct file opening.

`legacy/bootstrapLegacyApp.js` is now only an ES module adapter. Storage and image export are extracted and used by the live page. The historical notes below describe the earlier plan; remaining extraction work should follow `ARCHITECTURE.md`'s active implementation section.

Remaining: migrate live state and controllers incrementally; profile large diagrams before renderer optimization; extend browser coverage beyond Chromium/Edge; decide scenario, per-step timing, and playback navigation requirements with representative diagrams. The modular v2 model is not yet the production file format.

This refactor is intentionally incremental to preserve the current user experience.

## Preserved through compatibility layer

The current production UI is wrapped in `src/legacy/bootstrapLegacyApp.js`. This means the full current behavior remains available, but not all runtime interactions have been fully migrated to the new store/controller/renderer modules yet.

## Recommended next extraction steps

1. Move import/export calls from the legacy module to `storage/`.
2. Move flow ordering and grouping to `flow/sequenceService.js`.
3. Move port and connector path calculations to `canvas/geometry.js`.
4. Replace direct state mutations in the legacy layer with store actions/commands.
5. Replace all rendering calls with focused component and connector renderers.

## Compatibility

Existing JSON exports should continue to load. Legacy files without `schemaVersion` are treated as version 1 and migrated where possible.

## Runtime bootstrap compatibility

The production `index.html` currently loads `src/runtime/app.js` as a classic script so the app works when opened directly from the local file system. The modular ES files remain available for development and tests. A future cleanup can replace the runtime compatibility bundle once the UI has been fully extracted into ES modules and the project standardizes on serving via GitHub Pages or a local static server.
