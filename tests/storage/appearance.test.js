import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../../src/storage/diagramDocument.js';
import {diagram} from '../fixtures/diagram.js';
import {importProjectFromText} from '../../src/storage/importExportService.js';
const normalize=globalThis.MessageFlowDocuments.normalizeDiagram;
test('appearance values and legacy defaults survive normalization without changing the input',()=>{
  const data=diagram();Object.assign(data.components[0],{fillColor:'transparent',fillOpacity:0,borderStyle:'dotted',borderWidth:0,borderOpacity:.4,textOpacity:.8,fontSize:24,fontWeight:700,textAlign:'right'});data.messageFlows[0].style={lineStyle:'dashed',thickness:4,opacity:.6,textOpacity:.7};
  const normalized=normalize(data);assert.deepEqual(normalized.components[0],{...data.components[0],zIndex:1});assert.deepEqual(normalized.messageFlows[0].style,data.messageFlows[0].style);assert.notEqual(normalized.components[0],{...data.components[0],zIndex:1});assert.equal(normalize(diagram()).components[1].fontSize,undefined);
});
test('malformed style values cannot enter the saved document',()=>{
  for(const change of [{fillOpacity:-1},{borderWidth:-1},{fontSize:1000},{fontWeight:123},{textAlign:'justify'},{borderStyle:'unknown'},{textOpacity:2}]){const data=diagram();Object.assign(data.components[0],change);assert.throws(()=>normalize(data));}
  for(const style of [{lineStyle:'unknown'},{opacity:NaN},{textOpacity:2}]){const data=diagram();data.messageFlows[0].style=style;assert.throws(()=>normalize(data));}
});
test('modular import keeps component and connection appearance',()=>{
  const data=diagram();Object.assign(data.components[0],{fontSize:20,fillOpacity:.5,borderStyle:'dashed'});data.messageFlows[0].style={lineStyle:'dotted',opacity:.4};
  const result=importProjectFromText(JSON.stringify(data));assert.equal(result.components[0].style.fontSize,20);assert.equal(result.components[0].style.fillOpacity,.5);assert.equal(result.components[0].style.borderStyle,'dashed');assert.equal(result.connectors[0].style.lineStyle,'dotted');assert.equal(result.connectors[0].style.opacity,.4);
});
