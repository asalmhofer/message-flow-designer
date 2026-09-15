/* Data and geometry shared by the direct-open editor and tests. */
(function(root){
  'use strict';
  const entries = [
    ['umlComponent','Component','components','A modular part of a system, with a component symbol.',190,112],
    ['umlPort','Port','components','Attach an interaction point to a component boundary.',14,14],
    ['providedInterface','Provided interface','components','Attach a named lollipop interface to a component or port.',40,40],
    ['requiredInterface','Required interface','components','Attach a named socket interface to a component or port.',40,40],
    ['package','Package','components','A tabbed container. Moving it also moves its contents.',360,240],
    ['umlComment','Comment','components','A folded-corner annotation with an optional dashed link.',190,112],
    ['umlNode','Node','deployment','A deployment resource; choose device or execution environment in Properties.',210,132],
    ['umlArtifact','Artifact','deployment','A deployable file, executable, or other resource.',190,112],
    ['roundedRectangle','Rounded rectangle','basic','A general-purpose system or service.',170,90],
    ['rectangle','Rectangle','basic','A simple rectangular element.',170,90],
    ['text','Text','basic','A borderless title or annotation.',210,54],
    ['ellipse','Ellipse','basic','An oval element.',170,90],
    ['diamond','Diamond','basic','A general-purpose diamond.',130,110],
    ['cylinder','Database','basic','A conventional database cylinder.',170,100],
    ['queue','Queue','basic','A queue or stack of messages.',170,90],
    ['document','Document','basic','A document with a folded corner and a curved base.',170,100],
    ['note','Note','basic','A simple folded-corner note.',170,100],
    ['cloud','Cloud','basic','An external network or cloud service.',190,120],
    ['actor','Actor','basic','A person or external participant.',110,130],
    ['hexagon','Hexagon','basic','A six-sided element.',170,90],
    ['triangle','Triangle','basic','A triangular element.',130,110],
    ['pentagon','Pentagon','basic','A five-sided element.',140,110],
    ['trapezoid','Trapezoid','basic','A trapezoidal element.',170,90],
    ['parallelogram','Parallelogram','basic','A slanted rectangular element.',170,90]
  ].map(([id,name,category,description,width,height]) => Object.freeze({id,name,category,description,width,height}));
  const attached = shape => ['umlPort','providedInterface','requiredInterface'].includes(shape);
  const container = c => c?.shape === 'package';
  const canOwn = (owner, shape) => !!owner && (shape !== 'umlPort' && owner.shape === 'umlPort' || !attached(owner.shape) && !['package','text','note','document','umlComment','umlArtifact'].includes(owner.shape));
  const clamp = value => Math.max(0,Math.min(1,value));
  function boundary(owner, point){
    const candidates = [
      {side:'top',ratio:clamp((point.x-owner.x)/owner.width)},
      {side:'right',ratio:clamp((point.y-owner.y)/owner.height)},
      {side:'bottom',ratio:clamp((point.x-owner.x)/owner.width)},
      {side:'left',ratio:clamp((point.y-owner.y)/owner.height)}
    ];
    return candidates.map(a => ({...a,point:anchor(owner,a)})).sort((a,b) => Math.hypot(point.x-a.point.x,point.y-a.point.y)-Math.hypot(point.x-b.point.x,point.y-b.point.y))[0];
  }
  function anchor(owner, a){
    return {x:owner.x + (a.side === 'right' ? owner.width : a.side === 'left' ? 0 : owner.width*a.ratio),
      y:owner.y + (a.side === 'bottom' ? owner.height : a.side === 'top' ? 0 : owner.height*a.ratio)};
  }
  function sync(components){
    const byId = new Map(components.map(c => [c.id,c])), done = new Set();
    function visit(c){
      if(done.has(c.id)) return;
      done.add(c.id);
      const owner = byId.get(c.ownerId);
      if(!owner || !c.attachment) return;
      visit(owner);
      const p = anchor(owner,c.attachment), offset = c.shape === 'umlPort' ? 0 : 30;
      c.x = p.x + (c.attachment.side === 'right' ? offset : c.attachment.side === 'left' ? -offset : 0)-c.width/2;
      c.y = p.y + (c.attachment.side === 'bottom' ? offset : c.attachment.side === 'top' ? -offset : 0)-c.height/2;
    }
    components.forEach(visit);
  }
  function descendants(ids, components, includeContents=false){
    const result = new Set(ids);
    let changed = true;
    while(changed){
      changed = false;
      for(const c of components){
        if(result.has(c.id)) continue;
        const inside = includeContents && components.some(p => result.has(p.id) && container(p) && c.x+c.width/2 >= p.x && c.x+c.width/2 <= p.x+p.width && c.y+c.height/2 >= p.y && c.y+c.height/2 <= p.y+p.height);
        if(result.has(c.ownerId) || inside){result.add(c.id);changed=true;}
      }
    }
    return result;
  }
  const palettes = {blue:['#eef4ff','#6682b5'],teal:['#eaf7f4','#54867d'],violet:['#f3effc','#8a77af']};
  function style(theme='technical', palette='blue', shape=''){
    const [fill,border] = palettes[palette] || palettes.blue;
    return {fillColor:shape === 'text' ? 'transparent' : theme === 'soft' ? fill : '#ffffff',
      borderColor:shape === 'text' ? 'transparent' : theme === 'soft' ? border : theme === 'monochrome' ? '#242424' : '#475569',
      textColor:theme === 'monochrome' ? '#181818' : '#202b3c',borderWidth:shape === 'text' ? 0 : 1.5};
  }
  root.MessageFlowElements = Object.freeze({entries, attached, canOwn, boundary, anchor, sync, descendants, style,
    get:shape => entries.find(e => e.id === shape) || entries.find(e => e.id === 'roundedRectangle')});
})(globalThis);
