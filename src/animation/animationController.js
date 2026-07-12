import { createAnimationState } from './animationState.js';
import { groupFlowStepsForExecution } from '../flow/sequenceService.js';

export function createAnimationController({ flowSteps = [] } = {}){
  let state = createAnimationState();
  const groups = () => groupFlowStepsForExecution(flowSteps);
  return {
    start(){ state = createAnimationState({ status: 'running', phase: 'transfer', currentGroupIndex: 0 }); return state; },
    pause(){ state = { ...state, status: 'paused' }; return state; },
    resume(){ state = { ...state, status: 'running' }; return state; },
    stop(){ state = createAnimationState(); return state; },
    next(){ state = { ...state, currentGroupIndex: Math.min(state.currentGroupIndex + 1, Math.max(0, groups().length - 1)) }; return state; },
    previous(){ state = { ...state, currentGroupIndex: Math.max(0, state.currentGroupIndex - 1) }; return state; },
    getState(){ return state; },
  };
}
