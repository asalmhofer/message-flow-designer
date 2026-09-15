import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/model/elementCatalog.js';
import '../../src/storage/diagramDocument.js';
const E=globalThis.MessageFlowElements;
const normalize=globalThis.MessageFlowDocuments.normalizeDiagram;
const component={id:'service',shape:'umlComponent',name:'Service',x:100,y:80,width:200,height:100};
const port={id:'port',shape:'umlPort',name:'API',x:0,y:0,width:14,height:14,ownerId:'service',attachment:{side:'right',ratio:.25}};
const provided={id:'api',shape:'providedInterface',name:'Orders',x:0,y:0,width:40,height:40,ownerId:'port',attachment:{side:'right',ratio:.5}};
test('attached geometry follows a resized and moved owner, independent of document order',()=>{
  const list=structuredClone([provided,port,component]);E.sync(list);
  assert.equal(list[1].x,293);assert.equal(list[1].y,98);assert.equal(list[0].x,317);
  list[2].x+=40;list[2].height=200;E.sync(list);
  assert.equal(list[1].x,333);assert.equal(list[1].y,123);assert.equal(list[0].y,110);
  assert.deepEqual(E.boundary(list[2],{x:100,y:999}).side,'bottom');
});
test('copy and move closure includes nested package contents and their attached elements',()=>{
  const pkg={id:'package',shape:'package',x:80,y:50,width:280,height:250};
  const outside={id:'outside',shape:'umlComponent',x:600,y:0,width:100,height:100};
  assert.deepEqual([...E.descendants(['package'],[pkg,component,port,provided,outside],true)].sort(),['api','package','port','service']);
  assert.deepEqual([...E.descendants(['service'],[pkg,component,port,provided])].sort(),['api','port','service']);
});
test('every selectable standalone element and theme round-trips in the document format',()=>{
  const components=E.entries.filter(e=>!E.attached(e.id)).map(e=>({id:e.id,shape:e.id,name:e.name,x:0,y:0,width:e.width,height:e.height,stereotype:'service',details:'A short description'}));
  const d={components,messageFlows:[],settings:{diagramTheme:'soft',diagramPalette:'teal'}};
  assert.deepEqual(normalize(normalize(d)),normalize(d));
  assert.equal(E.entries.some(e=>['umlClass','umlAction'].includes(e.id)),false);
  assert.notDeepEqual(E.style('technical'),E.style('soft'));
  assert.notDeepEqual(E.style('technical'),E.style('monochrome'));
});
test('valid attached elements and comments round-trip; broken owners and annotations are rejected',()=>{
  const base={components:structuredClone([component,port,provided,{id:'comment',shape:'umlComment',name:'Note',x:0,y:0,annotatedElementId:'service'}]),messageFlows:[]};
  assert.deepEqual(normalize(normalize(base)),normalize(base));
  for(const edit of [d=>d.components[1].ownerId='missing',d=>d.components[1].ownerId='api',d=>d.components[1].attachment.ratio=2,d=>d.components[1].attachment.side='diagonal',d=>d.components[3].annotatedElementId='missing',d=>d.settings={diagramTheme:'rainbow'},d=>d.components[0].nodeKind='unknown']){
    const d=structuredClone(base);edit(d);assert.throws(()=>normalize(d));
  }
});
