import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/state/store.js';
import { actions } from '../../src/state/actions.js';
import { createComponent } from '../../src/model/componentModel.js';

test('store dispatches component additions and supports undo/redo', () => {
  const store = createStore();
  const component = createComponent({ id: 'cmp_1', name: 'Frontend' });
  store.dispatch(actions.addComponent(component));
  assert.equal(store.getState().components.length, 1);
  assert.equal(store.undo(), true);
  assert.equal(store.getState().components.length, 0);
  assert.equal(store.redo(), true);
  assert.equal(store.getState().components[0].name, 'Frontend');
});
