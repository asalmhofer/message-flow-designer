import { DEFAULT_SCHEMA_VERSION } from './constants.js';

export function defaultPreferences(){
  return {
    showGrid: true,
    snapToGrid: true,
    animationSpeed: 'normal',
    animationMode: 'auto',
    defaultConnectorType: 'arc',
    showInactiveConnectorsInPresentation: true,
    presentationImagePanelOpen: true,
  };
}

export function defaultViewport(){
  return { zoom: 1, panX: 80, panY: 80 };
}

export function defaultSelection(){
  return { componentIds: [], connectorId: null, flowStepId: null };
}

export function defaultPresentationState(){
  return { active: false, imagePanelOpen: true };
}

export function defaultAnimationState(){
  return { status: 'stopped', phase: 'stopped', currentGroupIndex: -1, completedFlowStepIds: [] };
}

export function defaultProject(){
  return {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    components: [],
    connectors: [],
    flowSteps: [],
    selection: defaultSelection(),
    viewport: defaultViewport(),
    editorMode: 'select',
    presentation: defaultPresentationState(),
    animation: defaultAnimationState(),
    preferences: defaultPreferences(),
  };
}
