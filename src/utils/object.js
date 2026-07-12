export function deepClone(value){
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function mergeDefined(target, changes){
  const next = { ...target };
  for(const [key, value] of Object.entries(changes || {})){
    if(value !== undefined) next[key] = value;
  }
  return next;
}
