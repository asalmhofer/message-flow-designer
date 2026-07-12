import { COMPONENT_TYPES, DEFAULT_COMPONENT_SIZE } from '../config/constants.js';
import { getDynamicPorts } from '../canvas/geometry.js';

const shapes = new Map();

export function registerShape(shape){ shapes.set(shape.type, shape); }
export function getShape(type){ return shapes.get(type); }
export function listShapes(){ return Array.from(shapes.values()); }
export function clearShapes(){ shapes.clear(); }

export function registerDefaultShapes(){
  if(shapes.size) return;
  for(const type of COMPONENT_TYPES){
    registerShape({
      type,
      label: labelForShape(type),
      getPorts: getDynamicPorts,
      defaults: { ...DEFAULT_COMPONENT_SIZE },
      createSvg: null,
    });
  }
}

function labelForShape(type){
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
}
