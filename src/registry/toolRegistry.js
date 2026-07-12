const tools = new Map();
export function registerTool(tool){ tools.set(tool.id, tool); }
export function getTool(id){ return tools.get(id); }
export function listTools(){ return Array.from(tools.values()); }
export function clearTools(){ tools.clear(); }
export function registerDefaultTools(){
  if(tools.size) return;
  ['select','pan','connect','resize','text'].forEach(id => registerTool({ id, label: id, activate(){}, deactivate(){} }));
}
