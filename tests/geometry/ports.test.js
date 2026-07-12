import test from 'node:test';
import assert from 'node:assert/strict';
import { getDynamicPorts, portPosition } from '../../src/canvas/geometry.js';

test('large components expose more dynamic ports', () => {
  const small = { position:{x:0,y:0}, size:{width:120,height:80} };
  const large = { position:{x:0,y:0}, size:{width:480,height:240} };
  assert.ok(getDynamicPorts(large).length > getDynamicPorts(small).length);
});

test('portPosition calculates edge coordinates', () => {
  const component = { position:{x:10,y:20}, size:{width:100,height:60} };
  assert.deepEqual(portPosition(component, 'right:0.50'), { x:110, y:50 });
});
