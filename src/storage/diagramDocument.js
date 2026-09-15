/* Shared by the direct-open page, ES modules, and Node tests. No DOM dependency. */
(function(root){
  'use strict';
  const shapes = Object.freeze(['package','text','roundedRectangle','rectangle','ellipse','diamond','hexagon','triangle','pentagon','trapezoid','parallelogram','cylinder','queue','document','note','cloud','actor','umlComponent','umlPort','providedInterface','requiredInterface','umlNode','umlArtifact','umlComment']);
  const routes = ['straight', 'arc', 'angular'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function requireObject(value, label){
    if(!object(value)) throw new Error(`${label} must be an object.`);
  }
  function number(value, fallback, label, min = -Infinity, max = Infinity){
    if(value === undefined) return fallback;
    if(typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a number between ${min} and ${max}.`);
    return value;
  }
  function text(value, fallback, label){
    if(value === undefined || value === null) return fallback;
    if(typeof value !== 'string') throw new Error(`${label} must be text.`);
    return value;
  }
  function uniqueId(value, ids, label){
    if(typeof value !== 'string' || !value.trim()) throw new Error(`${label} needs an id.`);
    if(ids.has(value)) throw new Error(`Duplicate ${label} id: ${value}`);
    ids.add(value);
  }
  function point(value, label){
    requireObject(value, label);
    if(value.x === undefined || value.y === undefined) throw new Error(`${label} needs x and y coordinates.`);
    return { ...value, x:number(value.x, undefined, `${label} x`), y:number(value.y, undefined, `${label} y`) };
  }

  function normalizeDiagram(input){
    requireObject(input, 'Diagram');
    if(input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new Error(`Unsupported diagram schema version: ${input.schemaVersion}`);
    if(!Array.isArray(input.components)) throw new Error('Missing components array.');
    if(!Array.isArray(input.messageFlows)) throw new Error('Missing messageFlows array.');
    const data = copy(input);
    const ids = new Set();
    data.components = data.components.map((c, index) => {
      requireObject(c, `Component ${index + 1}`);
      uniqueId(c.id, ids, 'component');
      const shape = c.shape || 'roundedRectangle';
      if(!shapes.includes(shape)) throw new Error(`Unsupported shape: ${shape}`);
      if(c.x === undefined || c.y === undefined) throw new Error(`Component ${c.id} needs x and y coordinates.`);
      for(const field of ['fillColor','borderColor','textColor']) if(c[field] !== undefined) text(c[field], '', field);
      for(const field of ['fillOpacity','borderOpacity','textOpacity']) if(c[field] !== undefined) number(c[field], 1, field, 0, 1);
      if(c.borderWidth !== undefined) number(c.borderWidth, 1.5, 'Border width', 0, 50);
      if(c.fontSize !== undefined) number(c.fontSize, 14, 'Text size', 8, 96);
      if(c.fontWeight !== undefined && ![400,500,600,700].includes(c.fontWeight)) throw new Error('Unsupported text weight.');
      if(c.textAlign !== undefined && !['left','center','right'].includes(c.textAlign)) throw new Error('Unsupported text alignment.');
      if(c.borderStyle !== undefined && !['solid','dashed','dotted','none'].includes(c.borderStyle)) throw new Error('Unsupported border style.');
      return { ...c, shape, name:text(c.name, 'Component', 'Component name'),
        x:number(c.x, 0, 'Component x'), y:number(c.y, 0, 'Component y'),
        width:number(c.width, 160, 'Component width', 1), height:number(c.height, 80, 'Component height', 1),
        zIndex:number(c.zIndex, index + 1, 'Component layer') };
    });
    const byId = new Map(data.components.map(c => [c.id,c]));
    const attached = shape => ['umlPort','providedInterface','requiredInterface'].includes(shape);
    for(const c of data.components){
      for(const field of ['stereotype','details']) if(c[field] !== undefined) text(c[field], '', field);
      if(c.nodeKind !== undefined && !['node','device','executionEnvironment'].includes(c.nodeKind)) throw new Error('Unsupported deployment node kind.');
      if(attached(c.shape)){
        const owner=byId.get(c.ownerId);
        if(!owner || owner.id === c.id) throw new Error('Attached elements need an existing owner.');
        if(attached(owner.shape) && !(owner.shape === 'umlPort' && c.shape !== 'umlPort') || ['package','text','note','document','umlComment','umlArtifact'].includes(owner.shape)) throw new Error('Invalid owner for an attached element.');
        requireObject(c.attachment,'Attachment');
        if(!['top','right','bottom','left'].includes(c.attachment.side)) throw new Error('Invalid attachment side.');
        if(c.attachment.ratio === undefined) throw new Error('Attachment needs a ratio.');
        number(c.attachment.ratio,0.5,'Attachment ratio',0,1);
      }else if(c.ownerId !== undefined || c.attachment !== undefined) throw new Error('Only ports and interfaces can have an attachment.');
      if(c.annotatedElementId && (c.shape !== 'umlComment' || !byId.has(c.annotatedElementId) || c.annotatedElementId === c.id)) throw new Error('Comment annotation needs another existing element.');
    }
    const flowIds = new Set();
    const orders = new Set();
    data.messageFlows = data.messageFlows.map((f, index) => {
      requireObject(f, `Flow ${index + 1}`);
      uniqueId(f.id, flowIds, 'flow');
      if(!ids.has(f.sourceComponentId) || !ids.has(f.targetComponentId)) throw new Error(`Flow ${f.id} references a missing component.`);
      const order = f.sequenceNumber ?? index + 1;
      if(!String(order).trim() || !Number.isFinite(Number(order)) || Number(order) <= 0) throw new Error(`Flow ${f.id} needs a positive sequence number.`);
      if(orders.has(Number(order))) throw new Error(`Duplicate sequence number: ${order}`);
      orders.add(Number(order));
      if(f.connectionStyle !== undefined && !routes.includes(f.connectionStyle)) throw new Error(`Unsupported connection style: ${f.connectionStyle}`);
      if(f.timing !== undefined && !['withPrevious', 'afterPrevious'].includes(f.timing)) throw new Error(`Unsupported flow timing: ${f.timing}`);
      if(f.style !== undefined) requireObject(f.style, 'Flow style');
      for(const field of ['color','textColor']) if(f.style?.[field] !== undefined) text(f.style[field], '', field);
      for(const field of ['opacity','textOpacity']) if(f.style?.[field] !== undefined) number(f.style[field], 1, field, 0, 1);
      if(f.style?.lineStyle !== undefined && !['solid','dashed','dotted','none'].includes(f.style.lineStyle)) throw new Error('Unsupported line style.');
      if(f.hiddenInDrawingMode !== undefined && typeof f.hiddenInDrawingMode !== 'boolean') throw new Error('Connector visibility must be true or false.');
      if(f.style?.thickness !== undefined) number(f.style.thickness, 2.2, 'Line thickness', 0.1);
      const image = text(f.processingImageDataUrl, '', 'Processing image');
      if(image && !/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(image)) throw new Error('Processing images must be embedded image data.');
      return { ...f, sequenceNumber:order, connectionStyle:f.connectionStyle || 'arc',
        timing:f.timing || 'afterPrevious', hiddenInDrawingMode:f.hiddenInDrawingMode ?? (f.visibleInEditor === false),
        messageText:text(f.messageText, '', 'Message'), actionText:text(f.actionText, '', 'Processing action'),
        notes:text(f.notes, '', 'Notes'), processingImageDataUrl:image,
        sourcePortId:text(f.sourcePortId, '', 'Source port'), targetPortId:text(f.targetPortId, '', 'Target port'),
        ...(f.controlPoint ? { controlPoint:point(f.controlPoint, 'Control point') } : {}),
        ...(f.labelOffset != null ? { labelOffset:point(f.labelOffset, 'Label offset') } : {}) };
    });
    if(data.settings !== undefined) requireObject(data.settings, 'Settings');
    const settings = data.settings || {};
    for(const field of ['showGrid','snapToGrid','flowPanelOpen','presentationImagePanelOpen','showInactiveConnectionsInPresentation','showTokenMessageInPresentation','showProcessingActionInPresentation','loopAnimation','focusSelectedFlow']){
      if(settings[field] !== undefined && typeof settings[field] !== 'boolean') throw new Error(`${field} must be true or false.`);
    }
    for(const [field, allowed] of Object.entries({ diagramTheme:['technical','soft','monochrome','custom'], diagramPalette:['blue','teal','violet'], animationMode:['step','auto'], defaultShape:shapes, defaultConnectionStyle:routes, activeCanvasMode:['select','pan','connect'] })){
      if(settings[field] !== undefined && !allowed.includes(settings[field])) throw new Error(`Unsupported ${field}: ${settings[field]}`);
    }
    const speed = settings.animationSpeed;
    if(speed !== undefined && !['slow','normal','fast'].includes(speed)) number(speed, 50, 'Animation speed', 1, 100);
    data.settings = { ...settings,
      zoom:number(settings.zoom, 1, 'Zoom', 0.2, 3.2), panX:number(settings.panX, 80, 'Pan x'), panY:number(settings.panY, 70, 'Pan y'),
      flowPanelWidth:number(settings.flowPanelWidth, 390, 'Flow panel width', 280, 620) };
    data.schemaVersion = 1;
    // Selection and presentation are session state, never an instruction in a file.
    data.ui = { selectedComponentIds:[], selectedFlowId:null, expandedFlowId:null, presentationMode:false };
    return data;
  }

  function createAutosaveRepository(getStorage, key){
    let previous = null;
    let recovery = null;
    function load(){
      const storage = getStorage();
      const raw = storage.getItem(key);
      if(!raw) return { document:null };
      try{
        const document = normalizeDiagram(JSON.parse(raw));
        previous = raw;
        return { document };
      }catch(error){
        recovery = raw;
        try{
          const backup = storage.getItem(`${key}.backup`);
          if(backup){
            const document = normalizeDiagram(JSON.parse(backup));
            previous = backup;
            return { document, error, recovered:true };
          }
        }catch{ /* Keep the original bytes available even if the backup is invalid. */ }
        return { document:null, error, recovered:false };
      }
    }
    function save(document){
      if(recovery !== null) throw new Error('Autosave paused: download recovery data or resume autosave.');
      const raw = JSON.stringify(normalizeDiagram(document));
      if(raw === previous) return;
      const storage = getStorage();
      if(previous !== null) storage.setItem(`${key}.backup`, previous);
      storage.setItem(key, raw);
      previous = raw;
    }
    function resume(document){
      if(recovery !== null){
        // Do not replace the damaged original until its recovery copy is stored.
        getStorage().setItem(`${key}.recovery`, recovery);
        recovery = null;
      }
      save(document);
    }
    return { load, save, resume, recoveryText:() => recovery };
  }
  root.MessageFlowDocuments = Object.freeze({ shapes, normalizeDiagram, createAutosaveRepository });
})(globalThis);
