export function createAnimationState(overrides = {}){
  return { status: 'stopped', phase: 'stopped', currentGroupIndex: -1, completedFlowStepIds: [], ...overrides };
}
