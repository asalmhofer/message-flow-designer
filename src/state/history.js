export class CommandHistory {
  constructor(){ this.past = []; this.future = []; }
  execute(command){ command.execute(); this.past.push(command); this.future.length = 0; }
  undo(){ const command = this.past.pop(); if(!command) return false; command.undo(); this.future.push(command); return true; }
  redo(){ const command = this.future.pop(); if(!command) return false; command.redo(); this.past.push(command); return true; }
}
