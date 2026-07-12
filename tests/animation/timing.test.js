import test from 'node:test';
import assert from 'node:assert/strict';
import { durationForSpeed, nextPhase } from '../../src/animation/timing.js';

test('animation timing maps known speeds', () => {
  assert.ok(durationForSpeed('slow') > durationForSpeed('fast'));
});

test('phase progression is deterministic', () => {
  assert.equal(nextPhase('transfer'), 'arrived');
  assert.equal(nextPhase('arrived'), 'processing');
});
