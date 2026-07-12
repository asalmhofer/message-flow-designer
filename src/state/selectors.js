export const selectComponents = state => state.components;
export const selectConnectors = state => state.connectors;
export const selectFlowSteps = state => [...state.flowSteps].sort((a,b) => Number(a.order) - Number(b.order));
export const selectSelectedComponents = state => state.components.filter(component => state.selection.componentIds.includes(component.id));
export const selectConnectorById = (state, id) => state.connectors.find(connector => connector.id === id) || null;
