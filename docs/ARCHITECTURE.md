# Developer Architecture Guide

## Active implementation after the reliability milestone

The direct-open page loads the storage validator, image export, label layout and icon helpers before `src/runtime/app.js` as classic scripts. These scripts also support side-effect imports from ES modules. They require no bundler and work from `file://`.

- `diagramDocument.js` is the shared, DOM-independent validation and autosave boundary. The running UI and the legacy-to-v2 migration use its normalization. Autosave keeps the previous valid document, preserves a damaged original, and supports recovery downloads and retry.
- `imageExport.js` captures computed SVG styling into standalone exports and rasterizes that same representation for PNG. It does not assume inline styles or fetch stylesheets.
- `export/dialog.js` owns the shared PNG/SVG/GIF/video dialog and job cancellation. The runtime captures component glyphs and connection geometry into a detached snapshot. `export/timeline.js` builds deterministic timestamps from simultaneous groups and the shared motion helper, including optional processing and a final hold. `export/renderer.js` produces standalone SVG compositions at any timestamp, reused by the preview and all encoders. It never drives the editor's live animation or changes document state.
- `export/encoders.js` streams rendered frames to the local GIF worker or Mediabunny's WebCodecs video encoder with explicit frame timestamps. MP4/WebM support is probed for the selected resolution. GIF runs through a yielding main-thread fallback on `file://`; HTTP pages use `export/gifWorker.js`, which coalesces identical frames. Cancellation closes the worker or video output; image URLs and result URLs are revoked. Pinned browser bundles and licenses are in `src/vendor/`, with corresponding source links in its README. Browser regressions decode actual GIF, MP4 and WebM downloads and verify duration, dimensions, changing frames, cancellation and direct file opening.
- `canvas/labelLayout.js` places measured label boxes deterministically around component obstacles and other labels. Explicit offsets reserve their space first. Label drags commit history and autosave only on pointer-up; cancellation restores the original offset. Labels render in their own SVG layer above components.
- `ui/icons.js` supplies the local outline icon set. The shared authoring and presentation visual rules are in `styles/refinement.css`.
- `model/elementCatalog.js` defines selectable element metadata, theme colours, boundary attachment geometry and copy/delete ownership closures. `canvas/umlRenderer.js` creates UML glyphs used by both the canvas and library previews. `ui/elementLibrary.js` owns search, categories, favourites and recent items. `styles/studio.css` adds the studio appearance. All three helpers load as classic scripts before the runtime and through the ES module adapter.
- Ports/interfaces are component entries with `ownerId` and an edge/ratio attachment. Their geometry is synchronised before rendering and snapshots, independent of array order. Copies remap ownership and annotation references; deleting an owner removes its attached descendants. Package movement/copy uses geometric containment. Comments draw in a separate non-interactive annotation layer and never enter playback.
- Presentation navigation uses the animation's simultaneous groups. Ready previews clear old timers and paths; jumps during playback start a fresh transfer. Phase inspection remains available in Manual mode. Presentation rendering displays the current group's details and images and restores the editing viewport on exit.
- `runtime/app.js` owns the live editor state and exposes an idempotent `bootstrapMessageFlow()` function. The approximately 2,740-line duplicate in `legacy/bootstrapLegacyApp.js` has been replaced with a small adapter to this implementation. `main.js` invokes that adapter; it no longer advertises a separate store as the live application's state.
- Flow-dialog changes preview in memory. Autosave and history are suspended for the draft. OK commits one history entry; Cancel/Escape restore all affected flows. Late input and image-read callbacks cannot write into a cancelled edit.
- Browser tests in `tests/browser/` exercise the real production page and direct file opening. Unit tests cover shared validation, migration, and storage failures. `npm run check` also parses every source file and runs ESLint.

The store/controller architecture described below remains a migration target. Most canvas controller modules are still placeholders. Features added only to those modules will not appear in the live editor until explicitly wired in and covered by browser tests.

## Design goals

The refactor introduces focused modules around the existing application so new work can move away from a monolithic implementation. The intended architecture is:

**User interaction → action/command → store update → render update → persistence update**

The intended central state model covers components, connectors, flow steps, viewport, presentation, animation, preferences, and selection. The current UI still uses the runtime's v1-shaped state.

## Important folders

- `model/`: domain objects, factories, and validation.
- `state/`: action types, reducer, store, command history.
- `canvas/`: SVG geometry, ports, connector paths, and canvas controller extraction points.
- `flow/`: flow-step ordering and execution grouping.
- `animation/`: animation state and phase/timing services.
- `storage/`: schema, migration, import/export, and local-storage boundaries.
- `registry/`: extension points for shapes, connector types, and tools.
- `legacy/`: compatibility layer preserving the current runtime while logic is migrated incrementally.

## Current migration strategy

The current production UI is implemented in `src/runtime/app.js`. Extract one responsibility at a time, make the production page consume it, and test that path before removing its former implementation. Shared storage and image export are the first completed extractions.

## Command and history model

Reversible editing operations should be represented by commands. Drag and resize interactions should create one command at pointer-up, not a command per mouse move.

## Rendering lifecycle

1. Controllers interpret DOM/pointer events.
2. Controllers dispatch actions or execute commands.
3. The store emits a state change.
4. Renderers consume selectors and update SVG/DOM.
5. Persistence runs only when a meaningful state change must be stored.

## Extension points

- For the active editor, add element metadata in `model/elementCatalog.js`, rendering in `canvas/umlRenderer.js` or the runtime, and validation in `storage/diagramDocument.js`. `registry/shapeRegistry.js` remains the modular migration target.
- Add connector routing in `registry/connectorRegistry.js` and `canvas/geometry.js`.
- Add tools in `registry/toolRegistry.js`.
- Add flow-step properties in `model/flowStepModel.js`, `flow/`, and storage migrations.
