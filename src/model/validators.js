import { COMPONENT_TYPES, CONNECTOR_TYPES, EXECUTION_MODES } from '../config/constants.js';
import { validateComponent } from './componentModel.js';
import { validateConnector } from './connectorModel.js';
import { validateFlowStep } from './flowStepModel.js';

export function validateProject(project){
  const errors = [];
  if(!project || typeof project !== 'object') return { valid: false, errors: ['Project must be an object'] };
  if(!Number.isFinite(Number(project.schemaVersion))) errors.push('schemaVersion is required');
  for(const component of project.components || []){
    errors.push(...validateComponent(component).errors);
    if(component.shapeType && !COMPONENT_TYPES.includes(component.shapeType)) errors.push(`Unsupported shape type: ${component.shapeType}`);
  }
  for(const connector of project.connectors || []){
    errors.push(...validateConnector(connector, project.components || []).errors);
    if(connector.routingType && !CONNECTOR_TYPES.includes(connector.routingType)) errors.push(`Unsupported connector type: ${connector.routingType}`);
  }
  for(const flowStep of project.flowSteps || []){
    errors.push(...validateFlowStep(flowStep, project.connectors || []).errors);
    if(flowStep.executionMode && !EXECUTION_MODES.includes(flowStep.executionMode)) errors.push(`Unsupported execution mode: ${flowStep.executionMode}`);
  }
  return { valid: errors.length === 0, errors };
}
