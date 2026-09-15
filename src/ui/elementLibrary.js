(function(root){
  'use strict';
  function create({panel,button,preview,choose,cancel,icon}){
    const catalog=root.MessageFlowElements.entries, key='message-flow-element-library-v1';
    let category='all', query='', preferences={favorites:[],recent:[]};
    try{
      const saved=JSON.parse(localStorage.getItem(key));
      for(const field of ['favorites','recent']) if(Array.isArray(saved?.[field])) preferences[field]=[...new Set(saved[field])].filter(id=>catalog.some(e=>e.id===id)).slice(0,24);
    }catch{ /* Library preferences never prevent drawing. */ }
    panel.innerHTML=`<div class="libraryHead"><div><span class="libraryEyebrow">BUILD YOUR DIAGRAM</span><h2>Elements</h2></div><button type="button" aria-label="Close element library">${icon('close')}</button></div>
      <label class="librarySearch">${icon('search')}<input type="search" placeholder="Search elements…" aria-label="Search elements"></label>
      <div class="libraryCategories" role="group" aria-label="Element categories">${[['all','All'],['basic','Basic'],['components','Components'],['deployment','Deployment'],['favorites','Favourites'],['recent','Recent']].map(([id,label])=>`<button type="button" data-category="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div>
      <div class="libraryCount" role="status"></div><div class="libraryResults"></div><div class="libraryFoot">Drag to the canvas, or click and place.</div>`;
    const results=panel.querySelector('.libraryResults');
    function persist(){try{localStorage.setItem(key,JSON.stringify(preferences));}catch{ /* Optional preferences. */ }}
    function render(){
      const items=(category==='recent' ? preferences.recent.map(id=>catalog.find(e=>e.id===id)) : catalog).filter(e =>
        (category==='all' || category==='recent' || category===e.category || category==='favorites' && preferences.favorites.includes(e.id)) &&
        `${e.name} ${e.description} ${e.category}`.toLowerCase().includes(query.toLowerCase()));
      panel.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
      panel.querySelector('.libraryCount').textContent=`${items.length} element${items.length===1?'':'s'}`;
      results.innerHTML=items.length ? items.map(e=>`<article class="elementTile"><button type="button" class="shapeTool elementChoice" data-shape="${e.id}" draggable="true" aria-label="Create ${e.name.toLowerCase()}" title="${e.description}"><span class="elementPreview">${preview(e)}</span><span class="elementName">${e.name}</span><span class="elementDescription">${e.description}</span></button><button type="button" class="elementFavorite" data-favorite="${e.id}" aria-label="Favourite ${e.name}" aria-pressed="${preferences.favorites.includes(e.id)}">${icon('star')}</button></article>`).join('') : '<p class="libraryEmpty">No elements here yet. Try another search or category.</p>';
    }
    function close(focus=false){panel.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
    function open(){panel.hidden=false;button.setAttribute('aria-expanded','true');render();panel.querySelector('input').focus();}
    button.addEventListener('click',()=>panel.hidden ? open() : close(true));
    panel.querySelector('[aria-label="Close element library"]').addEventListener('click',()=>close(true));
    panel.querySelector('input').addEventListener('input',e=>{query=e.target.value;render();});
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}});
    panel.addEventListener('click',e=>{
      const cat=e.target.closest('[data-category]'),fav=e.target.closest('[data-favorite]'),tile=e.target.closest('[data-shape]');
      if(cat){category=cat.dataset.category;render();}
      if(fav){const id=fav.dataset.favorite;preferences.favorites=preferences.favorites.includes(id)?preferences.favorites.filter(v=>v!==id):[...preferences.favorites,id];persist();render();panel.querySelector(`[data-favorite="${id}"]`)?.focus();}
      if(tile){choose(tile.dataset.shape);close();}
    });
    panel.addEventListener('dragstart',e=>{
      const tile=e.target.closest('[data-shape]');if(!tile)return;
      e.dataTransfer.setData('application/x-message-flow-shape',tile.dataset.shape);e.dataTransfer.effectAllowed='copy';
      choose(tile.dataset.shape);
      // Keep the native drag source mounted until dragstart has completed.
      requestAnimationFrame(()=>close());
    });
    panel.addEventListener('dragend',()=>cancel());
    render();
    return {open,close,isOpen:()=>!panel.hidden,used(id){preferences.recent=[id,...preferences.recent.filter(v=>v!==id)].slice(0,8);persist();}};
  }
  root.MessageFlowLibrary=Object.freeze({create});
})(globalThis);
