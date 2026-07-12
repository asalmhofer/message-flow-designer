import { defaultProject } from '../config/defaults.js';
import { createComponent } from './componentModel.js';
import { createConnector } from './connectorModel.js';
import { createFlowStep } from './flowStepModel.js';

export function createInitialAppState(overrides = {}){
  const base = defaultProject();
  return {
    ...base,
    ...overrides,
    components: (overrides.components || base.components).map(createComponent),
    connectors: (overrides.connectors || base.connectors).map(createConnector),
    flowSteps: (overrides.flowSteps || base.flowSteps).map(createFlowStep),
    selection: { ...base.selection, ...(overrides.selection || {}) },
    viewport: { ...base.viewport, ...(overrides.viewport || {}) },
    presentation: { ...base.presentation, ...(overrides.presentation || {}) },
    animation: { ...base.animation, ...(overrides.animation || {}) },
    preferences: { ...base.preferences, ...(overrides.preferences || {}) },
  };
}
