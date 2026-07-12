import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFlowStepsForExecution, normalizeSequence } from '../../src/flow/sequenceService.js';

test('groups withPrevious steps with the prior step', () => {
  const steps = [
    { id: 'a', order: 1, executionMode: 'afterPrevious' },
    { id: 'b', order: 2, executionMode: 'withPrevious' },
    { id: 'c', order: 3, executionMode: 'afterPrevious' },
  ];
  const groups = groupFlowStepsForExecution(steps);
  assert.deepEqual(groups.map(group => group.map(step => step.id)), [['a','b'], ['c']]);
});

test('normalizes sequence numbers', () => {
  const normalized = normalizeSequence([{ id:'b', order:9 }, { id:'a', order:4 }]);
  assert.deepEqual(normalized.map(step => step.order), [1,2]);
});
