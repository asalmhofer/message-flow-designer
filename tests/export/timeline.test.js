import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/animation/motion.js';
import '../../src/export/timeline.js';
const {build,at,frames,groups}=globalThis.MessageFlowExportTimeline;
const flows=[{id:'a',length:220},{id:'b',length:260,timing:'withPrevious'},{id:'c',length:300}];
test('export ranges retain simultaneous messages and skip processing and its delay',()=>{
  assert.equal(groups(flows).length,2);
  const noProcessing=build(flows,{speed:100,processing:false}),withProcessing=build(flows,{speed:100,processing:true});
  assert.equal(noProcessing.entries[0].flows.length,2);
  assert.ok(Math.abs(withProcessing.duration-noProcessing.duration-1.8)<.0001);
  assert.ok(!noProcessing.phases.some(p=>p.phase==='processing'));
  assert.deepEqual(build(flows,{start:1,end:1}).entries.flatMap(e=>e.flows.map(f=>f.id)),['c']);
});
test('phase lookup depends on timestamps, including exact boundaries and final hold',()=>{
  const timeline=build(flows,{speed:100,processing:false,hold:1});
  assert.equal(at(timeline,0).phase,'transfer');assert.equal(at(timeline,.55).phase,'arrived');
  assert.equal(at(timeline,1.2).phase,'transfer');assert.equal(at(timeline,1.2).flows[0].id,'c');
  assert.deepEqual(at(timeline,1.2).completed,['a','b']);assert.equal(at(timeline,2.5).phase,'completed');
  assert.equal(at(timeline,200).progress,1);
});
test('frame timestamps cover the exact duration without encoding wall-time drift',()=>{
  const sequence=frames(2.213,30);assert.equal(sequence.length,67);
  sequence.forEach((frame,i)=>assert.equal(frame.time,i/30));
  assert.ok(Math.abs(sequence.reduce((sum,f)=>sum+f.duration,0)-2.213)<.000001);
});
test('empty flows still permit static export without an animation',()=>{
  const timeline=build([]);assert.equal(timeline.duration,0);assert.equal(at(timeline,0).phase,'ready');
});
