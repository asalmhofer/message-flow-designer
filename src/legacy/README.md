# Legacy compatibility layer

This folder now contains a small ES module adapter for `src/main.js`. It imports the shared storage and image-export helpers and calls the same `src/runtime/app.js` implementation used by the direct-open page.

Do not copy application logic into this adapter. Extract shared behavior from the runtime into focused modules and keep both entry points consuming the same implementation. Browser tests cover the actual production page.
