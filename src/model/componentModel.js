import { DEFAULT_COMPONENT_SIZE } from '../config/constants.js';
import { createId } from '../utils/id.js';

/**
 * @typedef {Object} ComponentNode
 * @property {string} id
 * @property {string} name
 * @property {string} shapeType
 * @property {{x:number,y:number}} position
 * @property {{width:number,height:number}} size
 * @property {{fillColor:string,borderColor:string,textColor:string,borderWidth:number}} style
 * @property {number} zIndex
 * @property {string|null} parentGroupId
 * @property {Record<string, unknown>} metadata
 */
export function createComponent(data = {}){
  return {
    id: data.id || createId('cmp'),
    name: data.name || 'Component',
    shapeType: data.shapeType || data.shape || 'roundedRectangle',
    position: normalizePosition(data.position || { x: data.x ?? 80, y: data.y ?? 80 }),
    size: normalizeSize(data.size || { width: data.width ?? DEFAULT_COMPONENT_SIZE.width, height: data.height ?? DEFAULT_COMPONENT_SIZE.height }),
    style: {
      fillColor: data.style?.fillColor || data.fillColor || '#ffffff',
      borderColor: data.style?.borderColor || data.borderColor || '#334155',
      textColor: data.style?.textColor || data.textColor || '#0f172a',
      borderWidth: Number(data.style?.borderWidth ?? data.borderWidth ?? 2),
    },
    zIndex: Number(data.zIndex ?? 1),
    parentGroupId: data.parentGroupId || null,
    metadata: data.metadata || {},
  };
}

export function normalizePosition(position){
  return { x: Number(position.x || 0), y: Number(position.y || 0) };
}

export function normalizeSize(size){
  return { width: Math.max(24, Number(size.width || DEFAULT_COMPONENT_SIZE.width)), height: Math.max(24, Number(size.height || DEFAULT_COMPONENT_SIZE.height)) };
}

export function validateComponent(component){
  const errors = [];
  if(!component || typeof component !== 'object') errors.push('Component must be an object');
  if(!component?.id) errors.push('Component id is required');
  if(!component?.name || !String(component.name).trim()) errors.push(`Component ${component?.id || ''} name is required`);
  if(!Number.isFinite(component?.position?.x) || !Number.isFinite(component?.position?.y)) errors.push(`Component ${component?.id || ''} position must be numeric`);
  if(!Number.isFinite(component?.size?.width) || !Number.isFinite(component?.size?.height)) errors.push(`Component ${component?.id || ''} size must be numeric`);
  return { valid: errors.length === 0, errors };
}
