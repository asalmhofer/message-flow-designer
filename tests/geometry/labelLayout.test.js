import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../../src/canvas/labelLayout.js';
import '../../src/storage/diagramDocument.js';
import {diagram} from '../fixtures/diagram.js';

const layout = globalThis.MessageFlowLabels.layoutLabels;
const overlaps = (a,b) => a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
test('automatic labels avoid components and each other, deterministically', () => {
  const labels = ['a','b','c'].map(id => ({id,anchor:{x:100,y:100},width:120,height:32}));
  const component = {x:70,y:75,width:60,height:50};
  const first = layout(labels,[component]);
  const boxes = [...first.values()];
  boxes.forEach((box,index) => {
    assert.equal(overlaps(box,component),false);
    boxes.slice(index+1).forEach(other => assert.equal(overlaps(box,other),false));
  });
  assert.deepEqual(layout(labels,[component]), first);
});
test('manual offsets take priority and follow the path anchor', () => {
  const labels = [{id:'auto',anchor:{x:100,y:100},width:120,height:32},
    {id:'manual',anchor:{x:100,y:100},width:120,height:32,offset:{x:0,y:0}}];
  const first = layout(labels);
  assert.deepEqual(first.get('manual'),{x:40,y:84,width:120,height:32});
  assert.equal(overlaps(first.get('auto'),first.get('manual')),false);
  labels[1].anchor.x += 80;
  assert.equal(layout(labels).get('manual').x,120);
});
test('label offsets round-trip in existing JSON and malformed offsets are rejected', () => {
  const data = diagram();
  data.messageFlows[0].labelOffset = {x:-12.5,y:84};
  assert.deepEqual(globalThis.MessageFlowDocuments.normalizeDiagram(data).messageFlows[0].labelOffset,{x:-12.5,y:84});
  for(const offset of [{x:'bad',y:3},{x:4},{x:Infinity,y:3},'bad']){
    data.messageFlows[0].labelOffset = offset;
    assert.throws(() => globalThis.MessageFlowDocuments.normalizeDiagram(data), /Label offset/);
  }
});
