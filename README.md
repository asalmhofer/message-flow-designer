# Message Flow Designer

Message Flow Designer is a lightweight, client-side web application for drawing, editing, and presenting event-based message flows between software-system components.

The app runs entirely in the browser. It does not require a backend, database, npm installation, bundler, or build step.

## Features

- Draw software components and package/group containers.
- Connect components with straight, curved, or elbow message-flow arrows.
- Use dynamic connection ports and drag endpoints or bend handles.
- Define ordered message-flow steps, messages, processing actions, notes, images, and timing.
- Hide/show individual connectors in drawing mode for dense diagrams.
- Animate the flow step-by-step or automatically in presentation mode.
- Import/export diagrams as JSON.
- Export diagrams as SVG or PNG.
- Autosave state in browser local storage.

## Run locally

Open `index.html` directly in a modern browser.

No installation is required.

## Use with Git

The recommended workflow is to export diagrams as JSON and commit those JSON files to your repository. This keeps diagrams versionable, reviewable, and easy to restore.
To edit a diagram later, use **Import JSON** in the app.

## Notes

- The app stores autosave data in the browser's local storage.
- For long-term storage and collaboration, export diagrams as JSON and commit them to Git.
- Uploaded processing images are stored inside the exported JSON as data URLs.

## Feedback

Use the in-app feedback button or email: messageflowdesigner@gmail.com
