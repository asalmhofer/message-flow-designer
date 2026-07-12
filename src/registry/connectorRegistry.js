import { CONNECTOR_TYPES } from '../config/constants.js';
import { calculateConnectorPath } from '../canvas/geometry.js';

const connectorTypes = new Map();
export function registerConnectorType(definition){ connectorTypes.set(definition.type, definition); }
export function getConnectorType(type){ return connectorTypes.get(type); }
export function listConnectorTypes(){ return Array.from(connectorTypes.values()); }
export function clearConnectorTypes(){ connectorTypes.clear(); }

export function registerDefaultConnectorTypes(){
  if(connectorTypes.size) return;
  for(const type of CONNECTOR_TYPES){
    registerConnectorType({ type, label: type, calculatePath: calculateConnectorPath, defaults: { thickness: 2.2 } });
  }
}
