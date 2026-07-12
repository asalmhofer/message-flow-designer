import { createInitialAppState } from '../model/appState.js';
import { deepClone } from '../utils/object.js';
import { reduceAppState } from './reducers.js';
import { ActionTypes } from './actions.js';

export function createStore(initialState = createInitialAppState()){
  let state = deepClone(initialState);
  const listeners = new Set();
  const past = [];
  const future = [];

  function notify(action){
    for(const listener of listeners) listener(getState(), action);
  }

  function getState(){ return deepClone(state); }

  function replaceState(nextState, action = { type: ActionTypes.REPLACE_STATE }){
    past.push(deepClone(state));
    state = deepClone(nextState);
    future.length = 0;
    notify(action);
  }

  function dispatch(action){
    const next = reduceAppState(state, action);
    if(next !== state){
      past.push(deepClone(state));
      state = next;
      future.length = 0;
      notify(action);
    }
    return action;
  }

  function subscribe(listener){
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function resetState(){
    replaceState(createInitialAppState(), { type: 'RESET_STATE' });
  }

  function undo(){
    if(!past.length) return false;
    future.push(deepClone(state));
    state = past.pop();
    notify({ type: 'UNDO' });
    return true;
  }

  function redo(){
    if(!future.length) return false;
    past.push(deepClone(state));
    state = future.pop();
    notify({ type: 'REDO' });
    return true;
  }

  return { getState, dispatch, subscribe, replaceState, resetState, undo, redo };
}
