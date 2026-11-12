import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences } from '../../src/config/defaults.js';
import { createConnector } from '../../src/model/connectorModel.js';

test('new connector models default to straight routing',()=>{
  assert.equal(createConnector().routingType,'straight');
  assert.equal(defaultPreferences().defaultConnectorType,'straight');
});
