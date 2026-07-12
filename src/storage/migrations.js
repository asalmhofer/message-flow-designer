import { DEFAULT_SCHEMA_VERSION } from '../config/constants.js';
import { createComponent } from '../model/componentModel.js';
import { createConnector } from '../model/connectorModel.js';
import { createFlowStep } from '../model/flowStepModel.js';
import { createInitialAppState } from '../model/appState.js';

export function migrateProject(projectData){
  const version = Number(projectData?.schemaVersion || 1);
  if(version > DEFAULT_SCHEMA_VERSION) throw new Error(`Unsupported project schema version: ${version}`);
  if(version === DEFAULT_SCHEMA_VERSION) return createInitialAppState(projectData);
  return migrateLegacyV1(projectData);
}

function migrateLegacyV1(data){
  const components = (data.components || []).map(createComponent);
  const connectors = (data.messageFlows || data.connectors || []).map(flow => createConnector({
    id: flow.id,
    sourceComponentId: flow.sourceComponentId,
    targetComponentId: flow.targetComponentId,
    sourcePortId: flow.sourcePortId,
    targetPortId: flow.targetPortId,
    connectionStyle: flow.connectionStyle,
    controlPoint: flow.controlPoint,
    style: flow.style,
    visibleInEditor: flow.visibleInEditor,
  }));
  const flowSteps = (data.messageFlows || data.flowSteps || []).map(flow => createFlowStep({
    id: flow.id,
    connectorId: flow.id,
    sequenceNumber: flow.sequenceNumber,
    messageText: flow.messageText,
    actionText: flow.actionText,
    notes: flow.notes,
    processingImageDataUrl: flow.processingImageDataUrl,
    timing: flow.timing,
  }));
  return createInitialAppState({ schemaVersion: DEFAULT_SCHEMA_VERSION, components, connectors, flowSteps, preferences: data.settings || data.preferences || {} });
}
