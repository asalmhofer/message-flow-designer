/* Pointer sorting keeps document order untouched until a valid drop. */
(function(root){
  'use strict';
  function create({list,commit,cancelled}){
    let drag=null,frame=null;
    const rows=()=>[...list.querySelectorAll('.flowItem')];
    const scroller=list.closest('.flowPanelBody');
    function start(){
      const box=drag.card.getBoundingClientRect();
      drag.started=true;drag.original=rows().map(c=>c.dataset.flowId);
      drag.ghost=drag.card.cloneNode(true);drag.ghost.classList.add('flowFloatingCard');drag.ghost.classList.remove('selected');drag.ghost.inert=true;drag.ghost.setAttribute('aria-hidden','true');
      drag.ghost.removeAttribute('data-flow-id');drag.ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
      drag.ghost.style.width=box.width+'px';document.body.appendChild(drag.ghost);
      // Keep a real, full-height slot; unwrap simultaneous groups for a flat sort surface.
      rows().forEach(c=>list.appendChild(c));list.querySelectorAll('.parallelGroup').forEach(g=>g.remove());
      drag.card.classList.add('flowDropSlot');list.classList.add('flowSorting');document.body.classList.add('sortingFlow');
      list.setPointerCapture(drag.pointerId);update();frame=requestAnimationFrame(scroll);
    }
    function update(){
      if(!drag?.started)return;
      drag.ghost.style.left=(drag.x-drag.dx)+'px';drag.ghost.style.top=(drag.y-drag.dy)+'px';
      const remaining=rows().filter(c=>c!==drag.card),top=list.getBoundingClientRect().top;
      const next=remaining.find(c=>drag.y<top+c.offsetTop+c.offsetHeight/2) || null;
      if(drag.card.nextElementSibling===next)return;
      const before=new Map(remaining.map(c=>[c,c.getBoundingClientRect().top]));
      list.insertBefore(drag.card,next);
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)remaining.forEach(c=>{c.getAnimations().forEach(a=>a.cancel());const dy=before.get(c)-c.getBoundingClientRect().top;if(dy)c.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:160,easing:'ease-out'});});
      rows().forEach((c,i)=>{c.querySelector('.seqBadge').textContent=i+1;c.querySelector('.flowTiming').textContent=(i===0?'First message':c.dataset.timing==='withPrevious'?'Together with previous':'After previous')+(c.classList.contains('hiddenConnector')?' · Connection hidden':'');if(c===drag.card)drag.ghost.querySelector('.seqBadge').textContent=i+1;});
    }
    function scroll(){
      if(!drag?.started)return;
      const b=scroller.getBoundingClientRect(),edge=48;
      if(drag.x>=b.left&&drag.x<=b.right){const speed=drag.y<b.top+edge?-Math.min(14,(b.top+edge-drag.y)/3):drag.y>b.bottom-edge?Math.min(14,(drag.y-b.bottom+edge)/3):0;if(speed){scroller.scrollTop+=speed;update();}}
      frame=requestAnimationFrame(scroll);
    }
    function finish(cancel=false){
      if(!drag)return;const old=drag;drag=null;cancelAnimationFrame(frame);frame=null;
      if(!old.started)return;
      const b=scroller.getBoundingClientRect();cancel ||= old.x<b.left||old.x>b.right||old.y<b.top||old.y>b.bottom;
      const order=rows().map(c=>c.dataset.flowId);old.ghost.remove();old.card.classList.remove('flowDropSlot');list.classList.remove('flowSorting');document.body.classList.remove('sortingFlow');
      if(list.hasPointerCapture(old.pointerId))list.releasePointerCapture(old.pointerId);
      if(cancel||order.join()===old.original.join())cancelled(old.card.dataset.flowId,cancel);else commit(order,old.card.dataset.flowId);
    }
    list.addEventListener('pointerdown',e=>{
      const handle=e.target.closest('.flowDragHandle');if(!handle||e.button!==0||!e.isPrimary)return;
      e.preventDefault();handle.focus({preventScroll:true});const card=handle.closest('.flowItem'),b=card.getBoundingClientRect();
      drag={card,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,dx:e.clientX-b.left,dy:e.clientY-b.top,started:false};
    });
    document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;if(!drag.started&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>6)start();if(drag.started){e.preventDefault();update();}},{passive:false});
    document.addEventListener('pointerup',e=>{if(drag&&e.pointerId===drag.pointerId){drag.x=e.clientX;drag.y=e.clientY;finish();}});
    document.addEventListener('pointercancel',()=>finish(true));
    list.addEventListener('lostpointercapture',()=>finish(true));
    document.addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);}},true);
    window.addEventListener('blur',()=>finish(true));
    return {cancel:()=>finish(true),active:()=>!!drag?.started};
  }
  root.MessageFlowReorder=Object.freeze({create});
})(globalThis);
