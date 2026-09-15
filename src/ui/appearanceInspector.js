/* Shared appearance controls. A picker previews a draft and commits one undo entry. */
(function(root){
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults = {fillColor:'#ffffff',borderColor:'#475569',textColor:'#202b3c',borderWidth:1.5,borderStyle:'solid',fillOpacity:1,borderOpacity:1,textOpacity:1,fontSize:14,fontWeight:600,textAlign:'center',color:'#64748b',thickness:1.7,lineStyle:'solid',opacity:1};
  const colour = value => /^#[\da-f]{6}$/i.test(value) ? value : '#ffffff';
  const palette = ['#ffffff','#f1f5f9','#dbeafe','#dcfce7','#f3e8ff','#ffedd5','#fee2e2','#475569','#2563eb','#0d9488','#7c3aed','#d97706','#dc2626','#202b3c'];
  function create({panel,getTargets,preview,commit,reset}){
    let picker = null, session = null, recent = [];
    try{const stored=JSON.parse(localStorage.getItem('message-flow-recent-colours') || '[]');if(Array.isArray(stored))recent=stored.filter(c=>typeof c==='string'&&/^#[\da-f]{6}$/i.test(c)).slice(0,7);}catch{ /* Appearance preferences are optional. */ }
    const targets = () => getTargets().map(t => t.model);
    const value = (key) => {
      const values = getTargets().map(t => t.model[key] ?? t.defaults?.[key] ?? defaults[key]);
      return values.every(v => v === values[0]) ? values[0] : null;
    };
    const select = (label,key,options) => {
      const current=value(key),choices=[...options];
      if(current!==null&&!choices.some(([v])=>v===current))choices.unshift([current,`${escape(current)}${typeof current==='number'?' px':''}`]);
      return `<label class="inspectorField">${label}<select aria-label="${label}" data-appearance="${key}">${current === null ? '<option value="">Mixed</option>' : ''}${choices.map(([v,l])=>`<option value="${escape(v)}" ${String(current)===String(v)?'selected':''}>${l}</option>`).join('')}</select></label>`;
    };
    function colorRow(label,key,opacityKey){
      const v=value(key),alpha=value(opacityKey);
      return `<div class="inspectorColorRow"><span>${label}</span><button type="button" class="colorTrigger" data-color="${key}" data-opacity="${opacityKey}" aria-label="${label} colour" aria-haspopup="dialog"><span class="colorChip" style="--chip:${escape(v || 'transparent')}"></span><span class="colorValue">${v === null ? 'Mixed' : v === 'transparent' ? 'None' : escape(v.toUpperCase())}</span><span class="colorPercent">${alpha === null ? 'Mixed' : Math.round(alpha*100)+'%'}</span></button></div>`;
    }
    function html(flow=false){
      const border=flow?'lineStyle':'borderStyle', width=flow?'thickness':'borderWidth';
      return `<section class="inspectorSection" aria-label="Appearance"><div class="inspectorHeading"><h3>Appearance</h3><button type="button" data-reset-appearance title="Reset selected appearance to diagram theme">Reset to theme</button></div>
        ${!flow ? colorRow('Fill','fillColor','fillOpacity') : ''}${colorRow(flow?'Line':'Border',flow?'color':'borderColor',flow?'opacity':'borderOpacity')}${colorRow('Text','textColor','textOpacity')}
        <div class="inspectorField"><span>${flow?'Line':'Border'} style</span><div class="borderOptions" role="group" aria-label="${flow?'Line':'Border'} style">${['solid','dashed','dotted','none'].map(s=>`<button type="button" data-appearance="${border}" data-value="${s}" aria-label="${s[0].toUpperCase()+s.slice(1)} ${flow?'line':'border'}" aria-pressed="${value(border)===s}"><span class="borderSample ${s}"></span><span>${s[0].toUpperCase()+s.slice(1)}</span></button>`).join('')}</div></div>
        ${select(flow?'Line width':'Border width',width,[[.5,'0.5 px'],[1,'1 px'],[1.5,'1.5 px'],[1.7,'1.7 px'],[2,'2 px'],[3,'3 px'],[4,'4 px'],[6,'6 px']])}</section>
        ${flow?'':`<section class="inspectorSection" aria-label="Text"><h3>Text</h3><div class="inspectorColumns">${select('Text size','fontSize',[[10,'10 px'],[12,'12 px'],[14,'14 px'],[16,'16 px'],[18,'18 px'],[20,'20 px'],[24,'24 px'],[32,'32 px']])}${select('Weight','fontWeight',[[400,'Regular'],[500,'Medium'],[600,'Semibold'],[700,'Bold']])}</div>${select('Alignment','textAlign',[['left','Left'],['center','Centre'],['right','Right']])}</section>`}`;
    }
    function refresh(){
      panel.querySelectorAll('[data-color]').forEach(b=>{
        const v=value(b.dataset.color),alpha=value(b.dataset.opacity);
        b.querySelector('.colorChip').style.setProperty('--chip',v || 'transparent');
        b.querySelector('.colorValue').textContent=v===null?'Mixed':v==='transparent'?'None':v.toUpperCase();
        b.querySelector('.colorPercent').textContent=alpha===null?'Mixed':Math.round(alpha*100)+'%';
      });
      panel.querySelectorAll('button[data-appearance]').forEach(b=>b.setAttribute('aria-pressed',String(value(b.dataset.appearance)===b.dataset.value)));
    }
    function close(cancel=false){
      if(!session)return;
      const previous=session;session=null;picker.remove();picker=null;
      if(cancel){previous.items.forEach(({model,original})=>{for(const key of [previous.key,previous.opacityKey]){if(original[key]===undefined)delete model[key];else model[key]=original[key];}});preview();}
      else if(previous.changed){const c=previous.items[0].model[previous.key];if(c&&c!=='transparent')recent=[c,...recent.filter(x=>x!==c)].slice(0,7);try{localStorage.setItem('message-flow-recent-colours',JSON.stringify(recent));}catch{ /* Optional preference. */ }commit();}
      refresh();if(previous.trigger.isConnected)previous.trigger.focus({preventScroll:true});
    }
    function show(trigger){
      close();const key=trigger.dataset.color,opacityKey=trigger.dataset.opacity;
      session={key,opacityKey,trigger,changed:false,items:targets().map(model=>({model,original:{[key]:model[key],[opacityKey]:model[opacityKey]}}))};
      const current=value(key),alpha=value(opacityKey) ?? 1;
      picker=document.createElement('div');picker.className='inspectorPicker';picker.setAttribute('role','dialog');picker.setAttribute('aria-label',trigger.getAttribute('aria-label'));
      picker.innerHTML=`<div class="pickerHeading"><strong>${escape(trigger.getAttribute('aria-label'))}</strong><button type="button" data-picker-close aria-label="Apply colour and close">${root.MessageFlowIcons.svg('check')}</button></div><div class="pickerPalette" aria-label="Palette">${palette.map(c=>`<button type="button" data-swatch="${c}" style="--chip:${c}" aria-label="Use ${c}"></button>`).join('')}</div>${recent.length?`<span class="pickerLabel">Recent</span><div class="pickerPalette">${recent.map(c=>`<button type="button" data-swatch="${escape(c)}" style="--chip:${escape(c)}" aria-label="Recent ${escape(c)}"></button>`).join('')}</div>`:''}<div class="pickerCustom"><input type="color" aria-label="Custom colour" value="${colour(current)}"><label>HEX<input type="text" data-hex aria-label="HEX colour" spellcheck="false" value="${colour(current).toUpperCase()}" maxlength="7"></label></div><label class="pickerOpacity">Opacity <output>${Math.round(alpha*100)}%</output><input type="range" min="0" max="100" value="${Math.round(alpha*100)}" aria-label="Colour opacity"></label>${key==='fillColor'?'<button type="button" data-transparent class="transparentChoice">No fill</button>':''}<div class="pickerFooter"><button type="button" data-picker-cancel>Cancel</button><button type="button" data-picker-close class="primary">Done</button></div>`;
      document.body.appendChild(picker);
      const box=trigger.getBoundingClientRect();picker.style.left=Math.max(8,Math.min(innerWidth-picker.offsetWidth-8,box.right-picker.offsetWidth))+'px';picker.style.top=Math.max(8,Math.min(innerHeight-picker.offsetHeight-8,box.bottom+6))+'px';
      function apply(c,opacity){
        session.items.forEach(({model})=>{if(c!==undefined)model[key]=c;if(opacity!==undefined)model[opacityKey]=opacity;});session.changed=true;
        if(c&&c!=='transparent'){picker.querySelector('[type=color]').value=c;picker.querySelector('[data-hex]').value=c.toUpperCase();}
        preview();refresh();
      }
      picker.addEventListener('click',e=>{if(e.target.closest('[data-picker-close]'))close();else if(e.target.closest('[data-picker-cancel]'))close(true);else if(e.target.closest('[data-transparent]'))apply('transparent');else if(e.target.closest('[data-swatch]'))apply(e.target.closest('[data-swatch]').dataset.swatch);});
      picker.addEventListener('input',e=>{if(e.target.type==='color')apply(e.target.value);if(e.target.type==='range'){apply(undefined,Number(e.target.value)/100);picker.querySelector('output').textContent=e.target.value+'%';}});
      picker.addEventListener('change',e=>{if(e.target.matches('[data-hex]')){let c=e.target.value.trim();if(!c.startsWith('#'))c='#'+c;if(/^#[\da-f]{3}$/i.test(c))c='#'+[...c.slice(1)].map(x=>x+x).join('');if(/^#[\da-f]{6}$/i.test(c)){e.target.setCustomValidity('');apply(c);}else{e.target.setCustomValidity('Enter a HEX colour such as #2563EB.');e.target.reportValidity();}}});
      picker.querySelector('[data-hex]').focus();
    }
    document.addEventListener('pointerdown',e=>{if(session&&!picker.contains(e.target)&&!session.trigger.contains(e.target))close();},true);
    document.addEventListener('keydown',e=>{if(!session)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close(true);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z')close();else if(e.key==='Tab'){const controls=[...picker.querySelectorAll('button,input')],index=controls.indexOf(document.activeElement);if(e.shiftKey&&index===0){e.preventDefault();controls.at(-1).focus();}else if(!e.shiftKey&&index===controls.length-1){e.preventDefault();controls[0].focus();}}},true);
    panel.addEventListener('click',e=>{
      const trigger=e.target.closest('[data-color]'),button=e.target.closest('button[data-appearance]');
      if(trigger){e.stopImmediatePropagation();show(trigger);}
      if(button){e.stopImmediatePropagation();targets().forEach(t=>t[button.dataset.appearance]=button.dataset.value);preview();commit();refresh();}
      if(e.target.closest('[data-reset-appearance]')){e.stopImmediatePropagation();reset();}
    });
    panel.addEventListener('change',e=>{const key=e.target.dataset.appearance;if(!key||!e.target.value)return;e.stopImmediatePropagation();const v=e.target.value;targets().forEach(t=>t[key]=['borderWidth','thickness','fontSize','fontWeight'].includes(key)?Number(v):v);preview();commit();});
    panel.addEventListener('input',e=>{if(e.target.dataset.appearance)e.stopImmediatePropagation();});
    return {html,close,refresh};
  }
  root.MessageFlowAppearance=Object.freeze({create});
})(globalThis);
