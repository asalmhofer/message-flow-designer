export function enterPresentation(state){ return { ...state, presentation: { ...state.presentation, active: true } }; }
export function exitPresentation(state){ return { ...state, presentation: { ...state.presentation, active: false } }; }
export function shouldRenderConnector(connector, presentation){
  if(!presentation?.active) return connector.visibility?.visibleInEditor !== false;
  return presentation.showInactiveConnectors !== false || connector.metadata?.active === true;
}
