import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../../src/canvas/labelLayout.js';

const layout = globalThis.MessageFlowLabels.layoutCallouts;
const overlaps = (a,b) => a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height;
test('simultaneous processing callouts stay clear of components and each other', () => {
  const target={x:400,y:240,width:180,height:80};
  const obstacles=[target,{x:170,y:100,width:180,height:160},{x:590,y:190,width:170,height:180}];
  const items=Array.from({length:8},(_,id)=>({id,target,width:240,height:76}));
  const first=layout(items,obstacles,{x:0,y:0,width:960,height:700});
  const boxes=[...first.values()];
  boxes.forEach((box,i)=>{
    for(const other of [...obstacles,...boxes.slice(i+1)]) assert.equal(overlaps(box,other),false);
  });
  assert.deepEqual(layout(items,obstacles,{x:0,y:0,width:960,height:700}),first);
});
test('processing callouts prefer visible space below a component near the presentation heading', () => {
  const target={x:200,y:150,width:160,height:80};
  const box=layout([{id:'action',target,width:240,height:76}],[target],{x:120,y:140,width:320,height:450}).get('action');
  assert.ok(box.y>=target.y+target.height);
  assert.ok(box.x>=120 && box.x+box.width<=440);
});
