import { DEFAULT_SCHEMA_VERSION } from './config/constants.js';
import { createStore } from './state/store.js';
import { createInitialAppState } from './model/appState.js';
import { registerDefaultShapes } from './registry/shapeRegistry.js';
import { registerDefaultConnectorTypes } from './registry/connectorRegistry.js';
import { registerDefaultTools } from './registry/toolRegistry.js';
import { bootstrapLegacyApp } from './legacy/bootstrapLegacyApp.js';

/**
 * Application composition root.
 *
 * The current production UI is bootstrapped through the legacy compatibility
 * layer to preserve behavior. The extracted modules provide the stable
 * architecture for new development and tests.
 */
function main(){
  registerDefaultShapes();
  registerDefaultConnectorTypes();
  registerDefaultTools();

  const store = createStore(createInitialAppState({ schemaVersion: DEFAULT_SCHEMA_VERSION }));
  window.MessageFlowDeveloperAPI = Object.freeze({ store });

  bootstrapLegacyApp();
}

main();
