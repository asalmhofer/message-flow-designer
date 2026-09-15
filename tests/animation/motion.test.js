import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/animation/motion.js';

const {transferDuration,travelProgress} = globalThis.MessageFlowMotion;

test('distance adjusts short and long transfers without changing ordinary paths',()=>{
  assert.equal(transferDuration(1000,[80]),750);
  assert.equal(transferDuration(1000,[240]),1000);
  assert.equal(transferDuration(1000,[520]),1000);
  assert.equal(transferDuration(1000,[650]),1250);
  assert.equal(transferDuration(1000,[10000]),1350);
});

test('simultaneous paths share the longest path timing regardless of ordering',()=>{
  assert.equal(transferDuration(550,[80,650]),transferDuration(550,[650,80]));
  assert.equal(transferDuration(550,[80,650]),transferDuration(550,[650]));
});

test('travel starts with a departure cue, progresses monotonically and reaches its endpoint',()=>{
  assert.equal(travelProgress(0),0);
  assert.equal(travelProgress(.08),0);
  let previous = 0;
  for(let i=9;i<=100;i++){
    const current=travelProgress(i/100);
    assert.ok(current>=previous && current<=1);
    previous=current;
  }
  assert.equal(travelProgress(1),1);
});
