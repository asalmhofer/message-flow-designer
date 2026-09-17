(function(root){
  'use strict';
  function create({entries,preview,icon,onPreview,onChoose,onCancel}){
    const backdrop=document.createElement('div');backdrop.className='connectedPickerBackdrop';backdrop.hidden=true;
    const panel=document.createElement('section');panel.className='connectedPicker';panel.hidden=true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Add connected component');
    panel.innerHTML=`<header><div><span class="connectedEyebrow">EXTEND YOUR FLOW</span><h2>Add connected component</h2></div><button type="button" data-cancel aria-label="Cancel connected component">${icon('close')}</button></header>
      <div class="connectedDirection"><span></span><button type="button" aria-label="Reverse connection direction" aria-pressed="false" title="Reverse connection direction">${icon('repeat')}</button></div>
      <label class="connectedSearch">${icon('search')}<input type="search" placeholder="Search elements…" aria-label="Search connected elements"></label>
      <div class="connectedCategories" role="group" aria-label="Connected element categories">${['Common','UML','Favourites','Recent','All'].map(name=>`<button type="button" data-category="${name}" aria-pressed="false">${name}</button>`).join('')}</div>
      <div class="connectedChoices"></div><footer>Enter to add selected · Esc to cancel</footer>`;
    document.body.append(backdrop,panel);
    const input=panel.querySelector('input'),choices=panel.querySelector('.connectedChoices'),direction=panel.querySelector('.connectedDirection');
    let current=null,category='Common',query='',preferences={favorites:[],recent:[]};
    const common=['umlComponent','roundedRectangle','cylinder','queue','actor','umlNode','umlArtifact'];
    function close(){panel.hidden=true;backdrop.hidden=true;current=null;}
    function cancel(){if(!current)return;close();onCancel();}
    function choose(shape){if(!current)return;const reverse=current.reverse;close();onChoose(shape,reverse);}
    function update(shape){
      if(!current)return;current.shape=shape;
      choices.querySelectorAll('[data-shape]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.shape===shape)));
      direction.querySelector('span').textContent=current.reverse?`New component → ${current.sourceName}`:`${current.sourceName} → New component`;
      direction.querySelector('span').title=direction.querySelector('span').textContent;
      direction.querySelector('button').setAttribute('aria-pressed',String(current.reverse));
      onPreview(shape,current.reverse);
    }
    function render(){
      const ids=category==='Recent'?preferences.recent:category==='Favourites'?preferences.favorites:null;
      let items=ids?ids.map(id=>entries.find(entry=>entry.id===id)).filter(Boolean):entries;
      if(query)items=entries.filter(e=>`${e.name} ${e.description}`.toLowerCase().includes(query.toLowerCase()));
      else if(category==='Common')items=items.filter(e=>common.includes(e.id)||e.id===current.initialShape);
      else if(category==='UML')items=items.filter(e=>e.id.startsWith('uml'));
      panel.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
      choices.innerHTML=items.length?items.map(e=>`<button type="button" data-shape="${e.id}" aria-label="Add connected ${e.name.toLowerCase()}" aria-pressed="${e.id===current.shape}"><span class="connectedGlyph">${preview(e)}</span><span>${e.name}</span></button>`).join(''):'<p>No matching elements. Try another search or category.</p>';
      if(items.length&&!items.some(e=>e.id===current.shape))update(items[0].id);
    }
    panel.querySelector('[data-cancel]').addEventListener('click',cancel);
    direction.querySelector('button').addEventListener('click',()=>{current.reverse=!current.reverse;update(current.shape);});
    input.addEventListener('input',()=>{query=input.value;render();});
    panel.addEventListener('click',event=>{
      const tab=event.target.closest('[data-category]');if(tab){category=tab.dataset.category;render();return;}
      const choice=event.target.closest('[data-shape]');if(choice)choose(choice.dataset.shape);
    });
    for(const type of ['pointerover','focusin'])panel.addEventListener(type,event=>{const choice=event.target.closest('[data-shape]');if(choice && current?.shape!==choice.dataset.shape)update(choice.dataset.shape);});
    panel.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Enter'&&(event.target===input||event.target.closest('[data-shape]'))){
        event.preventDefault();event.stopPropagation();
        const choice=choices.querySelector('[data-shape][aria-pressed="true"]');
        if(!event.repeat&&choice)choose(choice.dataset.shape);
        return;
      }
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();return;}
      if(event.key==='Tab'){
        const buttons=[...panel.querySelectorAll('button,input')].filter(el=>!el.disabled),index=buttons.indexOf(document.activeElement);
        if(event.shiftKey&&index===0){event.preventDefault();buttons.at(-1).focus();}
        else if(!event.shiftKey&&index===buttons.length-1){event.preventDefault();buttons[0].focus();}
      }
    });
    backdrop.addEventListener('click',cancel);
    window.addEventListener('resize',()=>{if(current)position();});
    function position(){const {x,y,width:componentWidth=0}=current.point,width=panel.offsetWidth,height=panel.offsetHeight,right=x+componentWidth+24,left=right+width<=innerWidth-12?right:x-width-24;panel.style.left=`${Math.max(12,Math.min(left,innerWidth-width-12))}px`;panel.style.top=`${Math.max(12,Math.min(y-70,innerHeight-height-12))}px`;}
    return {close,isOpen:()=>!panel.hidden,open({sourceName,point,shape}){
      try{const saved=JSON.parse(localStorage.getItem('message-flow-element-library-v1'));for(const field of ['favorites','recent'])preferences[field]=Array.isArray(saved?.[field])?saved[field]:[];}catch{preferences={favorites:[],recent:[]};}
      current={sourceName,point,shape,initialShape:shape,reverse:false};category='Common';query='';input.value='';backdrop.hidden=false;panel.hidden=false;render();update(shape);position();input.focus();
    }};
  }
  root.MessageFlowConnectedElements=Object.freeze({create});
})(globalThis);
