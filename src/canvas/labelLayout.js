/* Deterministic label placement; manual offsets stay attached to their paths. */
(function(root){
  'use strict';
  function overlap(a,b){
    return Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
      * Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  }
  function layoutLabels(items, obstacles=[]){
    const occupied = obstacles.map(b => ({x:b.x-8,y:b.y-8,width:b.width+16,height:b.height+16}));
    const result = new Map();
    const box = (item,dx,dy) => ({x:item.anchor.x + dx - item.width/2, y:item.anchor.y + dy - item.height/2, width:item.width,height:item.height});
    // Reserve explicit placements first so automatic labels yield to them.
    for(const item of items.filter(item => item.offset)){
      const placed = box(item,item.offset.x,item.offset.y);
      result.set(item.id,placed); occupied.push(placed);
    }
    for(const item of items.filter(item => !item.offset)){
      let best, score = Infinity;
      for(const dy of [0,-32,32,-64,64,-96,96,-128,128]){
        for(const dx of [0,-32,32,-80,80,-144,144]){
          const candidate = box(item,dx,dy);
          const cost = occupied.reduce((sum,other) => sum+overlap(candidate,other),0)*100 + dx*dx+dy*dy;
          if(cost < score){ best = candidate; score = cost; }
        }
      }
      result.set(item.id,best);
      occupied.push({...best,x:best.x-5,y:best.y-5,width:best.width+10,height:best.height+10});
    }
    return result;
  }
  function layoutCallouts(items, obstacles=[], viewport){
    const pad = box => ({x:box.x-8,y:box.y-8,width:box.width+16,height:box.height+16});
    const occupied = obstacles.map(pad);
    const result = new Map();
    for(const item of items){
      const {target,width,height} = item;
      const cx = target.x+target.width/2, cy = target.y+target.height/2;
      const candidates = [];
      for(let ring=0;ring<5;ring++){
        const gap = 16+ring*48;
        for(const shift of [0,-width-16,width+16]){
          candidates.push({x:cx-width/2+shift,y:target.y-height-gap,width,height});
          candidates.push({x:cx-width/2+shift,y:target.y+target.height+gap,width,height});
        }
        candidates.push({x:target.x+target.width+gap,y:cy-height/2,width,height});
        candidates.push({x:target.x-width-gap,y:cy-height/2,width,height});
      }
      // A crowded drawing can always use a clear row below the occupied boxes.
      candidates.push({x:cx-width/2,y:Math.max(target.y+target.height,...occupied.map(b=>b.y+b.height))+16,width,height});
      let best, score = Infinity;
      for(const box of candidates){
        if(occupied.some(other=>overlap(box,other)>0)) continue;
        const clipped = viewport ? width*height-overlap(box,viewport) : 0;
        const distance = Math.hypot(box.x+width/2-cx,box.y+height/2-cy);
        const cost = clipped*100+distance;
        if(cost < score){ best=box;score=cost; }
      }
      result.set(item.id,best);
      occupied.push(pad(best));
    }
    return result;
  }
  root.MessageFlowLabels = Object.freeze({layoutLabels,layoutCallouts});
})(globalThis);
