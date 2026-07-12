export function getOrderedFlowSteps(flowSteps){
  return [...flowSteps].sort((a,b) => Number(a.order) - Number(b.order));
}

export function normalizeSequence(flowSteps){
  return getOrderedFlowSteps(flowSteps).map((step, index) => ({ ...step, order: index + 1 }));
}

export function groupFlowStepsForExecution(flowSteps){
  const groups = [];
  for(const step of getOrderedFlowSteps(flowSteps)){
    if(step.executionMode === 'withPrevious' && groups.length){
      groups[groups.length - 1].push(step);
    }else{
      groups.push([step]);
    }
  }
  return groups;
}
