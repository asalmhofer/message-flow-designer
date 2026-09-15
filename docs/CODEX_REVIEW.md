# Message Flow Designer: initial review

Reviewed on 14 September 2026 against commit `29c1814`, using source inspection, the existing Node tests, a syntax check of every JavaScript file in `src/` and `tests/`, and a local browser session at 1280 × 720.

The app already has a substantial feature set: component shapes, editable connectors and ports, ordered and simultaneous messages, processing images, presentation mode, history, and local persistence. The recommended first milestone is to make the existing editing and export workflows dependable, then extend the application in small increments. Its browser-only architecture can be retained.

**Confirmed findings, in recommended repair order**

| Priority | Finding | User impact | Evidence and repair direction |
| --- | --- | --- | --- |
| High | Cancel does not undo all changes made by reordering a flow step. | Cancelling an edit can leave duplicate sequence numbers and change playback order. The changed state is autosaved. | In the example, edit step 2, move it down, then Cancel. Both “Reserve Stock” and “Stock Reserved” become step 2. `src/runtime/app.js:1228` snapshots one flow; `:1271` renumbers multiple flows; `:1236` restores only one. Treat the dialog as a transaction over all affected steps, committing one history entry on OK. |
| High | SVG and PNG export throw an exception. | Both image export buttons fail. | Browser-confirmed errors at `src/runtime/app.js:1871` and `:1882`: `Cannot read properties of null (reading 'textContent')`. Export expects an inline `<style>` element, while `index.html:7` loads external CSS. Produce self-contained export styling, then verify exported files render independently of the editor. |
| High | The Feedback link covers the Start animation button at 1280 × 720. | A pointer click on the center of Start can open email instead of starting playback. | Screenshot inspection and DOM hit testing identify “Send feedback by email” above the center of `#startBtn`. See `src/styles/base.css:156` and `:187`: overlapping bottom positioning with Feedback at a higher stacking order. Reserve space for playback controls and move secondary actions away from them. |
| Medium | The extracted import/export service has a syntax error. | Importing that module, or the local-storage repository that depends on it, fails. This is dormant in the current page because it is not connected to the live runtime. | `node --check src/storage/importExportService.js` fails at line 12 because a quoted string spans a literal newline. Fix the string and include module loading or whole-source syntax validation in the checks. |
| Medium | The proposed modular migration does not preserve all current behavior. | Switching the app to these modules would reject some valid diagrams or change how they appear. | A Node probe migrated a current-style diagram containing a text shape, a hidden connector, and zoom 0.82. Validation rejected `text`, the connector became visible, and the new viewport defaulted to zoom 1. See `src/storage/migrations.js:14`, `src/config/constants.js:8`, and `src/config/defaults.js:15`. Add representative compatibility fixtures before adopting this path. |

**What the architecture actually does today**

`index.html` loads the approximately 3,000-line `src/runtime/app.js` as a classic script. This contains the live state, rendering, input handling, file operations, and animation. The page does not load `src/main.js`.

`src/main.js` creates a separate store and calls the approximately 2,740-line `src/legacy/bootstrapLegacyApp.js`. Many canvas controller and renderer modules are placeholders. The runtime and modular path also differ in their schemas, storage keys, supported shapes, and animation speed representation. The architecture documents describe the intended direction, but do not consistently distinguish it from the active implementation.

Future changes must reach the production entry point. The next architectural step should be one working extraction at a time, with the running page consuming the extracted code and its tests. Keep a single maintained implementation once parity is established. A framework change or backend is not needed to address the current issues. Preserve direct opening of `index.html` unless a later product decision deliberately changes that requirement.

**Suggested development sequence**

1. **Repair and establish a reliable baseline.** Fix cancellation, image export, control overlap, and the invalid module. Add focused regressions for those defects. Add browser checks for create/connect/edit, Cancel/OK, undo/redo, playback, and file export/import. A passing test run should exercise behavior in the page users open.
2. **Protect diagram files and saved work.** Validate and normalize a candidate import before replacing the active document. Check identifiers, references, supported shapes, dimensions, and settings. Add export/import round-trip fixtures that include text, hidden connectors, routing, images, and simultaneous steps. Make autosave success or failure visible and provide an understandable recovery path. Keep existing JSON exports usable.
3. **Connect the modular architecture to the live UI.** Start with storage or flow sequencing, resolve schema differences, and remove duplication only after the replacement is exercised by the page. Make edit operations atomic so one meaningful edit produces one undo entry. Update the architecture documentation as each extraction lands.
4. **Refine the everyday interface.** Give canvas and playback controls dependable space at laptop sizes; simplify the wrapping toolbar; make longer message names readable in the flow panel; connect form labels to inputs; and manage dialog focus on open, close, and keyboard navigation. Define the expected desktop/tablet behavior before expanding responsive support.
5. **Extend playback and scenarios.** Candidate additions include visible pause/resume, jumping to a selected step, explicit loop controls, adjustable arrival/processing duration, and multiple named scenarios over the same component diagram. Prioritize these against real diagrams and presentation needs once the first milestone is stable.

For larger diagrams, profile rendering before setting performance targets. Currently every animation frame calls `renderCanvas()`, which clears and reconstructs the component and connector layers (`src/runtime/app.js:442`, `:1651`). Updating just the moving tokens and affected elements is a promising improvement, but no large-diagram benchmark was run in this review.

**Verification and limits**

- All 16 existing tests passed with `node --test tests/**/*.test.js`.
- Syntax checking all 54 JavaScript files in `src/` and `tests/` found one invalid file: `src/storage/importExportService.js`.
- The browser session verified example loading, playback starting and progressing, stopping playback, entering/exiting presentation mode, undo/redo of example loading, and autosave restoration after reload.
- SVG export, PNG export, the reorder/Cancel defect, and playback-control overlap were reproduced in the browser. The example was restored to its original step order after the cancellation test.
- JSON export was invoked without an additional JavaScript error, but the browser tool did not report a download within its timeout. Downloaded JSON contents and a full export/import round trip remain unverified; this alone is not evidence that JSON export is broken.
- Full linting was not run because the development dependencies are not installed. Direct `file://` execution, other browsers, other viewport sizes, large diagrams, and storage-quota behavior remain outside this review.
- This review adds documentation only. Application source files and pre-existing documents were not edited.

The first milestone is complete when Cancel restores the entire affected flow order, OK is one undoable edit, SVG/PNG files render correctly outside the app, playback controls are unobstructed at the reviewed size, all JavaScript parses, and targeted regression checks pass.
