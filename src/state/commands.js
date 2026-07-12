import { actions } from './actions.js';

export class Command {
  constructor(description){ this.description = description; }
  execute(){ throw new Error('execute() must be implemented'); }
  undo(){ throw new Error('undo() must be implemented'); }
  redo(){ return this.execute(); }
}

export class AddComponentCommand extends Command {
  constructor(store, component){ super(`Add component ${component.name || ''}`.trim()); this.store = store; this.component = component; }
  execute(){ this.store.dispatch(actions.addComponent(this.component)); }
  undo(){ this.store.dispatch(actions.deleteComponent(this.component.id)); }
}

export class UpdateComponentCommand extends Command {
  constructor(store, id, before, after){ super(`Update component ${id}`); this.store = store; this.id = id; this.before = before; this.after = after; }
  execute(){ this.store.dispatch(actions.updateComponent(this.id, this.after)); }
  undo(){ this.store.dispatch(actions.updateComponent(this.id, this.before)); }
}

export class AddConnectorCommand extends Command {
  constructor(store, connector, flowStep){ super(`Add connector ${connector.id}`); this.store = store; this.connector = connector; this.flowStep = flowStep; }
  execute(){ this.store.dispatch(actions.addConnector(this.connector)); if(this.flowStep) this.store.dispatch(actions.addFlowStep(this.flowStep)); }
  undo(){ this.store.dispatch(actions.deleteConnector(this.connector.id)); }
}
