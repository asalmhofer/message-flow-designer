import { createId } from '../utils/id.js';

/**
 * @typedef {Object} Connector
 * @property {string} id
 * @property {string} sourceComponentId
 * @property {string} targetComponentId
 * @property {{side:string,ratio:number}|string|null} sourcePort
 * @property {{side:string,ratio:number}|string|null} targetPort
 * @property {string} routingType
 * @property {Array<{x:number,y:number}>} bendPoints
 * @property {{x:number,y:number}|null} labelPosition
 * @property {{color:string,thickness:number,textColor:string}} style
 * @property {{visibleInEditor:boolean}} visibility
 * @property {Record<string, unknown>} metadata
 */
export function createConnector(data = {}){
  return {
    id: data.id || createId('connector'),
    sourceComponentId: data.sourceComponentId,
    targetComponentId: data.targetComponentId,
    sourcePort: data.sourcePort ?? data.sourcePortId ?? null,
    targetPort: data.targetPort ?? data.targetPortId ?? null,
    routingType: data.routingType || data.connectionStyle || 'arc',
    bendPoints: Array.isArray(data.bendPoints) ? data.bendPoints.map(normalizePoint) : (data.controlPoint ? [normalizePoint(data.controlPoint)] : []),
    labelPosition: data.labelPosition ? normalizePoint(data.labelPosition) : null,
    style: {
      color: data.style?.color || '#475569',
      thickness: Number(data.style?.thickness ?? 2.2),
      textColor: data.style?.textColor || '#0f172a',
    },
    visibility: { visibleInEditor: data.visibility?.visibleInEditor ?? data.visibleInEditor ?? true },
    metadata: data.metadata || {},
  };
}

export function normalizePoint(point){
  return { x: Number(point.x || 0), y: Number(point.y || 0) };
}

export function validateConnector(connector, components = []){
  const componentIds = new Set(components.map(c => c.id));
  const errors = [];
  if(!connector?.id) errors.push('Connector id is required');
  if(!connector?.sourceComponentId || !componentIds.has(connector.sourceComponentId)) errors.push(`Connector ${connector?.id || ''} has invalid source`);
  if(!connector?.targetComponentId || !componentIds.has(connector.targetComponentId)) errors.push(`Connector ${connector?.id || ''} has invalid target`);
  return { valid: errors.length === 0, errors };
}
