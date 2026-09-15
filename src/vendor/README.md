# Bundled export dependencies

These pinned browser bundles run locally. No CDN or upload is used at runtime.

- **gifenc 1.0.3**, MIT: https://github.com/mattdesl/gifenc. Source package: https://registry.npmjs.org/gifenc/-/gifenc-1.0.3.tgz. `dist/gifenc.js` is wrapped in a private CommonJS scope and exposed as `MessageFlowGif`; its source-map reference is removed. License: `gifenc.LICENSE`.
- **Mediabunny 1.56.3**, Mozilla Public License 2.0: https://github.com/Vanilagy/mediabunny. Complete corresponding source: https://registry.npmjs.org/mediabunny/-/mediabunny-1.56.3.tgz. `dist/bundles/mediabunny.min.cjs` is wrapped in a private CommonJS scope and exposed as `MessageFlowMedia`. No library logic is modified. License: `mediabunny.LICENSE`.

To update, retrieve the pinned npm packages with `npm pack --ignore-scripts`, review the release and license, recreate the browser wrappers, and run the export browser tests (including decoding the generated files). Do not lint generated vendor code as application code.
