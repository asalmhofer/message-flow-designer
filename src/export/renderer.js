/* Detached SVG composition shared by PNG, SVG, GIF, video, and the preview. */
(function(root){
  'use strict';
  const ns='http://www.w3.org/2000/svg';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const text=(value,x,y,size=16,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="#27354a" ${extra}>${esc(value)}</text>`;
  const rect=(x,y,w,h,fill,extra='')=>`<rect x="${x}" y="${y}" width="${Math.max(0,w)}" height="${Math.max(0,h)}" fill="${fill}" ${extra}/>`;
  const dash=(style,width)=>style==='dashed'?`${width*4} ${width*3}`:style==='dotted'?`${width} ${width*2}`:'none';
  function bounds(boxes){
    if(!boxes.length)return {x:0,y:0,width:640,height:360};
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
    return {x,y,width:Math.max(1,Math.max(...boxes.map(b=>b.x+b.width))-x),height:Math.max(1,Math.max(...boxes.map(b=>b.y+b.height))-y)};
  }
  function create(snapshot,options){
    const animated=['gif','video'].includes(options.format),showStory=options.composition==='presentation';
    const timeline=root.MessageFlowExportTimeline.build(snapshot.flows,options);
    const lookup=new Map(snapshot.components.map(c=>[c.id,c]));
    const measures=new Map(snapshot.flows.map(f=>{const path=document.createElementNS(ns,'path');path.setAttribute('d',f.d);return [f.id,path];}));
    const measure=document.createElement('canvas').getContext('2d');
    const images=new Map();
    function wrap(value,width,size,maxLines=3){
      measure.font=`600 ${size}px "Segoe UI", Arial, sans-serif`;
      const lines=[];let line='';
      for(const char of String(value || '')){
        if(char==='\n' || measure.measureText(line+char).width>width){lines.push(line);line='';}
        if(char!=='\n')line+=char;
      }
      if(line)lines.push(line);
      const shown=lines.slice(0,maxLines);
      if(lines.length>maxLines)shown[maxLines-1]=shown[maxLines-1].slice(0,-1)+'…';
      return shown;
    }
    function multiline(value,x,y,width,size,maxLines,extra=''){
      return wrap(value,width,size,maxLines).map((line,i)=>text(line,x,y+i*(size+5),size,extra)).join('');
    }
    const staticFlows=snapshot.flows.filter(f=>!f.hiddenInDrawingMode);
    const labelItems=staticFlows.map(f=>{
      const lines=wrap(f.messageText||'Message',200,15,2);
      return {id:f.id,anchor:{x:f.labelX,y:f.labelY},width:Math.max(90,...lines.map(line=>measure.measureText(line).width+48)),height:lines.length*19+16,offset:f.labelOffset,lines};
    });
    const labels=root.MessageFlowLabels.layoutLabels(labelItems,snapshot.components.filter(c=>c.shape!=='package'));
    const sceneBounds=bounds([...snapshot.components.map(c=>c.bounds),...(animated?snapshot.flows:staticFlows).map(f=>f.bounds),...(!animated?[...labels.values()]:[])]);
    const area={x:32,y:showStory?150:32,width:showStory && (options.details||options.images)?860:1216,height:showStory?514:656};
    // Include room for token labels and processing bubbles in fitted animation frames.
    const padding=animated?95:28;
    const world=options.framing==='viewport'?snapshot.viewport:{x:sceneBounds.x-padding,y:sceneBounds.y-padding,width:sceneBounds.width+padding*2,height:sceneBounds.height+padding*2};
    const zoom=Math.min(area.width/world.width,area.height/world.height);
    const tx=area.x+(area.width-world.width*zoom)/2-world.x*zoom,ty=area.y+(area.height-world.height*zoom)/2-world.y*zoom;
    function route(f){return `${lookup.get(f.sourceComponentId)?.name||'Component'} → ${lookup.get(f.targetComponentId)?.name||'Component'}`;}
    function flowPath(f,active){
      const width=f.style?.thickness??1.7,color=f.style?.color||'#475569';
      const opacity=f.style?.lineStyle==='none'?0:f.style?.opacity??1;
      const head=`export-arrow-${snapshot.flows.indexOf(f)}`;
      return `<defs><marker id="${head}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${esc(color)}"/></marker></defs><path id="path-${esc(f.id)}" d="${esc(f.d)}" fill="none" stroke="${esc(color)}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-dasharray="${dash(f.style?.lineStyle,width)}" marker-end="url(#${head})" opacity="${animated && !active.has(f.id) ? .24:1}"/>`;
    }
    function annotation(c){
      const target=lookup.get(c.annotatedElementId);if(c.shape!=='umlComment'||!target)return '';
      const a=root.MessageFlowElements.boundary(c,{x:target.x+target.width/2,y:target.y+target.height/2}).point;
      const b=root.MessageFlowElements.boundary(target,{x:c.x+c.width/2,y:c.y+c.height/2}).point;
      return `<path class="annotationLink" d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="5 4" fill="none"/>`;
    }
    const componentMarkup=snapshot.components.map(c=>c.markup).join('');
    const annotations=snapshot.components.map(annotation).join('');
    function labelMarkup(){return labelItems.map(item=>{
      const box=labels.get(item.id),f=staticFlows.find(f=>f.id===item.id);
      return `<g class="exportFlowLabel">${rect(box.x,box.y,box.width,box.height,'#fff','rx="7" stroke="#e3e8ef" stroke-width=".8"')}${text(f.sequenceNumber,box.x+14,box.y+box.height/2+4,11,'text-anchor="middle"')}${item.lines.map((line,i)=>`<text x="${box.x+32}" y="${box.y+box.height/2-(item.lines.length-1)*9.5+i*19+5}" font-size="15" fill="${esc(f.style?.textColor||'#1e293b')}" fill-opacity="${f.style?.textOpacity??1}">${esc(line)}</text>`).join('')}</g>`;
    }).join('');}
    function feedback(frame){
      const active=frame.flows;let result='';
      const seen=new Set();
      for(const f of active){
        const source=lookup.get(f.sourceComponentId),target=lookup.get(f.targetComponentId);
        const traveling=frame.phase==='transfer',arrived=frame.phase==='arrived';
        const progress=root.MessageFlowMotion.travelProgress(frame.progress);
        if(frame.phase!=='completed')result+=`<path class="exportActivePath" d="${esc(f.d)}" fill="none" stroke="#d98b16" stroke-width="1.8" opacity="${traveling?.3:.8}" marker-end="url(#export-active)"/>`;
        if(traveling && !options.reducedMotion){const tail=Math.min(.22,progress);result+=`<path class="exportTrace" d="${esc(f.d)}" pathLength="1" fill="none" stroke="#c78113" stroke-width="3" stroke-linecap="round" stroke-dasharray="${tail} ${1-tail}" stroke-dashoffset="${-(progress-tail)}"/>`;}
        if(traveling||arrived){
          const point=measures.get(f.id).getPointAtLength(f.length*(arrived?1:options.reducedMotion?0:progress));
          result+=`<circle class="exportToken" cx="${point.x}" cy="${point.y}" r="6" fill="#d98b16" stroke="#fff" stroke-width="2"/>`;
          if(options.tokenNames){
            const lines=wrap(f.messageText||'Message',190,12,2),w=Math.max(90,...lines.map(line=>measure.measureText(line).width+24));
            result+=rect(point.x-w/2,point.y+16,w,12+lines.length*17,'#fff','rx="6" stroke="#e5c68e"');
            result+=lines.map((line,i)=>text(line,point.x,point.y+32+i*17,12,'text-anchor="middle"')).join('');
          }
        }
        if(!options.reducedMotion && ((traveling&&frame.progress<.16)||arrived)){
          const c=arrived?target:source,t=arrived?frame.progress*.65/.43:frame.progress/.16;
          if(t<1 && !seen.has(c.id)){const p=arrived?3+t*9:4;result+=rect(c.x-p,c.y-p,c.width+2*p,c.height+2*p,'none',`class="exportPulse" rx="7" stroke="#d98b16" stroke-width="1.5" opacity="${(1-t)*.75}"`);seen.add(c.id);}
        }
        if(frame.phase==='processing' && !seen.has(target.id)){
          const w=Math.max(4,Math.min(48,target.width-12)),x=target.x+(target.width-w)/2,y=target.y+target.height+5;
          result+=rect(x,y,w,3,'#f2e5cb')+rect(x,y,w*(options.reducedMotion?.5:Math.max(.06,frame.progress)),3,'#c98718');seen.add(target.id);
        }
      }
      if(frame.phase==='processing' && options.processing){
        const items=active.map(f=>{
          const target=lookup.get(f.targetComponentId),width=Math.max(180,Math.min(280,target.width+60));
          const heading=active.filter(other=>other.targetComponentId===target.id).length>1?wrap(f.messageText||'Message',width-24,11,1)[0]:'';
          const lines=wrap(f.actionText||'Processing…',width-24,12,4);
          return {id:f.id,target,width,height:24+lines.length*17+(heading?18:0),heading,lines};
        });
        const boxes=root.MessageFlowLabels.layoutCallouts(items,snapshot.components,world);
        for(const item of items){
          const box=boxes.get(item.id),c=item.target,clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
          const end={x:clamp(c.x+c.width/2,box.x,box.x+box.width),y:clamp(c.y+c.height/2,box.y,box.y+box.height)};
          const start={x:clamp(end.x,c.x,c.x+c.width),y:clamp(end.y,c.y,c.y+c.height)};
          result+=`<path d="M${start.x} ${start.y}L${end.x} ${end.y}" stroke="#e4d5b4" fill="none"/>`;
          result+=rect(box.x,box.y,box.width,box.height,'#fffdf7','rx="10" stroke="#e4d5b4"');
          if(item.heading)result+=text(item.heading,box.x+box.width/2,box.y+22,11,'text-anchor="middle" font-weight="600"');
          result+=item.lines.map((line,i)=>text(line,box.x+box.width/2,box.y+24+i*17+(item.heading?18:0),12,'text-anchor="middle"')).join('');
        }
      }
      return result;
    }
    function story(frame){
      if(!showStory)return '';
      const fs=frame.flows,name=[...new Set(fs.map(f=>f.messageText))].join(' | ')||snapshot.name;
      let markup=multiline(snapshot.name,32,30,1000,12,1,'font-weight="600" fill-opacity=".65"')+multiline(name,32,76,area.width,28,2,'font-weight="650"');
      markup+=text(fs.length===1?route(fs[0]):fs.map(f=>f.messageText).join(' · ').slice(0,110),32,130,13,'fill-opacity=".72"');
      const status=({transfer:'Sending',arrived:'Received',processing:'Processing',completed:'Finished',ready:'Diagram'})[frame.phase];
      markup+=rect(1078,22,170,30,'#fff5df','rx="6" stroke="#edd2a0"')+text(status,1163,42,12,'text-anchor="middle"');
      if(options.details||options.images){
        markup+=rect(916,150,332,514,'#edf1f6','rx="12"');
        const h=Math.min(480,Math.floor(480/Math.max(1,fs.length)));
        fs.forEach((f,i)=>{
          const y=178+i*h;
          markup+=`<defs><clipPath id="story-row-${i}">${rect(924,y-16,316,h-8,'#fff')}</clipPath></defs><g clip-path="url(#story-row-${i})">`;
          markup+=multiline(f.messageText,936,y,292,14,2,'font-weight="600"');
          if(options.details)markup+=multiline([f.actionText,f.notes].filter(Boolean).join('\n')||'No processing details',936,y+44,292,13,Math.max(1,Math.min(4,Math.floor((h-100)/18))));
          const image=images.get(f.id),imageY=y+(options.details?Math.min(126,h*.5):44),imageHeight=Math.max(0,Math.min(180,h-(imageY-y)-20));
          if(options.images&&image&&imageHeight>15)markup+=`<image x="936" y="${imageY}" width="292" height="${imageHeight}" preserveAspectRatio="xMidYMid meet" href="${esc(image)}"/>`;
          markup+='</g>';
        });
      }
      if(animated){
        const n=Math.max(1,timeline.entries.length),gap=Math.min(6,320/n),w=Math.min(90,(1216-gap*(n-1))/n);
        markup+=timeline.entries.map((entry,i)=>rect(32+i*(w+gap),691,w,3,entry.end<=frame.start+frame.progress*frame.duration?'#a4b39f':entry.index===frame.index?'#d98b16':'#dce3ec','rx="1.5"')).join('');
      }
      return markup;
    }
    function svgAt(time=0){
      let frame=root.MessageFlowExportTimeline.at(timeline,time);
      if(!animated){const chosen=root.MessageFlowExportTimeline.groups(snapshot.flows)[snapshot.selectedIndex]||[];frame={phase:'ready',flows:chosen,progress:0,completed:[]};}
      const active=new Set(frame.flows.map(f=>f.id));
      const visible=animated?snapshot.flows.filter(f=>options.inactive||active.has(f.id)):staticFlows;
      return `<svg xmlns="${ns}" width="${options.width}" height="${options.height}" viewBox="0 0 1280 720" font-family="Segoe UI, Arial, sans-serif"><defs><clipPath id="export-clip">${rect(area.x,area.y,area.width,area.height,'#fff')}</clipPath><marker id="export-active" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#d98b16"/></marker></defs>${rect(0,0,1280,720,'#fff')}<g clip-path="url(#export-clip)"><g transform="translate(${tx} ${ty}) scale(${zoom})">${visible.map(f=>flowPath(f,active)).join('')}${annotations}${componentMarkup}${animated?feedback(frame):labelMarkup()}</g></g>${story(frame)}</svg>`;
    }
    async function prepare(signal){
      if(!showStory||!options.images)return;
      const visible=animated?timeline.entries.flatMap(entry=>entry.flows):root.MessageFlowExportTimeline.groups(snapshot.flows)[snapshot.selectedIndex]||[];
      for(const f of visible){
        signal?.throwIfAborted();
        if(!f.processingImageDataUrl||images.has(f.id))continue;
        const image=await loadImage(f.processingImageDataUrl,signal);
        const canvas=document.createElement('canvas'),scale=Math.min(1,1000/image.naturalWidth);
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        images.set(f.id,canvas.toDataURL('image/png'));
      }
    }
    async function draw(canvas,time,signal){
      signal?.throwIfAborted();
      const url=URL.createObjectURL(new Blob([svgAt(time)],{type:'image/svg+xml'}));
      try{const image=await loadImage(url,signal);signal?.throwIfAborted();canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);}finally{URL.revokeObjectURL(url);}
    }
    return {svgAt,draw,prepare,timeline};
  }
  function loadImage(url,signal){
    return new Promise((resolve,reject)=>{
      signal?.throwIfAborted();const image=new Image();
      const cleanup=()=>{signal?.removeEventListener('abort',abort);image.onload=null;image.onerror=null;};
      const abort=()=>{cleanup();image.src='';reject(new DOMException('Export cancelled','AbortError'));};
      image.onload=()=>{cleanup();resolve(image);};image.onerror=()=>{cleanup();reject(new Error('A processing image could not be rendered. Turn off images or replace the image.'));};
      signal?.addEventListener('abort',abort,{once:true});image.src=url;
    });
  }
  root.MessageFlowExportRenderer=Object.freeze({create});
})(globalThis);
