(function(root){
  'use strict';
  function place(source,side,point,size,obstacles,grid=24){
    const {width,height}=size,gap=96,step=grid||24,round=n=>grid?Math.round(n/grid)*grid:n;
    const center=point || {x:source.x+source.width/2+(side==='right'?source.width/2+gap+width/2:side==='left'?-source.width/2-gap-width/2:0),
      y:source.y+source.height/2+(side==='bottom'?source.height/2+gap+height/2:side==='top'?-source.height/2-gap-height/2:0)};
    const initial={x:round(center.x-width/2),y:round(center.y-height/2),width,height};
    const occupied=obstacles.filter(c=>c.shape!=='package');
    const clear=box=>occupied.every(c=>box.x+width+24<=c.x || box.x>=c.x+c.width+24 || box.y+height+24<=c.y || box.y>=c.y+c.height+24);
    if(clear(initial))return initial;
    // Prefer keeping neighbours in the chosen row/column, then search nearby space.
    for(let ring=1;ring<=60;ring++){
      const offsets=point?[]:(['left','right'].includes(side)?[[0,-ring*step],[0,ring*step]]:[[-ring*step,0],[ring*step,0]]);
      for(let x=-ring;x<=ring;x++){
        const y=ring-Math.abs(x);offsets.push([x*step,y*step]);if(y)offsets.push([x*step,-y*step]);
      }
      for(const [dx,dy] of offsets){const candidate={...initial,x:initial.x+dx,y:initial.y+dy};if(clear(candidate))return candidate;}
    }
    return {...initial,y:Math.ceil((Math.max(source.y+source.height,...occupied.map(c=>c.y+c.height))+48)/step)*step};
  }
  root.MessageFlowConnectionPlacement=Object.freeze({place});
})(globalThis);
