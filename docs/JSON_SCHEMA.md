# JSON Schema and Migration Strategy

## Active file format

The current page imports and exports **version 1**, with `components`, `messageFlows`, `settings`, and `ui`. New exports explicitly include `"schemaVersion": 1`; older files without that field remain accepted. Component geometry uses `x`, `y`, `width`, and `height`, and the shape field is `shape` (including `text`). Flow endpoints reference component ids. Images remain embedded data URLs.

`src/storage/diagramDocument.js` validates a complete candidate before it replaces the active diagram. It checks duplicate ids and order numbers, endpoint references, shapes, dimensions, routing, timing, and relevant settings. Omitted legacy dimensions receive defaults. Selection and presentation are reset on import. Invalid files leave the current document intact.

The primary browser key remains `event-flow-designer-state-v1`. `.backup` stores the previous valid save, and `.recovery` preserves a damaged original when the user resumes autosave. These copies consume browser storage; JSON export remains the portable backup mechanism.

Message flows may include `labelOffset: { "x": 40, "y": -24 }`. The finite coordinates are offsets in diagram units from the connector's default label anchor, not absolute canvas coordinates. Missing or null offsets use automatic placement; automatic collision adjustments are calculated when rendering and are not saved. Manual offsets survive direct v1 import/export and undo/redo. The optional boolean `settings.focusSelectedFlow` controls the editor's focus view. Presentation preview position and playback timers are session state; autosave retains the editing viewport during presentation.

## Presentation playback (version 1)

Optional boolean presentation settings are `showTokenMessageInPresentation` (defaults to `true`) and `showProcessingActionInPresentation` (defaults to `false`). The first controls message-name labels on moving tokens. The second is displayed as **Show processing phase**: when false, presentation playback skips the Processing phase, its callouts and its delay, including during phase inspection. Manual playback is ready for Next immediately on arrival; Auto retains the brief Received cue. The existing property name is retained for file compatibility. Editor playback always includes processing. Both settings persist in v1 JSON and autosave. Missing fields in older files use the defaults; non-boolean values are rejected. Manual playback's current message, phase-inspection mode and waiting state remain session-only.

## UML elements and diagram themes (version 1)

Additional `shape` values are `umlComponent`, `umlPort`, `providedInterface`, `requiredInterface`, `umlNode`, `umlArtifact`, and `umlComment`. `package` now renders a tabbed package. Elements may contain `stereotype` and `details` strings. Nodes use `nodeKind: "node" | "device" | "executionEnvironment"`.

Ports and interfaces require `ownerId` and `attachment: { "side": "right", "ratio": 0.5 }`. Ratios are finite values from 0 to 1; sides are top/right/bottom/left. Ports attach to components; interfaces may also attach to ports. The validator rejects missing owners, incompatible owners, and malformed positions. Their stored x/y are synchronised from the owner's geometry before rendering or saving. A UML Comment may reference another element with `annotatedElementId`; this draws an annotation and does not create a message flow.

`settings.diagramTheme` is `technical`, `soft`, `monochrome`, or `custom`; `settings.diagramPalette` is `blue`, `teal`, or `violet`. Actual colours remain on individual components/flows. Applying a theme updates those values in one undoable operation. Older documents without a theme keep their colours and display Custom / existing colours. Favourites and recent element types are UI preferences stored separately under `message-flow-element-library-v1`.

## Appearance (version 1)

Components may contain `borderStyle` (`solid`, `dashed`, `dotted`, `none`), `borderWidth`, `fillOpacity`, `borderOpacity`, `textOpacity`, `fontSize`, `fontWeight` (400/500/600/700) and `textAlign` (`left`, `center`, `right`). Opacity values range from 0 to 1; `fillColor: "transparent"` means no fill. Omitted fields preserve the legacy rendering defaults. Flow `style` may contain `lineStyle` with the same pattern choices, `thickness`, `opacity`, and `textOpacity`. Invalid style values are rejected before replacing the active document.

`hiddenInDrawingMode` remains an editing-only flag. It hides the connector, label and editing handles even when its card is selected, while leaving playback order and animation unchanged. Reordering previews never mutate the saved diagram until the drop is committed.

## Modular version 2 format

The structures below describe the separate modular model, not the format exported by the production page. `src/storage/migrations.js` converts validated v1 files to this model and preserves text shapes, hidden connectors, viewport, and processing images. A v2-to-v1 import path is not currently provided by the editor.

## Project structure

```json
{
  "schemaVersion": 2,
  "components": [],
  "connectors": [],
  "flowSteps": [],
  "selection": {},
  "viewport": {},
  "editorMode": "select",
  "presentation": {},
  "animation": {},
  "preferences": {}
}
```

## Component

```json
{
  "id": "cmp_1",
  "name": "Order Service",
  "shapeType": "roundedRectangle",
  "position": { "x": 100, "y": 100 },
  "size": { "width": 160, "height": 80 },
  "style": { "fillColor": "#ffffff", "borderColor": "#334155", "textColor": "#0f172a", "borderWidth": 2 },
  "zIndex": 1,
  "parentGroupId": null,
  "metadata": {}
}
```

## Connector

```json
{
  "id": "connector_1",
  "sourceComponentId": "cmp_1",
  "targetComponentId": "cmp_2",
  "sourcePort": "right:0.50",
  "targetPort": "left:0.50",
  "routingType": "arc",
  "bendPoints": [{ "x": 300, "y": 200 }],
  "labelPosition": null,
  "style": { "color": "#475569", "thickness": 2.2, "textColor": "#0f172a" },
  "visibility": { "visibleInEditor": true },
  "metadata": {}
}
```

## Flow step

```json
{
  "id": "step_1",
  "connectorId": "connector_1",
  "order": 1,
  "message": "Submit Order",
  "action": "Validate order",
  "notes": "",
  "imageRef": null,
  "executionMode": "afterPrevious",
  "presentation": {}
}
```

## Migrations

`src/storage/migrations.js` detects the schema version and converts older exported files where possible. Legacy `messageFlows` are mapped into separate `connectors` and `flowSteps`.
