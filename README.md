# Message Flow Designer

Message Flow Designer is a lightweight, client-side web application for drawing, editing, and presenting event-based message flows between software-system components.

The app runs entirely in the browser. It does not require a backend, database, npm installation, bundler, or build step.

## Features

- Draw software components and package/group containers.
- Connect components with straight, curved, or elbow message-flow arrows.
- Use dynamic connection ports and drag endpoints or bend handles.
- Define ordered message-flow steps, messages, processing actions, notes, images, and timing.
- Read connection labels on clear backgrounds, with automatic spacing and saved manual positions.
- Hide/show individual connectors in drawing mode for dense diagrams.
- Animate the flow step-by-step or automatically in presentation mode.
- Present with a current-message heading, processing details and images, and a selectable flow overview.
- Pause/resume playback and choose whether automatic playback loops.
- Import/export diagrams as JSON.
- Export diagrams as SVG or PNG, and animations as GIF, MP4 or WebM.
- Autosave state in browser local storage.
- Restore the previous autosave when the latest copy is damaged, with recovery downloads and visible save errors.

## Run locally

Open `index.html` directly in a modern browser.

No installation is required.

For development, use Node.js 24 or later to serve the same files:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:8080`. The server is a local development convenience; the distributed app still needs no server or build step.

## Checks

```sh
npx playwright install chromium
npm run check
```

`check` runs syntax validation across the source, Node unit tests, ESLint, and browser regressions against the actual editor. The browser tests also check direct opening from disk. To use an already installed Edge browser in PowerShell, run `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run check`.

Individual checks: `npm test`, `npm run lint`, `npm run check:syntax`, and `npm run test:browser`.

## Editing and recovery

- Open **Elements (+)**, then click a named tile and place it on the canvas, or drag the tile onto the canvas. Search or filter by Basic, Components, or Deployment. Star favourites and revisit Recent elements; these preferences stay on this device. A preview shows the position. **Escape** cancels; arrow keys move the preview and **Enter** places it.
- Click a component to select it, drag to move it, and double-click to rename it. **Ctrl/Cmd+click** adds or removes a component from the selection; **Shift+click** also works. Drag a selected component to move the selection together. **Ctrl/Cmd+drag** copies a component or selected group, including its attachments and internal connections; copying begins only after the pointer moves beyond the click threshold. **Escape** cancels the copy and restores the selection. Hold **Space** to pan.
- Hover over or select a component to reveal four directional arrows. Drag an arrow onto another component to connect; nearby targets snap into place and highlight before release. Handles keep a comfortable size at every zoom. For precise anchors or click-to-click connections, choose **Connect components**, or focus a component and press **Enter** to reach its ports, then use **Tab** and **Enter**.
- Drag a connection into empty space to open **Add connected component**, or click a directional arrow to add a neighbour in that direction. Search common/UML elements or use your library favourites and recent choices. Hover or focus a choice to preview its shape and connection, then click or press **Enter** to create both. Enter also confirms the highlighted choice directly from the search field; filtering highlights the first result if the previous choice is no longer visible. **Reverse connection direction** switches between existing → new and new → existing. Placement avoids occupied space, and the view reveals the new component when needed. **Escape**, Cancel, or clicking outside dismisses the draft and restores the view.
- New connected components inherit the source's font size, weight, alignment, colours, opacity and border settings. The preview shows the inherited appearance. Matching shapes also inherit width and height; different shapes use their usual dimensions. This also applies when reversing the connection direction. A newly connected component's name is ready to type immediately. **Name message** beside the connection lets you label the new flow quickly. One Undo removes the new component and its connection, including its initial component name; Redo restores both. **Escape** during a connection drag cancels it, and dropping outside the drawing area adds nothing.
- The **Flow** tab selects a message and highlights its endpoints. Every card has an **Edit** pencil and an **eye** toggle. Click Edit or double-click the card to open the step popup. Expand a card for a read-only processing overview and playback/reorder/delete actions. Messages that run together are grouped visually.
- Drag a step's grip to reorder it: the full card follows the pointer, neighbouring cards move aside, and a card-sized gap shows the destination. The list scrolls near its edges. Drop to commit one undoable move; **Escape** or dropping outside cancels. **Alt+Up/Down** and the expanded Move buttons also reorder. Timing labels preview the new relationships; a first step always runs after previous, and other steps retain their timing setting.
- The **Properties** tab shows the selected element's settings. The top bar provides the diagram name, save status, File menu and Present button. Zoom, Fit, Grid and Snap are in the bottom canvas corner.
- Labels wrap automatically and avoid nearby components and labels where space permits. Drag a label to position it, or use arrow keys when it is focused (**Shift** moves farther). **Enter** or double-click renames it. **Reset label position** returns it to automatic placement. **Escape** cancels a drag. Custom label offsets are saved in JSON and follow their connection when components move.
- **View → Focus selected flow** fades unrelated connections and components while you work on a message.

## Diagram style and UML elements

The interface uses dark slate menu and playback bars, a cool gray sidebar, and a white drawing area. Blue identifies editing controls and selection; amber identifies playback. These interface colors do not change diagram colors or exported images.

**Style** applies Technical, Soft colour, or Monochrome styling to the diagram and its SVG/PNG exports. Technical is the default for new diagrams. Soft colour offers slate blue, sage/teal, and violet palettes. Theme changes are undoable. Imported diagrams retain their existing colours until a theme is applied; individual elements can still be customised in Properties.

The library includes UML **Component, Port, Provided interface, Required interface, Package, Node, Artifact, and Comment** alongside the original general-purpose shapes. Choose a Node's kind in Properties: Node, Device, or Execution environment. Names, optional stereotypes, and short details appear on the element; full values remain in Properties and JSON when the available space truncates text.

- Place ports on a component boundary. Place interfaces on a component or port. Attachments follow their owner when it moves or resizes. Drag an attached element around its owner's boundary, or set its owner, side and percentage position in Properties.
- Packages use a tabbed outline. Moving or copying a package includes elements geometrically inside it and their attachments. Deleting a package alone leaves its contents on the canvas.
- Copying a component includes its ports and interfaces; deleting it removes those attachments and their incident message flows. Undo restores the group.
- A Comment's **Annotates** property draws a dashed annotation link. It does not add a playback step.

Structural UML relationships and class/activity elements are not part of this release. Existing message flows remain the animation mechanism.

## Properties and appearance

Properties groups Element, Text, Appearance and Layout controls. **Text → Font size (px)** accepts sizes from 8 to 96, including custom decimal values; press Enter or leave the field to apply. UML stereotypes and details scale with the component's font size. UML and attachment settings are available in a collapsed details section. Fill, border/line and text swatches open a palette with custom HEX input, recent colours and opacity. **No fill** makes a component transparent. Colour changes preview immediately; **Done** or clicking outside commits one undoable change, while **Cancel/Escape** restores the original colour and opacity. Recent colours stay on this device.

Choose solid, dashed, dotted or no border, adjust thickness, and set label size, weight and alignment. Multi-selection shows mixed appearance values and applies changes to all selected elements. **Reset to theme** restores their diagram theme defaults. Width/height controls are in Layout; attached ports and interfaces keep their attachment geometry. Appearance survives JSON, autosave and SVG/PNG export, including independent fill and text opacity.

A card's **eye** button hides only its connection and label while editing; the card remains editable, selection does not reveal it, and the step still participates in playback. Hidden connections are omitted from editor image exports.

## Presenting a flow

Playback has a brief departure cue, a small traveling token with a restrained path trace, and one arrival pulse. A progress line beneath the receiving component appears during processing. Flow cards and the presentation overview show progress and completion marks; Manual Next retains completed marks as you advance. Very short paths take slightly less time and long paths slightly more, with bounded timing adjustments; simultaneous messages always start and arrive together. Pausing freezes tokens and feedback. Your system's reduced-motion preference replaces travel and pulses with stationary phase cues while keeping playback timing and navigation unchanged.

Select a flow step and choose **Present** to begin there, or use **Play from here** in its expanded row. A compact header shows the current message and route; the playback dock shows the message number and phase. The diagram uses the full width initially. **Details** opens an optional, resizable panel with **Details** (actions, notes and images) and **Flow overview** tabs. The panel remembers its visibility, width and selected tab independently of the editor, and stays in place as messages advance. Messages that run together share a position in the flow overview.

**Fit** uses the available drawing area, including curved connections and space for animation labels and processing callouts. While Fit is active, opening/resizing the panel, resizing the window or switching **Full screen** refits the diagram. The view stays fixed as playback advances. Use **− / +**, Ctrl/Cmd + mouse wheel or drag the canvas to adjust it manually; these adjustments stay in place until you choose Fit again. Token labels and processing text retain a readable minimum size when zoomed out. **Exit** restores your original editor view and leaves full screen if presentation opened it.

**Previous message / Next message** and the presentation's **Left / Right arrow** keys navigate entire messages (or simultaneous groups). In **Manual** mode, Next plays the current ready message through transfer, arrival and processing, then waits for the next click. Once that message has finished, Next plays the following message. It is disabled while the message is playing; Pause/Resume and Stop remain available. The final message finishes without looping. Previous previews the previous message, and Next plays that preview.

Clicking an item in **Flow overview** jumps directly to it. During playback, a jump starts that message; while stopped or paused, it previews the message and waits for Play (or Manual Next). In **Auto** mode, message navigation continues to work this way, including while paused. Exiting presentation restores the editing viewport.

**Playback settings** contains speed, Loop (Auto only), and **Auto / Manual** modes. **Previous phase / Next phase** switch Manual playback to individual phase inspection, holding at arrival and processing. The main Next message button returns to complete-message playback. The controls have fixed slots, with a separate message counter and phase line; presentation headings reserve two lines so changing text does not move the surrounding layout.

Under **Playback settings → Presentation display**, independently choose **Message name beside token** (on by default) and **Show processing phase** (off by default). A hidden token label leaves the moving dot visible. When processing is on, its callouts avoid component boxes and each other; simultaneous actions at one component include their message names. These choices apply immediately and persist in autosave and exported JSON.

When **Show processing phase** is off, presentation playback skips Processing and its delay. Manual playback enables Next immediately on arrival and shows **Waiting for Next**; the final message goes straight to **Finished**. Auto keeps the brief Received cue, then continues to the next message or finishes. Phase inspection also skips Processing in both directions. Switching it off during Processing cancels the remaining delay; paused playback stays paused until Resume. Enabling it again while waiting does not restart the completed message. Editor playback still includes its visible processing phase. Icons are local SVGs and require no external fonts or services.

## Exporting images and animations

Choose **File → Export media…** for **PNG, SVG, GIF, or Video**. The same dialog is available from **Playback settings → Export media…** while presenting. **Export JSON** stays in the File menu for editable backups.

Choose **Diagram only** or **Presentation**, then **Fit diagram** or **Current view**. Presentation exports include the message heading and can include processing details, notes and embedded images. The preview shows the output without editor controls. Images use a white background and a 16:9 composition; SVG remains scalable.

For animations, export the entire flow or a selected range. Simultaneous messages stay together. Preview with Play or the time slider, and adjust speed, message names beside tokens, processing, and inactive connections. Turning processing off skips that phase and its delay. Exports play continuously even when the editor is in Manual mode; they do not alter the diagram, selection, or viewport.

- **Video** starts at 1080p and 30 fps. MP4 is preferred when supported; WebM is another option. Available formats are checked in your browser. A browser without video encoding support can still export GIF, PNG, and SVG.
- **GIF** starts at 960 px and 15 fps, with looping enabled. Its limited colour palette is best suited to diagrams; video preserves more image detail.
- **Timing and motion** controls frame rate, the final-frame hold (one second by default), and reduced motion. Video contains one pass; GIF looping is optional.

Click **Export** to create the file and automatically start its download. A progress indicator and **Cancel export** remain available during encoding. When ready, the dialog shows **Download started** and keeps the preview open; **Download again** saves another copy without re-encoding. Failed exports show an error and can be retried. Lower resolutions and shorter ranges take less time and memory. Long details are shortened to fit the presentation layout. Hidden drawing-mode connections are omitted from PNG/SVG and included in animation playback.

Everything is rendered and encoded locally using bundled libraries: no uploads, CDN, or account is required. Direct `index.html` opening supports PNG, SVG, and GIF; GIF uses a yielding fallback when file-based workers are unavailable. Video support depends on the browser's WebCodecs encoders. See [bundled export dependencies](src/vendor/README.md) for versions and licenses.

## Saving edits

**Edit step** opens a focused popup for message, source, target, timing, processing action and notes. Routing, step order and processing images live in collapsed advanced sections. **Save changes** commits one undoable edit; **Cancel**, the close button and **Escape** discard the draft. Closing or reloading the page with the popup open keeps the last committed autosave.

The save indicator reports whether autosave succeeded. If the stored diagram is damaged, the app preserves its original data and tries the previous backup. **Download recovery data** keeps the damaged original for recovery. **Resume autosave** stores that original under a separate recovery key before saving the active diagram. If storage is full or unavailable, export JSON to keep a portable copy, then retry saving when storage is available.

See [architecture](docs/ARCHITECTURE.md) and [file formats](docs/JSON_SCHEMA.md) for the active runtime and compatibility boundaries.

## Use with Git

The recommended workflow is to export diagrams as JSON and commit those JSON files to your repository. This keeps diagrams versionable, reviewable, and easy to restore.
To edit a diagram later, use **Import JSON** in the app.

## Notes

- The app stores autosave data in the browser's local storage.
- For long-term storage and collaboration, export diagrams as JSON and commit them to Git.
- Uploaded processing images are stored inside the exported JSON as data URLs.

## Feedback

Use **File → Send feedback** or email: messageflowdesigner@gmail.com
