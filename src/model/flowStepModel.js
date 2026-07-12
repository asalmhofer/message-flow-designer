import { createId } from '../utils/id.js';

/**
 * @typedef {Object} FlowStep
 * @property {string} id
 * @property {string} connectorId
 * @property {number|string} order
 * @property {string} message
 * @property {string} action
 * @property {string} notes
 * @property {string|null} imageRef
 * @property {'afterPrevious'|'withPrevious'} executionMode
 * @property {Record<string, unknown>} presentation
 */
export function createFlowStep(data = {}){
  return {
    id: data.id || createId('step'),
    connectorId: data.connectorId || data.id || '',
    order: Number(data.order ?? data.sequenceNumber ?? 1),
    message: data.message ?? data.messageText ?? '',
    action: data.action ?? data.actionText ?? '',
    notes: data.notes || '',
    imageRef: data.imageRef ?? data.processingImageDataUrl ?? null,
    executionMode: data.executionMode || data.timing || 'afterPrevious',
    presentation: data.presentation || {},
  };
}

export function validateFlowStep(flowStep, connectors = []){
  const connectorIds = new Set(connectors.map(connector => connector.id));
  const errors = [];
  if(!flowStep?.id) errors.push('Flow step id is required');
  if(!flowStep?.connectorId || !connectorIds.has(flowStep.connectorId)) errors.push(`Flow step ${flowStep?.id || ''} has invalid connector reference`);
  if(!Number.isFinite(Number(flowStep?.order))) errors.push(`Flow step ${flowStep?.id || ''} order must be numeric`);
  return { valid: errors.length === 0, errors };
}
