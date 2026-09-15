import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/storage/diagramDocument.js';
import {diagram} from '../fixtures/diagram.js';

const normalize=globalThis.MessageFlowDocuments.normalizeDiagram;
for(const field of ['showTokenMessageInPresentation','showProcessingActionInPresentation']){
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
