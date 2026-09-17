import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/storage/diagramDocument.js';
import {diagram} from '../fixtures/diagram.js';

const normalize=globalThis.MessageFlowDocuments.normalizeDiagram;
for(const field of ['showTokenMessageInPresentation','showProcessingActionInPresentation','presentationPanelOpen']){
  test(`${field} persists independently and rejects malformed imports`,()=>{
    for(const value of [true,false]){
      const data=diagram();data.settings[field]=value;
      assert.equal(normalize(JSON.parse(JSON.stringify(normalize(data)))).settings[field],value);
    }
    assert.equal(normalize(diagram()).settings[field],undefined);
    for(const value of ['false',1,null,{}]){
      const data=diagram();data.settings[field]=value;
      assert.throws(()=>normalize(data),new RegExp(`${field} must be true or false`));
    }
  });
}

test('presentation panel width and tab persist independently from the editor panel and reject malformed values',()=>{
  const data=diagram();Object.assign(data.settings,{flowPanelWidth:600,presentationPanelWidth:310,presentationPanelTab:'flow'});
  const saved=normalize(JSON.parse(JSON.stringify(normalize(data))));
  assert.equal(saved.settings.flowPanelWidth,600);assert.equal(saved.settings.presentationPanelWidth,310);assert.equal(saved.settings.presentationPanelTab,'flow');
  for(const value of [null,'wide',239,481])assert.throws(()=>normalize({...data,settings:{...data.settings,presentationPanelWidth:value}}),/Presentation panel width/);
  assert.throws(()=>normalize({...data,settings:{presentationPanelTab:'unknown'}}),/Unsupported presentationPanelTab/);
});
