import { ActionTypes } from './actions.js';
import { createComponent } from '../model/componentModel.js';
import { createConnector } from '../model/connectorModel.js';
import { createFlowStep } from '../model/flowStepModel.js';

export function reduceAppState(state, action){
  switch(action.type){
    case ActionTypes.ADD_COMPONENT:
      return { ...state, components: [...state.components, createComponent(action.payload.component)] };
    case ActionTypes.UPDATE_COMPONENT:
      return { ...state, components: state.components.map(component => component.id === action.payload.id ? { ...component, ...action.payload.changes } : component) };
    case ActionTypes.DELETE_COMPONENT: {
      const id = action.payload.id;
      const connectors = state.connectors.filter(connector => connector.sourceComponentId !== id && connector.targetComponentId !== id);
      const connectorIds = new Set(connectors.map(connector => connector.id));
      return {
        ...state,
        components: state.components.filter(component => component.id !== id),
        connectors,
        flowSteps: state.flowSteps.filter(step => connectorIds.has(step.connectorId)),
      };
    }
    case ActionTypes.ADD_CONNECTOR:
      return { ...state, connectors: [...state.connectors, createConnector(action.payload.connector)] };
    case ActionTypes.UPDATE_CONNECTOR:
      return { ...state, connectors: state.connectors.map(connector => connector.id === action.payload.id ? { ...connector, ...action.payload.changes } : connector) };
    case ActionTypes.DELETE_CONNECTOR:
      return { ...state, connectors: state.connectors.filter(connector => connector.id !== action.payload.id), flowSteps: state.flowSteps.filter(step => step.connectorId !== action.payload.id) };
    case ActionTypes.ADD_FLOW_STEP:
      return { ...state, flowSteps: [...state.flowSteps, createFlowStep(action.payload.flowStep)] };
    case ActionTypes.UPDATE_FLOW_STEP:
      return { ...state, flowSteps: state.flowSteps.map(step => step.id === action.payload.id ? { ...step, ...action.payload.changes } : step) };
    case ActionTypes.REORDER_FLOW_STEPS:
      return { ...state, flowSteps: action.payload.flowSteps };
    case ActionTypes.SET_SELECTION:
      return { ...state, selection: { ...state.selection, ...action.payload.selection } };
    case ActionTypes.SET_VIEWPORT:
      return { ...state, viewport: { ...state.viewport, ...action.payload.viewport } };
    case ActionTypes.SET_EDITOR_MODE:
      return { ...state, editorMode: action.payload.editorMode };
    case ActionTypes.ENTER_PRESENTATION_MODE:
      return { ...state, presentation: { ...state.presentation, active: true } };
    case ActionTypes.EXIT_PRESENTATION_MODE:
      return { ...state, presentation: { ...state.presentation, active: false } };
    case ActionTypes.START_ANIMATION:
      return { ...state, animation: { ...state.animation, status: 'running', phase: 'transfer', currentGroupIndex: 0 } };
    case ActionTypes.ADVANCE_ANIMATION:
      return { ...state, animation: { ...state.animation, ...action.payload } };
    case ActionTypes.STOP_ANIMATION:
      return { ...state, animation: { ...state.animation, status: 'stopped', phase: 'stopped', currentGroupIndex: -1 } };
    case ActionTypes.REPLACE_STATE:
      return action.payload.state;
    default:
      return state;
  }
}
