export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export function createElement(tagName, attrs = {}, children = []){
  const el = document.createElement(tagName);
  for(const [key, value] of Object.entries(attrs)){
    if(key === 'className') el.className = value;
    else if(key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value);
  }
  for(const child of children) el.append(child);
  return el;
}
