import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/canvas/connectionPlacement.js';
const {place}=globalThis.MessageFlowConnectionPlacement;
const source={x:0,y:0,width:192,height:96,shape:'umlComponent'},size={width:144,height:96};
test('adjacent placement follows the chosen direction and keeps a clear gap',()=>{
  for(const side of ['left','right','top','bottom']){
    const box=place(source,side,null,size,[source]);
    if(side==='right')assert.ok(box.x>=source.x+source.width+72);
    if(side==='left')assert.ok(box.x+box.width<=source.x-72);
    if(side==='top')assert.ok(box.y+box.height<=source.y-72);
    if(side==='bottom')assert.ok(box.y>=source.y+source.height+72);
  }
});
test('occupied neighbour positions find clear nearby space without moving existing elements',()=>{
  const blocked={...size,x:288,y:0},obstacles=[source,blocked],original=structuredClone(obstacles);
  const box=place(source,'right',null,size,obstacles);
  for(const other of obstacles)assert.ok(box.x+box.width+24<=other.x||box.x>=other.x+other.width+24||box.y+box.height+24<=other.y||box.y>=other.y+other.height+24);
  assert.deepEqual(obstacles,original);
});
test('free placement preserves the drop location and allows components inside packages',()=>{
  const point={x:483,y:321},box=place(source,'right',point,size,[source,{shape:'package',x:200,y:100,width:600,height:500}],0);
  assert.equal(box.x+box.width/2,point.x);assert.equal(box.y+box.height/2,point.y);
});
