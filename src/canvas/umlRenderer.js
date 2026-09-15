/* UML glyphs use the same SVG geometry on the canvas, in the library, and in exports. */
(function(root){
  'use strict';
  function render(c, common, el){
    const {x,y,width:w,height:h} = c;
    const g = el('g', {class:'umlGlyph'});
    const add = (tag, attrs) => g.appendChild(el(tag,{...common,...attrs}));
    const line = d => add('path',{d,fill:'none',class:'umlDetail',stroke:common.stroke,'pointer-events':'none'});
    if(c.shape === 'umlComponent'){
      add('rect',{x,y,width:w,height:h,rx:2});
      line(`M${x+w-30},${y+12}h16v22h-16z M${x+w-34},${y+16}h8v5h-8z M${x+w-34},${y+25}h8v5h-8z`);
    }else if(c.shape === 'package'){
      const tab = Math.min(w-20,Math.max(100,w*.48)), th=28;
      add('path',{d:`M${x},${y+th}V${y}H${x+tab}V${y+th}H${x+w}V${y+h}H${x}Z`});
      line(`M${x},${y+th}H${x+tab}`);
    }else if(c.shape === 'umlNode'){
      const d = Math.min(16,w*.12,h*.15);
      add('path',{d:`M${x},${y+d}L${x+d},${y}H${x+w}V${y+h-d}L${x+w-d},${y+h}H${x}Z`});
      line(`M${x},${y+d}H${x+w-d}V${y+h} M${x+w-d},${y+d}L${x+w},${y}`);
    }else if(c.shape === 'umlArtifact'){
      add('rect',{x,y,width:w,height:h,rx:2});
      const ix=x+w-30,iy=y+10;
      line(`M${ix},${iy}h12l6,6v18h-18z M${ix+12},${iy}v6h6`);
    }else if(c.shape === 'umlComment'){
      const f=18;
      add('path',{d:`M${x},${y}H${x+w-f}L${x+w},${y+f}V${y+h}H${x}Z`});
      line(`M${x+w-f},${y}V${y+f}H${x+w}`);
    }else if(c.shape === 'umlPort'){
      add('rect',{x,y,width:w,height:h});
    }else if(['providedInterface','requiredInterface'].includes(c.shape)){
      const cx=x+w/2,cy=y+h/2,side=c.attachment?.side || 'right';
      const angle=({right:0,bottom:90,left:180,top:270})[side];
      g.setAttribute('transform',`rotate(${angle},${cx},${cy})`);
      add('circle',{cx,cy,r:18,fill:'transparent',stroke:'transparent',class:'attachmentHit'});
      line(`M${cx-30},${cy}H${cx-9}`);
      if(c.shape === 'providedInterface') add('circle',{cx,cy,r:9});
      else add('path',{d:`M${cx},${cy-10}A10,10 0 0 0 ${cx},${cy+10}`,fill:'none'});
    }else return null;
    return g;
  }
  root.MessageFlowUml = Object.freeze({render});
})(globalThis);
