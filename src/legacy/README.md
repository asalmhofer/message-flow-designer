# Legacy compatibility layer

This module contains the current production runtime, wrapped as an ES module function so the app can be loaded by `src/main.js`.

It exists to preserve the full existing UI behavior while the surrounding architecture is extracted into focused modules.
New domain logic, storage logic, geometry, state actions, registries, and tests live outside this folder. Future incremental work should move behavior out of this compatibility layer into the relevant modules, keeping regression tests green after each move.
