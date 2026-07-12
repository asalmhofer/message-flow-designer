import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject } from '../../src/storage/migrations.js';

test('migrates legacy messageFlows into connectors and flowSteps', () => {
  const project = migrateProject({
    schemaVersion: 1,
    components: [{ id:'a', name:'A', x:0, y:0, width:100, height:80 }, { id:'b', name:'B', x:200, y:0, width:100, height:80 }],
    messageFlows: [{ id:'f1', sourceComponentId:'a', targetComponentId:'b', messageText:'Hello', sequenceNumber:1 }],
  });
  assert.equal(project.connectors.length, 1);
  assert.equal(project.flowSteps.length, 1);
  assert.equal(project.flowSteps[0].message, 'Hello');
});
